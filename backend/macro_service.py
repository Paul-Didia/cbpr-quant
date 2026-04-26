"""
Macro market status service for CBPR Quant.

This script is designed to be executed by a scheduled job every 4 hours.
It fetches free macro market proxies, computes a simple regional status,
and optionally writes the result to Supabase when credentials are available.

V1 regions:
- US: VIX level from FRED CSV
- Europe: Euro Stoxx 50 proxy from Yahoo Chart API
- Asia: Nikkei 225 proxy from Yahoo Chart API

Important: this V1 does not use Twelve Data and does not use the VIX/VSTOXX futures curve yet.
Yahoo Chart API is used as a free market proxy source for Europe and Asia.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

MacroStatus = Literal["favorable", "neutral", "risk"]

FRED_VIX_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS"
YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_EUROPE_PROXY_SYMBOL = os.getenv("MACRO_EUROPE_PROXY_SYMBOL", "^STOXX50E")
YAHOO_ASIA_PROXY_SYMBOL = os.getenv("MACRO_ASIA_PROXY_SYMBOL", "^N225")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

SUPABASE_MACRO_TABLE = os.getenv("SUPABASE_MACRO_TABLE", "macro_market_status")


class MacroServiceError(Exception):
    """Raised when macro data cannot be fetched or parsed."""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def status_from_percent_change(percent_change: float) -> MacroStatus:
    """
    Simple proxy status for index-based regions.

    This is intentionally conservative:
    - positive daily move = favorable
    - negative daily move = risk
    - flat move = neutral
    """
    if percent_change >= 0.25:
        return "favorable"
    if percent_change <= -0.25:
        return "risk"
    return "neutral"


def fetch_csv_lines(url: str) -> list[str]:
    response = requests.get(
        url,
        timeout=15,
        headers={"User-Agent": "CBPR-Quant-Macro-Service/1.0"},
    )
    response.raise_for_status()
    return [line.strip() for line in response.text.splitlines() if line.strip()]


def parse_last_numeric_csv_value(lines: list[str], value_column_name: str) -> tuple[str, float]:
    """
    Parse the last valid numeric value from a simple CSV feed.

    Expected format example:
    DATE,VIXCLS
    2026-04-24,14.92
    """
    if len(lines) < 2:
        raise MacroServiceError("CSV response does not contain enough rows.")

    headers = [header.strip() for header in lines[0].split(",")]
    try:
        value_index = headers.index(value_column_name)
    except ValueError as exc:
        raise MacroServiceError(f"Column {value_column_name} not found in CSV headers: {headers}") from exc

    date_index = 0

    for raw_line in reversed(lines[1:]):
        columns = [column.strip() for column in raw_line.split(",")]
        if len(columns) <= value_index:
            continue

        date = columns[date_index]
        value = safe_float(columns[value_index])
        if value is not None:
            return date, value

    raise MacroServiceError(f"No valid numeric value found for column {value_column_name}.")



def fetch_yahoo_chart_closes(symbol: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Fetch the last valid daily closes from Yahoo Chart API.

    This is used only as a free proxy source for regional macro climate.
    """
    response = requests.get(
        f"{YAHOO_CHART_BASE_URL}/{symbol}",
        params={"range": "10d", "interval": "1d"},
        timeout=15,
        headers={"User-Agent": "CBPR-Quant-Macro-Service/1.0"},
    )
    response.raise_for_status()
    data = response.json()

    try:
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError) as exc:
        raise MacroServiceError(f"Unable to parse Yahoo chart response for {symbol}.") from exc

    valid_rows: list[dict[str, Any]] = []
    for timestamp, close in zip(timestamps, closes):
        close_value = safe_float(close)
        if close_value is None:
            continue

        date = datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat()
        valid_rows.append({"date": date, "close": close_value})

    if len(valid_rows) < 2:
        raise MacroServiceError(f"Unable to parse two valid close values from Yahoo chart for {symbol}.")

    return valid_rows[-2], valid_rows[-1]


def compute_us_macro_status() -> Dict[str, Any]:
    """
    Compute US macro status from VIX level using FRED.

    V1 rule:
    - VIX < 18: favorable
    - 18 <= VIX < 25: neutral
    - VIX >= 25: risk
    """
    lines = fetch_csv_lines(FRED_VIX_CSV_URL)
    date, vix_level = parse_last_numeric_csv_value(lines, "VIXCLS")

    if vix_level < 18:
        status: MacroStatus = "favorable"
    elif vix_level < 25:
        status = "neutral"
    else:
        status = "risk"

    return {
        "region": "us",
        "label": "US",
        "status": status,
        "regime": "vix_level",
        "source": "FRED VIXCLS",
        "value": {
            "date": date,
            "vix": vix_level,
        },
        "updated_at": utc_now_iso(),
    }



def compute_yahoo_index_proxy_status(
    region: str,
    label: str,
    source_name: str,
    symbol: str,
) -> Dict[str, Any]:
    previous_row, latest_row = fetch_yahoo_chart_closes(symbol)

    previous_close = previous_row["close"]
    latest_close = latest_row["close"]
    percent_change = ((latest_close - previous_close) / previous_close) * 100 if previous_close else 0
    status = status_from_percent_change(percent_change)

    return {
        "region": region,
        "label": label,
        "status": status,
        "regime": "index_proxy",
        "source": source_name,
        "value": {
            "symbol": symbol,
            "date": latest_row["date"],
            "previous_close": previous_close,
            "close": latest_close,
            "percent_change": round(percent_change, 4),
        },
        "updated_at": utc_now_iso(),
    }


def compute_all_macro_statuses() -> Dict[str, Dict[str, Any]]:
    """
    Compute macro statuses for all supported regions.

    If one region fails, it is returned as neutral with an error field.
    This prevents the whole cron job from failing because one provider is down.
    """
    regions = {
        "us": lambda: compute_us_macro_status(),
        "europe": lambda: compute_yahoo_index_proxy_status(
            "europe",
            "Europe",
            "Yahoo Euro Stoxx 50 proxy",
            YAHOO_EUROPE_PROXY_SYMBOL,
        ),
        "asia": lambda: compute_yahoo_index_proxy_status(
            "asia",
            "Asie",
            "Yahoo Nikkei 225 proxy",
            YAHOO_ASIA_PROXY_SYMBOL,
        ),
    }

    results: Dict[str, Dict[str, Any]] = {}

    for region, compute in regions.items():
        try:
            results[region] = compute()
        except Exception as exc:  # Keep cron resilient.
            results[region] = {
                "region": region,
                "label": "US" if region == "us" else "Europe" if region == "europe" else "Asie",
                "status": "neutral",
                "regime": "unavailable",
                "source": "fallback",
                "value": None,
                "error": str(exc),
                "updated_at": utc_now_iso(),
            }

    return results


def upsert_macro_statuses_to_supabase(statuses: Dict[str, Dict[str, Any]]) -> None:
    """
    Upsert computed statuses into Supabase.

    Expected Supabase table columns:
    - region text primary key
    - label text
    - status text
    - regime text
    - source text
    - value jsonb
    - error text nullable
    - updated_at timestamptz
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[MACRO] Supabase credentials missing. Skipping database write.")
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{SUPABASE_MACRO_TABLE}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    payload = list(statuses.values())

    response = requests.post(
        url,
        headers=headers,
        params={"on_conflict": "region"},
        json=payload,
        timeout=15,
    )
    response.raise_for_status()
    print(f"[MACRO] Upserted {len(payload)} macro statuses into Supabase.")


def run_macro_refresh(write_to_supabase: bool = True) -> Dict[str, Dict[str, Any]]:
    statuses = compute_all_macro_statuses()

    if write_to_supabase:
        upsert_macro_statuses_to_supabase(statuses)

    return statuses


if __name__ == "__main__":
    result = run_macro_refresh(write_to_supabase=True)
    print(json.dumps(result, indent=2, ensure_ascii=False))
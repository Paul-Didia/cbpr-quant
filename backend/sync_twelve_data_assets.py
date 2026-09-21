#!/usr/bin/env python3
"""Importe dans Supabase les actions, ETF et cryptomonnaies pris en charge.

Variables requises :
  TWELVE_DATA_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

La clé Twelve Data et la clé service_role restent exclusivement côté backend.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any


TWELVE_DATA_BASE_URL = "https://api.twelvedata.com"
PAGE_SIZE = 5_000
UPSERT_BATCH_SIZE = 500
ALLOWED_STOCK_PLANS = {"basic", "grow"}
ALLOWED_EQUITY_MIC_CODES = {
    "XNAS",  # Nasdaq consolidated
    "XNGS",  # Nasdaq Global Select
    "XNMS",  # Nasdaq Global Market
    "XNCM",  # Nasdaq Capital Market
    "XNYS",  # New York Stock Exchange
    "XPAR",  # Euronext Paris
    "XLON",  # London Stock Exchange
}


def tls_context() -> ssl.SSLContext:
    """Utilise le magasin de certificats livré avec Python quand disponible."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


TLS_CONTEXT = tls_context()


def safe_url(url: str) -> str:
    """Masque les paramètres sensibles avant tout affichage dans les logs."""
    parsed = urllib.parse.urlsplit(url)
    parameters = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    masked = [
        (name, "***" if name.lower() in {"apikey", "api_key", "token", "key"} else value)
        for name, value in parameters
    ]
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(masked), parsed.fragment)
    )


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variable manquante : {name}")
    return value.rstrip("/")


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: Any | None = None,
    attempts: int = 4,
) -> Any:
    encoded_body = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded_body,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )

    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=90, context=TLS_CONTEXT) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt == attempts - 1:
                raise RuntimeError(
                    f"HTTP {error.code} pour {safe_url(url)}: {details}"
                ) from error
        except urllib.error.URLError as error:
            if attempt == attempts - 1:
                raise RuntimeError(
                    f"Connexion impossible pour {safe_url(url)}: {error}"
                ) from error

        time.sleep(2**attempt)

    raise RuntimeError(f"Échec inattendu pour {safe_url(url)}")


def fetch_catalog(endpoint: str, api_key: str, **parameters: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    previous_signature: tuple[str, str, int] | None = None

    for page in range(1, 501):
        query = urllib.parse.urlencode(
            {
                "apikey": api_key,
                "page": page,
                "outputsize": PAGE_SIZE,
                **parameters,
            }
        )
        payload = request_json(f"{TWELVE_DATA_BASE_URL}/{endpoint}?{query}")

        if not isinstance(payload, dict) or payload.get("status") == "error":
            raise RuntimeError(f"Réponse Twelve Data invalide pour /{endpoint}: {payload}")

        page_records = payload.get("data") or []
        if not isinstance(page_records, list):
            raise RuntimeError(f"Format de catalogue inattendu pour /{endpoint}")
        if not page_records:
            break

        first_symbol = str(page_records[0].get("symbol", ""))
        last_symbol = str(page_records[-1].get("symbol", ""))
        signature = (first_symbol, last_symbol, len(page_records))
        if signature == previous_signature:
            break

        records.extend(record for record in page_records if isinstance(record, dict))
        previous_signature = signature

        reported_count = payload.get("count")
        if isinstance(reported_count, int) and len(records) >= reported_count:
            break
        if len(page_records) < PAGE_SIZE and not isinstance(reported_count, int):
            break

    return records


def fetch_grow_etfs(api_key: str) -> list[dict[str, Any]]:
    """Retourne les ETF exposés par l'annuaire pour un abonnement Grow.

    Twelve Data limite Basic, Grow et Pro aux 50 premières fiches de cet
    annuaire ; demander la page suivante renvoie volontairement HTTP 403.
    """
    query = urllib.parse.urlencode(
        {"apikey": api_key, "page": 1, "outputsize": 50}
    )
    payload = request_json(f"{TWELVE_DATA_BASE_URL}/etfs/list?{query}")
    result = payload.get("result") if isinstance(payload, dict) else None
    records = result.get("list") if isinstance(result, dict) else None
    if not isinstance(records, list):
        raise RuntimeError("Format de catalogue inattendu pour /etfs/list")
    return [record for record in records if isinstance(record, dict)]


def clean_text(value: Any, fallback: str = "") -> str:
    text = str(value or fallback).strip()
    return " ".join(text.split())


def stock_asset(record: dict[str, Any], checked_at: str) -> dict[str, Any] | None:
    access = record.get("access") or {}
    required_plan = clean_text(access.get("plan"))
    if required_plan.lower() not in ALLOWED_STOCK_PLANS:
        return None

    symbol = clean_text(record.get("symbol"))
    name = clean_text(record.get("name"), symbol)
    mic_code = clean_text(record.get("mic_code"))
    if not symbol or not name or mic_code not in ALLOWED_EQUITY_MIC_CODES:
        return None

    raw_type = clean_text(record.get("type"))
    asset_type = "etf" if "etf" in raw_type.lower() else "stock"
    return {
        "symbol": symbol,
        "name": name,
        "exchange": clean_text(record.get("exchange")),
        "mic_code": mic_code,
        "asset_type": asset_type,
        "country": clean_text(record.get("country")) or None,
        "twelve_data_required_plan": required_plan,
        "twelve_data_accessible": True,
        "cbpr_validated": True,
        "is_available": True,
        "access_checked_at": checked_at,
        "updated_at": checked_at,
    }


def pair_name(record: dict[str, Any], symbol: str) -> str:
    base = clean_text(record.get("currency_base"))
    quote = clean_text(record.get("currency_quote"))
    if base and quote:
        return f"{base} / {quote}"
    return symbol


def pair_asset(
    record: dict[str, Any],
    *,
    asset_type: str,
    required_plan: str,
    checked_at: str,
) -> dict[str, Any] | None:
    symbol = clean_text(record.get("symbol"))
    if not symbol:
        return None

    return {
        "symbol": symbol,
        "name": clean_text(record.get("name"), pair_name(record, symbol)),
        "exchange": "",
        "mic_code": None,
        "asset_type": asset_type,
        "country": None,
        "twelve_data_required_plan": required_plan,
        "twelve_data_accessible": True,
        "cbpr_validated": True,
        "is_available": True,
        "access_checked_at": checked_at,
        "updated_at": checked_at,
    }


def etf_asset(
    record: dict[str, Any],
    exchange_plans: dict[str, str],
    checked_at: str,
) -> dict[str, Any] | None:
    symbol = clean_text(record.get("symbol"))
    name = clean_text(record.get("name"), symbol)
    mic_code = clean_text(record.get("mic_code"))
    required_plan = exchange_plans.get(mic_code, "")
    if (
        not symbol
        or not name
        or mic_code not in ALLOWED_EQUITY_MIC_CODES
        or required_plan.lower() not in ALLOWED_STOCK_PLANS
    ):
        return None

    return {
        "symbol": symbol,
        "name": name,
        "exchange": mic_code,
        "mic_code": mic_code or None,
        "asset_type": "etf",
        "country": clean_text(record.get("country")) or None,
        "twelve_data_required_plan": required_plan,
        "twelve_data_accessible": True,
        "cbpr_validated": True,
        "is_available": True,
        "access_checked_at": checked_at,
        "updated_at": checked_at,
    }


def deduplicate(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for asset in assets:
        key = (asset["symbol"], asset["exchange"], asset["asset_type"])
        unique[key] = asset
    return sorted(unique.values(), key=lambda item: (item["name"], item["symbol"]))


def upsert_assets(
    supabase_url: str,
    service_role_key: str,
    assets: list[dict[str, Any]],
) -> None:
    table = urllib.parse.quote("assets_iOS", safe="")
    url = (
        f"{supabase_url}/rest/v1/{table}"
        "?on_conflict=symbol%2Cexchange%2Casset_type"
    )
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    for offset in range(0, len(assets), UPSERT_BATCH_SIZE):
        batch = assets[offset : offset + UPSERT_BATCH_SIZE]
        request_json(url, method="POST", headers=headers, body=batch)
        completed = min(offset + len(batch), len(assets))
        print(f"Supabase : {completed}/{len(assets)} actifs synchronisés", flush=True)


def main() -> int:
    api_key = required_environment("TWELVE_DATA_API_KEY")
    supabase_url = required_environment("SUPABASE_URL")
    service_role_key = required_environment("SUPABASE_SERVICE_ROLE_KEY")
    checked_at = datetime.now(timezone.utc).isoformat()

    print("Téléchargement du catalogue Twelve Data Grow…", flush=True)
    stocks = fetch_catalog("stocks", api_key, show_plan="true")
    exchanges = fetch_catalog("exchanges", api_key, show_plan="true")
    etfs = fetch_grow_etfs(api_key)
    crypto = fetch_catalog("cryptocurrencies", api_key)

    assets: list[dict[str, Any]] = []
    exchange_plans = {
        clean_text(record.get("code")): clean_text((record.get("access") or {}).get("plan"))
        for record in exchanges
        if clean_text(record.get("code"))
    }
    assets.extend(
        asset
        for record in stocks
        if (asset := stock_asset(record, checked_at)) is not None
    )
    assets.extend(
        asset
        for record in etfs
        if (asset := etf_asset(record, exchange_plans, checked_at)) is not None
    )
    assets.extend(
        asset
        for record in crypto
        if (
            asset := pair_asset(
                record,
                asset_type="crypto",
                required_plan="Basic",
                checked_at=checked_at,
            )
        )
        is not None
    )
    assets = deduplicate(assets)
    if not assets:
        raise RuntimeError("Aucun actif Grow n’a été trouvé ; synchronisation annulée.")

    print(
        f"Catalogue retenu : {len(assets)} actifs "
        f"({len(stocks)} actions brutes, {len(etfs)} ETF Grow, "
        f"{len(crypto)} cryptomonnaies)",
        flush=True,
    )
    upsert_assets(supabase_url, service_role_key, assets)
    print("Synchronisation terminée.", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Erreur : {error}", file=sys.stderr)
        raise SystemExit(1)

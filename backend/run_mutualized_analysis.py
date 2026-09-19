#!/usr/bin/env python3
"""Analyse une seule fois chaque actif présent dans les favoris iOS.

Ce script est conçu pour un Render Cron Job. Il interroge le moteur CBPR
historique une fois par actif unique, compacte sa réponse, puis l'enregistre
dans Supabase. Un événement est créé uniquement lors d'un changement de signal.

Variables requises :
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Variables facultatives :
  ANALYSIS_API_BASE_URL          (défaut: ancien service Render CBPR)
  CBPR_TIMEFRAME                 (défaut: 4h)
  CBPR_OUTPUTSIZE                (défaut: 300)
  CBPR_MODEL_VERSION             (défaut: cbpr-v1)
  CBPR_STORE_CHART               (défaut: false)
  CBPR_DELAY_BETWEEN_ASSETS      (défaut: 0.25 seconde)
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
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable


DEFAULT_ANALYSIS_API_BASE_URL = "https://cbpr-quant-api.onrender.com"
REST_PAGE_SIZE = 1_000
ASSET_QUERY_BATCH_SIZE = 100


def tls_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


TLS_CONTEXT = tls_context()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variable manquante : {name}")
    return value.rstrip("/")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


SUPABASE_URL = env_required("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = env_required("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_API_BASE_URL = os.environ.get(
    "ANALYSIS_API_BASE_URL", DEFAULT_ANALYSIS_API_BASE_URL
).strip().rstrip("/")
TIMEFRAME = os.environ.get("CBPR_TIMEFRAME", "4h").strip() or "4h"
OUTPUTSIZE = max(200, int(os.environ.get("CBPR_OUTPUTSIZE", "300")))
MODEL_VERSION = os.environ.get("CBPR_MODEL_VERSION", "cbpr-v1").strip() or "cbpr-v1"
STORE_CHART = env_bool("CBPR_STORE_CHART", False)
DELAY_BETWEEN_ASSETS = max(
    0.0, float(os.environ.get("CBPR_DELAY_BETWEEN_ASSETS", "0.25"))
)


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: Any | None = None,
    attempts: int = 4,
) -> Any:
    encoded_body = None if body is None else json.dumps(body).encode("utf-8")

    for attempt in range(attempts):
        request = urllib.request.Request(
            url,
            data=encoded_body,
            method=method,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        try:
            with urllib.request.urlopen(request, timeout=120, context=TLS_CONTEXT) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            retryable = error.code in {408, 425, 429, 500, 502, 503, 504}
            if not retryable or attempt == attempts - 1:
                raise RuntimeError(f"HTTP {error.code}: {details}") from error
        except urllib.error.URLError as error:
            if attempt == attempts - 1:
                raise RuntimeError(f"Connexion impossible : {error}") from error

        time.sleep(2**attempt)

    raise RuntimeError("Échec HTTP inattendu")


def supabase_headers(*, representation: bool = False) -> dict[str, str]:
    preference = "return=representation" if representation else "return=minimal"
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Prefer": preference,
    }


def supabase_url(table: str, parameters: dict[str, str] | None = None) -> str:
    query = urllib.parse.urlencode(parameters or {}, safe="(),.*")
    suffix = f"?{query}" if query else ""
    return f'{SUPABASE_URL}/rest/v1/{urllib.parse.quote(table, safe="")}{suffix}'


def chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def fetch_all_favorite_asset_ids() -> list[str]:
    asset_ids: set[str] = set()

    for offset in range(0, 1_000_000, REST_PAGE_SIZE):
        headers = {
            **supabase_headers(),
            "Range": f"{offset}-{offset + REST_PAGE_SIZE - 1}",
        }
        rows = request_json(
            supabase_url("favorites_iOS", {"select": "asset_id"}),
            headers=headers,
        )
        if not isinstance(rows, list):
            raise RuntimeError("Réponse favorites_iOS invalide")

        for row in rows:
            asset_id = str(row.get("asset_id", "")).strip()
            if asset_id:
                asset_ids.add(asset_id)

        if len(rows) < REST_PAGE_SIZE:
            break

    return sorted(asset_ids)


def fetch_assets(asset_ids: list[str]) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    fields = "id,symbol,name,exchange,mic_code,asset_type"

    for batch in chunks(asset_ids, ASSET_QUERY_BATCH_SIZE):
        identifier_filter = f"in.({','.join(batch)})"
        rows = request_json(
            supabase_url(
                "assets_iOS",
                {
                    "select": fields,
                    "id": identifier_filter,
                    "twelve_data_accessible": "eq.true",
                    "cbpr_validated": "eq.true",
                },
            ),
            headers=supabase_headers(),
        )
        if not isinstance(rows, list):
            raise RuntimeError("Réponse assets_iOS invalide")
        assets.extend(row for row in rows if isinstance(row, dict))

    return sorted(assets, key=lambda item: str(item.get("symbol", "")))


def fetch_analysis(symbol: str, asset: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode({"interval": TIMEFRAME, "outputsize": OUTPUTSIZE})
    encoded_symbol = urllib.parse.quote(symbol, safe="")
    headers = {
        "X-CBPR-Asset-Name": str(asset.get("name", "")),
        "X-CBPR-Exchange": str(asset.get("exchange", "")),
    }
    payload = request_json(
        f"{ANALYSIS_API_BASE_URL}/analysis/{encoded_symbol}?{query}",
        headers=headers,
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Réponse d'analyse invalide")
    return payload


def source_candle_datetime(response: dict[str, Any]) -> str:
    values = response.get("values")
    if isinstance(values, list) and values:
        value = values[-1]
        if isinstance(value, dict):
            result = str(value.get("datetime", "")).strip()
            if result:
                return result
    raise RuntimeError("La réponse ne contient aucune bougie source")


def latest_result(asset_id: str) -> dict[str, Any] | None:
    rows = request_json(
        supabase_url(
            "analysis_results_iOS",
            {
                "select": "id,signal,score,source_candle_datetime,analyzed_at",
                "asset_id": f"eq.{asset_id}",
                "timeframe": f"eq.{TIMEFRAME}",
                "model_version": f"eq.{MODEL_VERSION}",
                "order": "analyzed_at.desc",
                "limit": "1",
            },
        ),
        headers=supabase_headers(),
    )
    if not isinstance(rows, list):
        raise RuntimeError("Réponse analysis_results_iOS invalide")
    return rows[0] if rows else None


def compact_payload(response: dict[str, Any]) -> dict[str, Any]:
    analysis = response.get("analysis")
    if not isinstance(analysis, dict):
        raise RuntimeError("Bloc analysis absent")

    payload: dict[str, Any] = {
        "model": MODEL_VERSION,
        "explanation": analysis.get("explanation") or {},
        "indicators": analysis.get("indicators") or {},
        "quote": response.get("quote") or {},
        "meta": response.get("meta") or {},
    }
    if STORE_CHART:
        payload["chart"] = response.get("values") or []
    return payload


def insert_run(asset_id: str) -> str:
    run_id = str(uuid.uuid4())
    request_json(
        supabase_url("analysis_runs_iOS"),
        method="POST",
        headers=supabase_headers(),
        body={
            "id": run_id,
            "asset_id": asset_id,
            "timeframe": TIMEFRAME,
            "status": "running",
        },
    )
    return run_id


def finish_run(
    run_id: str,
    *,
    started_monotonic: float,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
) -> None:
    duration_ms = max(0, round((time.monotonic() - started_monotonic) * 1_000))
    request_json(
        supabase_url("analysis_runs_iOS", {"id": f"eq.{run_id}"}),
        method="PATCH",
        headers=supabase_headers(),
        body={
            "status": status,
            "finished_at": utc_now(),
            "duration_ms": duration_ms,
            "error_code": error_code,
            "error_message": error_message,
        },
    )


def insert_result(
    *,
    run_id: str,
    asset_id: str,
    signal: str,
    score: int,
    previous_signal: str | None,
    source_datetime: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    rows = request_json(
        supabase_url("analysis_results_iOS"),
        method="POST",
        headers=supabase_headers(representation=True),
        body={
            "run_id": run_id,
            "asset_id": asset_id,
            "timeframe": TIMEFRAME,
            "model_version": MODEL_VERSION,
            "source_candle_datetime": source_datetime,
            "signal": signal,
            "previous_signal": previous_signal,
            "score": score,
            "payload": payload,
            "analyzed_at": utc_now(),
        },
    )
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Insertion analysis_results_iOS sans représentation")
    return rows[0]


def insert_signal_event(
    *,
    result_id: str,
    asset_id: str,
    source_datetime: str,
    previous_signal: str,
    new_signal: str,
    score: int,
) -> None:
    request_json(
        supabase_url("signal_events_iOS"),
        method="POST",
        headers={**supabase_headers(), "Prefer": "return=minimal,resolution=ignore-duplicates"},
        body={
            "analysis_result_id": result_id,
            "asset_id": asset_id,
            "timeframe": TIMEFRAME,
            "model_version": MODEL_VERSION,
            "source_candle_datetime": source_datetime,
            "previous_signal": previous_signal,
            "new_signal": new_signal,
            "score": score,
        },
    )


def analyze_asset(asset: dict[str, Any]) -> str:
    asset_id = str(asset["id"])
    symbol = str(asset["symbol"])
    started_monotonic = time.monotonic()
    run_id = insert_run(asset_id)

    try:
        response = fetch_analysis(symbol, asset)
        analysis = response.get("analysis") or {}
        signal = str(analysis.get("signal", "NEUTRE")).strip().upper() or "NEUTRE"
        score = max(0, min(100, int(analysis.get("score", 0) or 0)))
        source_datetime = source_candle_datetime(response)
        previous = latest_result(asset_id)

        if previous and previous.get("source_candle_datetime") == source_datetime:
            finish_run(
                run_id,
                started_monotonic=started_monotonic,
                status="succeeded",
            )
            return "unchanged_candle"

        previous_signal = str(previous.get("signal", "")) if previous else None
        result = insert_result(
            run_id=run_id,
            asset_id=asset_id,
            signal=signal,
            score=score,
            previous_signal=previous_signal,
            source_datetime=source_datetime,
            payload=compact_payload(response),
        )

        if previous_signal and previous_signal != signal:
            insert_signal_event(
                result_id=str(result["id"]),
                asset_id=asset_id,
                source_datetime=source_datetime,
                previous_signal=previous_signal,
                new_signal=signal,
                score=score,
            )

        finish_run(
            run_id,
            started_monotonic=started_monotonic,
            status="succeeded",
        )
        return "signal_changed" if previous_signal and previous_signal != signal else "stored"
    except Exception as error:
        message = str(error)[:2_000]
        finish_run(
            run_id,
            started_monotonic=started_monotonic,
            status="failed",
            error_code=type(error).__name__,
            error_message=message,
        )
        raise


def main() -> int:
    favorite_asset_ids = fetch_all_favorite_asset_ids()
    if not favorite_asset_ids:
        print("Aucun favori : aucune analyse à lancer.")
        return 0

    assets = fetch_assets(favorite_asset_ids)
    print(
        f"Analyse mutualisée de {len(assets)} actif(s) unique(s) "
        f"sur {TIMEFRAME}, modèle {MODEL_VERSION}."
    )

    succeeded = 0
    failed = 0
    changed = 0

    for index, asset in enumerate(assets, start=1):
        symbol = str(asset.get("symbol", "?"))
        try:
            outcome = analyze_asset(asset)
            succeeded += 1
            if outcome == "signal_changed":
                changed += 1
            print(f"[{index}/{len(assets)}] {symbol}: {outcome}")
        except Exception as error:
            failed += 1
            print(f"[{index}/{len(assets)}] {symbol}: erreur: {error}", file=sys.stderr)

        if index < len(assets) and DELAY_BETWEEN_ASSETS:
            time.sleep(DELAY_BETWEEN_ASSETS)

    print(
        f"Terminé : {succeeded} succès, {failed} échec(s), "
        f"{changed} changement(s) de signal."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())


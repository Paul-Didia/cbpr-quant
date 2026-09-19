#!/usr/bin/env python3
"""Place les favoris dont le cache est périmé dans la file mutualisée.

Ce cron ne contacte jamais Twelve Data et ne calcule aucune analyse. Le worker
de cbpr-quant-api consomme ensuite la file avec une cadence centralisée.

Variables requises :
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Variables facultatives :
  CBPR_TIMEFRAME          (défaut: 4h)
  CBPR_MODEL_VERSION      (défaut: cbpr-v1)
  CBPR_CACHE_MAX_AGE      (défaut: 4 hours, syntaxe interval PostgreSQL)
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from typing import Any


def tls_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


TLS_CONTEXT = tls_context()


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variable manquante : {name}")
    return value.rstrip("/")


SUPABASE_URL = env_required("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = "".join(
    env_required("SUPABASE_SERVICE_ROLE_KEY").split()
)
TIMEFRAME = os.environ.get("CBPR_TIMEFRAME", "4h").strip() or "4h"
MODEL_VERSION = os.environ.get("CBPR_MODEL_VERSION", "cbpr-v1").strip() or "cbpr-v1"
CACHE_MAX_AGE = os.environ.get("CBPR_CACHE_MAX_AGE", "4 hours").strip() or "4 hours"


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
            with urllib.request.urlopen(
                request,
                timeout=30,
                context=TLS_CONTEXT,
            ) as response:
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


def supabase_headers() -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Prefer": "return=representation",
    }
    if not SUPABASE_SERVICE_ROLE_KEY.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
    return headers


def enqueue_stale_favorites() -> int:
    result = request_json(
        f"{SUPABASE_URL}/rest/v1/rpc/enqueue_stale_favorite_analyses_iOS",
        method="POST",
        headers=supabase_headers(),
        body={
            "p_timeframe": TIMEFRAME,
            "p_model_version": MODEL_VERSION,
            "p_max_age": CACHE_MAX_AGE,
        },
    )
    if isinstance(result, bool) or not isinstance(result, int):
        raise RuntimeError(f"Réponse RPC inattendue : {result!r}")
    return result


def main() -> int:
    try:
        queued = enqueue_stale_favorites()
    except Exception as error:
        print(f"Échec de mise en file : {error}", file=sys.stderr)
        return 1

    print(
        f"File mutualisée alimentée : {queued} actif(s) favori(s) périmé(s), "
        f"timeframe={TIMEFRAME}, modèle={MODEL_VERSION}, âge={CACHE_MAX_AGE}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

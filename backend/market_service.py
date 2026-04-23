from __future__ import annotations

import os
import time
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError as RequestsConnectionError, RequestException


BASE_URL = "https://api.twelvedata.com"

DEFAULT_TIMEOUT = 20
DEFAULT_OUTPUTSIZE = 240

CACHE_TTL_SEARCH = 60 * 60 * 24      # 24h for symbol metadata/search
CACHE_TTL_QUOTE = 60 * 2             # 2 min for quote
CACHE_TTL_TIME_SERIES = 60 * 60 * 4  # 4h for 4h analysis data

_cache: dict[tuple[str, tuple[tuple[str, str], ...]], tuple[float, dict[str, Any]]] = {}
def _make_cache_key(endpoint: str, params: Optional[dict[str, Any]] = None) -> tuple[str, tuple[tuple[str, str], ...]]:
    normalized = tuple(sorted((str(k), str(v)) for k, v in (params or {}).items()))
    return endpoint, normalized


def _get_cached(endpoint: str, ttl_seconds: int, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    key = _make_cache_key(endpoint, params)
    now = time.time()

    cached = _cache.get(key)
    if cached:
        expires_at, payload = cached
        if now < expires_at:
            return payload

    payload = _get(endpoint, params)
    _cache[key] = (now + ttl_seconds, payload)
    return payload

_session = requests.Session()
_adapter = HTTPAdapter(pool_connections=10, pool_maxsize=10, pool_block=False)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


class TwelveDataError(Exception):
    pass


def _api_key() -> str:
    key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    if not key:
        raise TwelveDataError("TWELVE_DATA_API_KEY is missing.")
    return key


def _get(endpoint: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    query = dict(params or {})
    query["apikey"] = _api_key()

    last_error: Optional[Exception] = None

    for attempt in range(2):
        try:
            response = _session.get(
                f"{BASE_URL}/{endpoint}",
                params=query,
                timeout=DEFAULT_TIMEOUT,
                headers={"Connection": "close"},
            )
            response.raise_for_status()
            data = response.json()

            if isinstance(data, dict) and data.get("status") == "error":
                raise TwelveDataError(data.get("message", "Unknown Twelve Data error"))

            return data
        except TwelveDataError:
            raise
        except (RequestsConnectionError, RequestException) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.25)
                continue
            raise TwelveDataError(str(exc)) from exc

    raise TwelveDataError(str(last_error) if last_error else "Unknown Twelve Data request error")


def search_assets(query: str) -> dict[str, Any]:
    return _get_cached("symbol_search", CACHE_TTL_SEARCH, {"symbol": query})


def get_quote(symbol: str) -> dict[str, Any]:
    return _get_cached("quote", CACHE_TTL_QUOTE, {"symbol": symbol})




def get_time_series(symbol: str, interval: str = "4h", outputsize: int = DEFAULT_OUTPUTSIZE) -> dict[str, Any]:
    params = {
        "symbol": symbol,
        "interval": interval,
        "outputsize": max(200, int(outputsize)),
    }
    return _get_cached("time_series", CACHE_TTL_TIME_SERIES, params)
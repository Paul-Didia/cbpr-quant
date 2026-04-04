from __future__ import annotations

import os
from typing import Any, Optional

import requests


BASE_URL = "https://api.twelvedata.com"


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

    response = requests.get(f"{BASE_URL}/{endpoint}", params=query, timeout=20)
    response.raise_for_status()
    data = response.json()

    if isinstance(data, dict) and data.get("status") == "error":
        raise TwelveDataError(data.get("message", "Unknown Twelve Data error"))

    return data


def search_assets(query: str) -> dict[str, Any]:
    return _get("symbol_search", {"symbol": query})


def get_quote(symbol: str) -> dict[str, Any]:
    return _get("quote", {"symbol": symbol})


def get_logo(symbol: str) -> dict[str, Any]:
    return _get("logo", {"symbol": symbol})


def get_time_series(symbol: str, interval: str = "4h", outputsize: int = 300) -> dict[str, Any]:
    return _get(
        "time_series",
        {
            "symbol": symbol,
            "interval": interval,
            "outputsize": outputsize,
        },
    )
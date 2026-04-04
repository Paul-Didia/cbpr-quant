from __future__ import annotations

import os
import time
from typing import Any

import requests


BASE_URL = "https://api.twelvedata.com"
GLOSSARY_TTL_SECONDS = 60 * 60 * 24  # 24h

_GLOSSARY_CACHE: list[dict[str, Any]] | None = None
_GLOSSARY_CACHE_AT = 0.0



class GlossaryError(Exception):
    pass


# Featured asset symbol lists
FEATURED_STOCK_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX", "AMD", "INTC",
    "AVGO", "ORCL", "ADBE", "CRM", "UBER", "PLTR", "PYPL", "SHOP", "SNOW", "COIN",
    "JPM", "V", "MA", "BRK.B", "BAC", "JNJ", "WMT", "COST", "MCD", "DIS",
]

FEATURED_ETF_SYMBOLS = [
    "SPY", "QQQ", "VTI", "VOO", "IWM", "DIA", "EEM", "VEA", "TLT", "GLD",
    "SLV", "XLF", "XLK", "XLE", "XLV", "ARKK", "HYG", "LQD", "IEF", "VNQ",
    "DBC", "EWJ", "EWZ", "FXI", "CSPX", "IWDA", "VWCE", "EUNA", "VUSA", "SXRV",
]

FEATURED_FOREX_SYMBOLS = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD", "EUR/GBP", "EUR/JPY", "GBP/JPY",
    "EUR/CHF", "EUR/AUD", "EUR/CAD", "EUR/NZD", "GBP/CHF", "GBP/AUD", "GBP/CAD", "AUD/JPY", "AUD/NZD", "AUD/CAD",
    "AUD/CHF", "NZD/JPY", "NZD/CAD", "NZD/CHF", "CAD/JPY", "CAD/CHF", "CHF/JPY", "USD/CNH", "EUR/CNH", "GBP/NZD",
]

FEATURED_CRYPTO_SYMBOLS = [
    "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "ADA/USD", "BNB/USD", "DOGE/USD", "DOT/USD", "AVAX/USD", "LINK/USD",
    "LTC/USD", "BCH/USD", "ATOM/USD", "MATIC/USD", "UNI/USD", "ETC/USD", "XLM/USD", "HBAR/USD", "APT/USD", "ARB/USD",
    "OP/USD", "SUI/USD", "NEAR/USD", "FIL/USD", "INJ/USD", "ICP/USD", "AAVE/USD", "PEPE/USD", "SHIB/USD", "TRX/USD",
]


def _api_key() -> str:
    key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    if not key:
        raise GlossaryError("TWELVE_DATA_API_KEY is missing.")
    return key


def _get(endpoint: str) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/{endpoint}",
        params={"apikey": _api_key()},
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()

    if isinstance(data, dict) and data.get("status") == "error":
        raise GlossaryError(data.get("message", "Twelve Data error"))

    return data


def _normalize_asset(
    symbol: str,
    name: str,
    exchange: str = "",
    currency: str = "",
    country: str = "",
    asset_type: str = "",
) -> dict[str, Any]:
    normalized_type = (asset_type or "").lower()

    category_map = {
        "stock": "Actions",
        "common stock": "Actions",
        "equity": "Actions",
        "etf": "ETF",
        "forex": "Forex",
        "crypto": "Crypto",
    }

    return {
        "symbol": str(symbol).upper(),
        "name": str(name),
        "exchange": str(exchange),
        "currency": str(currency),
        "country": str(country),
        "instrument_type": normalized_type,
        "type": normalized_type,
        "category": category_map.get(
            normalized_type,
            normalized_type.title() if normalized_type else "Autres",
        ),
    }


def load_twelve_stocks_glossary() -> list[dict[str, Any]]:
    data = _get("stocks")
    items = data.get("data", [])
    return [
        _normalize_asset(
            symbol=item.get("symbol", ""),
            name=item.get("name", ""),
            exchange=item.get("exchange", ""),
            currency=item.get("currency", ""),
            country=item.get("country", ""),
            asset_type="stock",
        )
        for item in items
    ]


def load_twelve_etf_glossary() -> list[dict[str, Any]]:
    data = _get("etf")
    items = data.get("data", [])
    return [
        _normalize_asset(
            symbol=item.get("symbol", ""),
            name=item.get("name", ""),
            exchange=item.get("exchange", ""),
            currency=item.get("currency", ""),
            country=item.get("country", ""),
            asset_type="etf",
        )
        for item in items
    ]


def load_twelve_forex_glossary() -> list[dict[str, Any]]:
    data = _get("forex_pairs")
    items = data.get("data", [])

    result: list[dict[str, Any]] = []
    for item in items:
        symbol = item.get("symbol")
        if not symbol:
            base = item.get("currency_base", "")
            quote = item.get("currency_quote", "")
            symbol = f"{base}/{quote}" if base and quote else ""

        result.append(
            _normalize_asset(
                symbol=symbol,
                name=symbol,
                exchange="Forex",
                currency=item.get("currency_quote", ""),
                country="",
                asset_type="forex",
            )
        )
    return result


def load_twelve_crypto_glossary() -> list[dict[str, Any]]:
    data = _get("cryptocurrencies")
    items = data.get("data", [])
    return [
        _normalize_asset(
            symbol=item.get("symbol", ""),
            name=item.get("name", ""),
            exchange=item.get("exchange", "CRYPTO"),
            currency=item.get("currency", ""),
            country="",
            asset_type="crypto",
        )
        for item in items
    ]


def _select_featured_assets(
    assets: list[dict[str, Any]],
    featured_symbols: list[str],
) -> list[dict[str, Any]]:
    asset_map = {str(asset.get("symbol", "")).upper(): asset for asset in assets}
    selected: list[dict[str, Any]] = []

    for symbol in featured_symbols:
        asset = asset_map.get(symbol.upper())
        if asset:
            selected.append(asset)

    return selected


def load_featured_glossary() -> list[dict[str, Any]]:
    stocks = _select_featured_assets(
        load_twelve_stocks_glossary(),
        FEATURED_STOCK_SYMBOLS,
    )
    etfs = _select_featured_assets(
        load_twelve_etf_glossary(),
        FEATURED_ETF_SYMBOLS,
    )
    forex = _select_featured_assets(
        load_twelve_forex_glossary(),
        FEATURED_FOREX_SYMBOLS,
    )
    crypto = _select_featured_assets(
        load_twelve_crypto_glossary(),
        FEATURED_CRYPTO_SYMBOLS,
    )

    return stocks + etfs + forex + crypto


def load_full_glossary(force_refresh: bool = False) -> list[dict[str, Any]]:
    global _GLOSSARY_CACHE, _GLOSSARY_CACHE_AT

    if (
        not force_refresh
        and _GLOSSARY_CACHE is not None
        and (time.time() - _GLOSSARY_CACHE_AT) < GLOSSARY_TTL_SECONDS
    ):
        return _GLOSSARY_CACHE

    all_assets = load_featured_glossary()

    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for asset in all_assets:
        key = asset["symbol"]
        if key not in seen:
            seen.add(key)
            deduped.append(asset)

    _GLOSSARY_CACHE = deduped
    _GLOSSARY_CACHE_AT = time.time()
    return deduped


def filter_glossary(
    data: list[dict[str, Any]],
    query: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = query.strip().lower()
    if not q:
        return data[:limit]

    return [
        item
        for item in data
        if q in item["symbol"].lower() or q in item["name"].lower()
    ][:limit]
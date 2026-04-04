from __future__ import annotations

import os
import stripe
import requests
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from cbpr_service import analyze_cbpr
from glossary_service import filter_glossary, load_full_glossary
from market_service import (
    TwelveDataError,
    get_quote,
    get_time_series,
    search_assets,
)

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

PRICE_TO_PLAN = {
    "price_1SttWlHcnVlM75DL1pDnoTXS": "quant",
    "price_1StofTHcnVlM75DLd3qXb9qL": "pro",
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_KEY", "")
DEV_DEFAULT_PLAN = os.getenv("DEV_DEFAULT_PLAN", "quant").strip().lower() or "quant"

FREE_STOCK_SYMBOLS = {
    "AAPL","MSFT","AMZN","GOOGL","META","NVDA","TSLA","JPM","JNJ","V",
    "WMT","PG","XOM","UNH","KO","DIS","NFLX","INTC","AMD","CSCO",
    "ORCL","IBM","BA","NKE","PFE","MRK","CVX","MCD","COST","PEP",
    "ABT","AVGO","TMO","ACN","QCOM","TXN","HON","LIN","UPS","PM",
    "RTX","LOW","INTU","AMGN","SPGI","CAT","GS","DE","BLK","MDT",
    "ISRG","NOW","BKNG","ADBE","PLD","SYK","GILD","ADI","VRTX","ZTS",
    "CB","CI","MO","LMT","SCHW","DUK","MMC","SO","USB","BDX",
    "FIS","PNC","T","APD","CSX","NSC","ICE","GM","F","ETN",
    "EMR","EOG","MPC","PSX","KMI","SLB","COP","HAL","DVN","OXY",
    "AIG","MET","PRU","ALL","TRV","AXP","COF","DFS","PYPL","SQ",
    "CRM","SNOW","SHOP","UBER","LYFT","TWLO","DDOG","NET","OKTA","ZS",
    "CRWD","PANW","FTNT","TEAM","WDAY","DOCU","ROKU","TTD","SPOT","EA",
    "ATVI","TTWO","RBLX","U","PLTR","AI","SMCI","MRVL","KLAC","LRCX",
    "ASML","NXPI","ON","MPWR","SWKS","QRVO","CDNS","SNPS","ANSS","PAYC",
    "PAYX","ADP","HPQ","DELL","HPE","SONY","NTDOY","BABA","JD",
    "PDD","TCEHY","BIDU","SE","MELI","TSM","INFY","SAP","ORAN","VOD"
}

app = FastAPI(title="CBPR Quant Backend", version="1.0.0")

ENV = os.getenv("ENV", "dev").strip().lower() or "dev"

frontend_origins_raw = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:5173,https://quant.cbprcapital.com",
)
frontend_origins = []
for origin in frontend_origins_raw.split(","):
    cleaned = origin.strip().rstrip("/")
    if cleaned and cleaned not in frontend_origins:
        frontend_origins.append(cleaned)

if "https://quant.cbprcapital.com" not in frontend_origins:
    frontend_origins.append("https://quant.cbprcapital.com")

if ENV != "production" and "http://localhost:5173" not in frontend_origins:
    frontend_origins.append("http://localhost:5173")

print(f"[BOOT] ENV={ENV}")
print(f"[BOOT] Allowed CORS origins={frontend_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def force_preflight_ok(request: Request, call_next):
    if request.method == "OPTIONS":
        origin = (request.headers.get("origin") or "").strip().rstrip("/")
        response = Response(status_code=200)

        if origin in frontend_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = request.headers.get(
                "access-control-request-headers",
                "Authorization, Content-Type",
            )
            response.headers["Vary"] = "Origin"

        return response

    return await call_next(request)


def normalize_search_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": item.get("symbol", ""),
        "name": item.get("instrument_name") or item.get("name") or item.get("symbol", ""),
        "instrument_type": item.get("instrument_type", ""),
        "exchange": item.get("exchange", ""),
        "currency": item.get("currency", ""),
        "country": item.get("country", ""),
    }


def normalize_quote_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": item.get("symbol", ""),
        "name": item.get("name") or item.get("symbol", ""),
        "instrument_type": item.get("instrument_type", ""),
        "exchange": item.get("exchange", ""),
        "currency": item.get("currency", ""),
        "country": item.get("country", ""),
        "price": float(item.get("close", 0) or 0),
        "change": float(item.get("change", 0) or 0),
        "changePercent": float(item.get("percent_change", 0) or 0),
    }


# Helper to get Stripe plan by email
# Helper to get Stripe plan by email
def get_stripe_plan_by_email(email: str) -> str:
    admin_emails = [
        value.strip().lower()
        for value in os.getenv("ADMIN_EMAILS", "").split(",")
        if value.strip()
    ]

    normalized_email = (email or "").strip().lower()

    if normalized_email in admin_emails:
        return "quant"

    if not stripe.api_key or not normalized_email:
        return "free"

    try:
        customers = stripe.Customer.list(email=normalized_email, limit=1)
        if not customers.data:
            return "free"

        customer = customers.data[0]
        subscriptions = stripe.Subscription.list(customer=customer.id, status="active", limit=10)

        if not subscriptions.data:
            return "free"

        for subscription in subscriptions.data:
            items = subscription.get("items", {}).get("data", [])
            for item in items:
                price_id = item.get("price", {}).get("id")
                plan = PRICE_TO_PLAN.get(price_id)
                if plan:
                    return plan

        return "free"
    except Exception as e:
        print(f"Stripe subscription lookup error for {normalized_email}: {e}")
        return "free"


def normalize_access_symbol(symbol: str) -> str:
    return str(symbol or "").strip().upper()


def infer_asset_type(symbol: str, quote_data: dict[str, Any]) -> str:
    instrument_type = str(quote_data.get("instrument_type", "") or "").lower()
    exchange = str(quote_data.get("exchange", "") or "").lower()
    name = str(quote_data.get("name", "") or "").lower()
    normalized_symbol = normalize_access_symbol(symbol)

    crypto_exchanges = {
        "coinbase", "coinbase pro", "huobi", "binance", "kraken", "bybit", "okx"
    }

    if exchange == "forex" or "forex" in instrument_type or "/" in normalized_symbol:
        return "forex"

    if (
        "crypto" in instrument_type
        or any(item in exchange for item in crypto_exchanges)
        or any(token in name for token in ["bitcoin", "ethereum", "solana", "ripple", "cardano", "bnb"])
    ):
        return "crypto"

    if "etf" in instrument_type or "etf" in name or "ucits" in name:
        return "etf"

    return "stock"


def get_required_plan_for_symbol(symbol: str, quote_data: dict[str, Any]) -> str:
    asset_type = infer_asset_type(symbol, quote_data)
    normalized_symbol = normalize_access_symbol(symbol)

    if asset_type in {"crypto", "forex"}:
        return "quant"

    if asset_type == "etf":
        return "pro"

    if asset_type == "stock":
        return "free" if normalized_symbol in FREE_STOCK_SYMBOLS else "pro"

    return "quant"


def is_symbol_allowed_for_plan(symbol: str, quote_data: dict[str, Any], plan: str) -> bool:
    required_plan = get_required_plan_for_symbol(symbol, quote_data)

    if plan == "quant":
        return True
    if plan == "pro":
        return required_plan != "quant"
    return required_plan == "free"


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None

    token = authorization[len(prefix):].strip()
    return token or None


def get_user_email_from_token(authorization: str | None) -> str | None:
    token = extract_bearer_token(authorization)

    if not token:
        return None

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("Supabase auth configuration missing, skipping token verification")
        return None

    try:
        response = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            timeout=10,
        )
    except Exception as e:
        print(f"Auth verification failed: {e}")
        return None

    if response.status_code != 200:
        print(f"Invalid or expired session: {response.status_code}")
        return None

    user_data = response.json()
    email = str(user_data.get("email", "") or "").strip().lower()
    return email or None


def enforce_symbol_access(symbol: str, quote_data: dict[str, Any], authorization: str | None) -> str:
    env = ENV
    
    email = get_user_email_from_token(authorization)

    if email:
        plan = get_stripe_plan_by_email(email)

    elif env == "dev":
        plan = DEV_DEFAULT_PLAN
        print(f"[DEV MODE] Using DEV_DEFAULT_PLAN={plan}")

    else:
        plan = "free"

    if not is_symbol_allowed_for_plan(symbol, quote_data, plan):
        required_plan = get_required_plan_for_symbol(symbol, quote_data)
        raise HTTPException(
            status_code=403,
            detail=f"This asset requires the {required_plan} plan",
        )

    return plan


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Route to get subscription by email
@app.get("/subscription")
def subscription(email: str = Query(..., min_length=3)) -> dict[str, str]:
    try:
        plan = get_stripe_plan_by_email(email)
        return {"subscription": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subscription error: {e}")


@app.get("/library")
def library(
    q: str = Query(default="", min_length=0),
    limit: int = 5000,
    category: str = Query(default="all"),
) -> dict[str, Any]:
    try:
        glossary = load_full_glossary()

        if category and category != "all":
            glossary = [
                item for item in glossary
                if str(item.get("type", "")).lower() == category.lower()
            ]

        items = filter_glossary(glossary, q, limit)
        return {"assets": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Library error: {e}")


@app.get("/search")
def search(
    q: str = Query(..., min_length=1),
    limit: int = 100,
    category: str = Query(default="all"),
) -> dict[str, Any]:
    try:
        data = search_assets(q)
        items = [normalize_search_item(x) for x in data.get("data", [])]

        if category and category != "all":
            filtered: list[dict[str, Any]] = []
            for item in items:
                item_type = str(item.get("instrument_type", "")).lower()
                item_exchange = str(item.get("exchange", "")).lower()
                item_symbol = str(item.get("symbol", "")).upper()
                item_name = str(item.get("name", "")).lower()

                if category == "forex":
                    if item_type == "forex" or item_exchange == "forex" or "/" in item_symbol:
                        filtered.append(item)

                elif category == "crypto":
                    if (
                        "crypto" in item_type
                        or any(
                            ex in item_exchange
                            for ex in ["coinbase", "coinbase pro", "huobi", "binance", "kraken", "bybit", "okx"]
                        )
                        or any(token in item_name for token in ["bitcoin", "ethereum", "solana", "ripple", "cardano"])
                    ):
                        filtered.append(item)

                elif category == "etf":
                    if "etf" in item_type or "etf" in item_name or "ucits" in item_name:
                        filtered.append(item)

                elif category == "stock":
                    if (
                        "stock" in item_type
                        or "equity" in item_type
                        or item_exchange in ["nasdaq", "nyse", "euronext", "lse", "tsx", "xetra"]
                    ):
                        filtered.append(item)

            items = filtered

        return {"data": items[:limit]}

    except TwelveDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {e}")


@app.get("/quote/{symbol:path}")
def quote(symbol: str) -> dict[str, Any]:
    try:
        data = get_quote(symbol)
        return normalize_quote_item(data)
    except TwelveDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quote error: {e}")


@app.get("/timeseries/{symbol:path}")
def timeseries(
    symbol: str,
    interval: str = Query(default="4h"),
    outputsize: int = Query(default=300),
) -> dict[str, Any]:
    try:
        data = get_time_series(symbol, interval=interval, outputsize=outputsize)
        return data
    except TwelveDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Timeseries error: {e}")


@app.get("/asset/{symbol:path}")
def asset(symbol: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    try:
        quote_data = get_quote(symbol)
        plan = enforce_symbol_access(symbol, quote_data, authorization)

        return {
            "quote": normalize_quote_item(quote_data),
            "logo": "",
            "subscription": plan,
        }
    except HTTPException:
        raise
    except TwelveDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Asset error: {e}")


@app.get("/analysis/{symbol:path}")
def analysis(
    symbol: str,
    interval: str = Query(default="4h"),
    outputsize: int = Query(default=300),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        quote_data = get_quote(symbol)
        plan = enforce_symbol_access(symbol, quote_data, authorization)
        ts_data = get_time_series(symbol, interval=interval, outputsize=outputsize)

        analysis_data = analyze_cbpr(
            ts_data,
            symbol=symbol,
            asset_name=quote_data.get("name", symbol),
            exchange=quote_data.get("exchange", ""),
        )

        enriched_values = []
        df = analysis_data.get("dataframe")

        if df is not None:
            enriched_values = [
                {
                    "datetime": row["datetime"].isoformat() if row.get("datetime") is not None else "",
                    "open": float(row["open"]) if row.get("open") is not None else None,
                    "high": float(row["high"]) if row.get("high") is not None else None,
                    "low": float(row["low"]) if row.get("low") is not None else None,
                    "close": float(row["close"]) if row.get("close") is not None else None,
                    "SMA200": float(row["SMA200"]) if row.get("SMA200") is not None and row.get("SMA200") == row.get("SMA200") else None,
                    "SMA200_upper": float(row["SMA200_upper"]) if row.get("SMA200_upper") is not None and row.get("SMA200_upper") == row.get("SMA200_upper") else None,
                    "SMA200_lower": float(row["SMA200_lower"]) if row.get("SMA200_lower") is not None and row.get("SMA200_lower") == row.get("SMA200_lower") else None,
                }
                for _, row in df.iterrows()
            ]

        return {
            "symbol": symbol,
            "interval": interval,
            "subscription": plan,
            "analysis": {k: v for k, v in analysis_data.items() if k != "dataframe"},
            "values": enriched_values,
            "meta": ts_data.get("meta", {}),
            "quote": quote_data,
        }
    except HTTPException:
        raise
    except TwelveDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")
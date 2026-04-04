from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _to_dataframe(time_series_data: dict[str, Any]) -> pd.DataFrame:
    values = time_series_data.get("values", [])
    if not values:
        return pd.DataFrame()

    df = pd.DataFrame(values).copy()

    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])

    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    else:
        df["volume"] = 0.0

    df = df.dropna(subset=["close"]).sort_values("datetime").reset_index(drop=True)
    return df


def compute_rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_bbands(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    middle = df["close"].rolling(period).mean()
    stdev = df["close"].rolling(period).std()
    df["BB_upper"] = middle + 2 * stdev
    df["BB_lower"] = middle - 2 * stdev
    df["BB_middle"] = middle
    return df


def compute_macd(df: pd.DataFrame) -> pd.DataFrame:
    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["MACD"] = ema12 - ema26
    df["Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    return df


def compute_sma200(df: pd.DataFrame) -> pd.DataFrame:
    df["SMA200"] = df["close"].rolling(200).mean()
    return df


def compute_daily_delta(df: pd.DataFrame) -> pd.DataFrame:
    df["date"] = df["datetime"].dt.date
    daily_close = df.groupby("date")["close"].last()
    daily_pct = daily_close.pct_change()
    df["delta_pct"] = df["date"].map(daily_pct).fillna(0.0)
    return df


def is_etf(symbol: str, asset_name: str = "", exchange: str = "") -> bool:
    hardcoded = {"IWDA", "IWDD", "VWCE", "EUNA", "CSPX", "SPY", "QQQ"}
    base = symbol.split("/")[0].split(":")[-1].upper()
    name_value = (asset_name or "").lower()
    exchange_value = (exchange or "").lower()

    if base in hardcoded:
        return True

    if "etf" in name_value or "ucits" in name_value:
        return True

    if exchange_value in {"arca"}:
        return True

    return False


def cbpr_analyze_historical(
    df_4h: pd.DataFrame,
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
):
    df = df_4h.copy()
    df["RSI"] = compute_rsi_series(df["close"])
    df = compute_bbands(df)
    df = compute_macd(df)
    df = compute_sma200(df)
    df = compute_daily_delta(df)

    base = symbol.split("/")[0].upper()
    crypto = ["BTC", "ETH", "SOL", "ADA", "XRP", "BNB", "DOGE", "DOT"]

    if base in crypto:
        margin = 0.19
    elif "/" in symbol and (exchange or "").lower() == "forex":
        margin = 0.02
    elif is_etf(symbol, asset_name, exchange):
        margin = 0.04
    else:
        margin = 0.09

    df["SMA200_upper"] = df["SMA200"] * (1 + margin)
    df["SMA200_lower"] = df["SMA200"] * (1 - margin)

    def get_dir(row):
        if pd.isna(row["SMA200"]):
            return "neutre"
        if row["SMA200_lower"] <= row["close"] <= row["SMA200_upper"]:
            return "neutre"
        return "achat" if row["close"] < row["SMA200"] else "vente"

    df["direction"] = df.apply(get_dir, axis=1)

    signals = []

    for _, row in df.iterrows():
        if row["direction"] == "neutre":
            continue

        score = 75

        if row["direction"] == "achat" and row["RSI"] < 30:
            score += 15
        if row["direction"] == "vente" and row["RSI"] > 70:
            score += 15

        if row["direction"] == "achat" and row["MACD"] > row["Signal"]:
            score += 15
        if row["direction"] == "vente" and row["MACD"] < row["Signal"]:
            score += 15

        if row["direction"] == "vente" and row["delta_pct"] <= 0:
            continue
        if row["direction"] == "achat" and row["delta_pct"] >= 0:
            continue

        signals.append(
            {
                "time": row["datetime"].isoformat(),
                "symbol": symbol,
                "type": "🔴 Surachat" if row["direction"] == "vente" else "🟢 Survente",
                "direction": row["direction"],
                "signal": "VENTE" if row["direction"] == "vente" else "ACHAT",
                "score": min(100, score),
                "rsi": round(float(row["RSI"]), 2) if pd.notna(row["RSI"]) else None,
                "macd": round(float(row["MACD"]), 6) if pd.notna(row["MACD"]) else None,
                "macd_signal": round(float(row["Signal"]), 6) if pd.notna(row["Signal"]) else None,
                "sma200": round(float(row["SMA200"]), 5) if pd.notna(row["SMA200"]) else None,
                "delta_pct": round(float(row["delta_pct"]) * 100, 4),
                "close": float(row["close"]),
                "date": row["datetime"].strftime("%Y-%m-%d %H:%M"),
            }
        )

    return df, signals


def analyze_cbpr(
    time_series_data: dict[str, Any],
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
) -> dict[str, Any]:
    df = _to_dataframe(time_series_data)

    if df.empty:
        return {
            "signal": "NEUTRE",
            "score": 0,
            "indicators": {},
            "signals": [],
            "error": "No time series data available",
        }

    df, signals = cbpr_analyze_historical(df, symbol, asset_name, exchange)
    latest = df.iloc[-1]

    last_signal = signals[-1] if signals else None

    signal = last_signal["signal"] if last_signal else "NEUTRE"
    score = int(last_signal["score"]) if last_signal else 60

    if pd.isna(latest.get("BB_upper")) or pd.isna(latest.get("BB_lower")):
        bollinger_zone = "Indisponible"
    elif latest["close"] >= latest["BB_upper"]:
        bollinger_zone = "Sur bande haute"
    elif latest["close"] <= latest["BB_lower"]:
        bollinger_zone = "Sur bande basse"
    else:
        bollinger_zone = "Zone neutre"

    return {
        "signal": signal,
        "score": score,
        "signals": signals,
        "lastSignal": last_signal,
        "indicators": {
            "currentPrice": float(latest["close"]),
            "sma200": float(latest["SMA200"]) if pd.notna(latest["SMA200"]) else None,
            "sma200Upper": float(latest["SMA200_upper"]) if pd.notna(latest["SMA200_upper"]) else None,
            "sma200Lower": float(latest["SMA200_lower"]) if pd.notna(latest["SMA200_lower"]) else None,
            "rsi14": float(latest["RSI"]) if pd.notna(latest["RSI"]) else None,
            "macd": float(latest["MACD"]) if pd.notna(latest["MACD"]) else None,
            "macdSignal": float(latest["Signal"]) if pd.notna(latest["Signal"]) else None,
            "deltaPct": float(latest["delta_pct"]) * 100 if pd.notna(latest["delta_pct"]) else None,
            "direction": latest["direction"],
            "bollingerZone": bollinger_zone,
        },
        "dataframe": df[
            [
                "datetime",
                "open",
                "high",
                "low",
                "close",
                "SMA200",
                "SMA200_upper",
                "SMA200_lower",
            ]
        ].copy(),
    }
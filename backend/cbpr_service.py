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


# Pivot level computation
def compute_pivot_levels(df: pd.DataFrame, window: int = 3) -> pd.DataFrame:
    pivot_highs: list[float | None] = [None] * len(df)
    pivot_lows: list[float | None] = [None] * len(df)

    if len(df) < (window * 2 + 1):
        df["pivot_high"] = np.nan
        df["pivot_low"] = np.nan
        df["pivot_resistance"] = np.nan
        df["pivot_support"] = np.nan
        return df

    highs = df["high"].tolist()
    lows = df["low"].tolist()

    for i in range(window, len(df) - window):
        local_highs = highs[i - window : i + window + 1]
        local_lows = lows[i - window : i + window + 1]
        current_high = highs[i]
        current_low = lows[i]

        if pd.notna(current_high) and current_high == max(local_highs):
            if local_highs.count(current_high) == 1:
                pivot_highs[i] = float(current_high)

        if pd.notna(current_low) and current_low == min(local_lows):
            if local_lows.count(current_low) == 1:
                pivot_lows[i] = float(current_low)

    df["pivot_high"] = pd.Series(pivot_highs, index=df.index, dtype="float64")
    df["pivot_low"] = pd.Series(pivot_lows, index=df.index, dtype="float64")
    df["pivot_resistance"] = df["pivot_high"].ffill()
    df["pivot_support"] = df["pivot_low"].ffill()
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
    df = compute_pivot_levels(df)
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

    def get_signal_direction(row):
        if pd.isna(row["SMA200"]):
            return "neutre"
        if row["SMA200_lower"] <= row["close"] <= row["SMA200_upper"]:
            return "neutre"
        return "achat" if row["close"] < row["SMA200"] else "vente"

    def get_channel_direction(row):
        if pd.isna(row["SMA200"]):
            return "neutre"
        if row["SMA200_lower"] <= row["close"] <= row["SMA200_upper"]:
            return "neutre"
        return "baissier" if row["close"] < row["SMA200"] else "haussier"

    df["direction"] = df.apply(get_signal_direction, axis=1)
    df["channel_direction"] = df.apply(get_channel_direction, axis=1)

    # 🆕 Durée passée sous la SMA200 et en zone d'achat, en jours de bourse consécutifs
    df["below_sma200"] = (
        pd.notna(df["SMA200"]) & (df["close"] < df["SMA200"])
    )
    df["in_buy_zone"] = df["direction"] == "achat"

    below_sma_days: list[int] = []
    buy_zone_days: list[int] = []
    current_below_days = 0
    current_buy_days = 0
    last_below_date = None
    last_buy_date = None

    for _, row in df.iterrows():
        row_date = row["datetime"].date()

        if bool(row["below_sma200"]):
            if last_below_date != row_date:
                current_below_days += 1
                last_below_date = row_date
        else:
            current_below_days = 0
            last_below_date = None

        if bool(row["in_buy_zone"]):
            if last_buy_date != row_date:
                current_buy_days += 1
                last_buy_date = row_date
        else:
            current_buy_days = 0
            last_buy_date = None

        below_sma_days.append(current_below_days)
        buy_zone_days.append(current_buy_days)

    df["below_sma200_days"] = below_sma_days
    df["buy_zone_days"] = buy_zone_days

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

        # 🆕 Dégradation d'un achat qui dure trop longtemps dans un canal baissier sans reprise
        if row["direction"] == "achat":
            duration_penalty = 0
            below_days = int(row.get("below_sma200_days", 0) or 0)
            buy_days = int(row.get("buy_zone_days", 0) or 0)
            recovery_started = (
                pd.notna(row["MACD"])
                and pd.notna(row["Signal"])
                and pd.notna(row["RSI"])
                and row["MACD"] > row["Signal"]
                and row["RSI"] >= 45
            )

            if below_days >= 20:
                duration_penalty += 10
            if below_days >= 35:
                duration_penalty += 10
            if below_days >= 50:
                duration_penalty += 15

            if buy_days >= 20 and not recovery_started:
                duration_penalty += 10
            if buy_days >= 35 and not recovery_started:
                duration_penalty += 10
            if buy_days >= 50 and not recovery_started:
                duration_penalty += 15

            score -= duration_penalty

        # 🆕 Pondération du score par proximité avec un vrai pivot
        pivot_support = row.get("pivot_support")
        pivot_resistance = row.get("pivot_resistance")
        pivot_adjustment = 0

        if row["direction"] == "achat" and pd.notna(pivot_support):
            support_distance_pct = abs(float(row["close"]) - float(pivot_support)) / float(row["close"])
            if float(pivot_support) <= float(row["close"]):
                if support_distance_pct <= 0.015:
                    pivot_adjustment += 15
                elif support_distance_pct <= 0.03:
                    pivot_adjustment += 8
                elif support_distance_pct > 0.05:
                    pivot_adjustment -= 10

        if row["direction"] == "achat" and pd.notna(pivot_resistance):
            resistance_distance_pct = abs(float(pivot_resistance) - float(row["close"])) / float(row["close"])
            if float(pivot_resistance) >= float(row["close"]) and resistance_distance_pct <= 0.02:
                pivot_adjustment -= 20

        if row["direction"] == "vente" and pd.notna(pivot_resistance):
            resistance_distance_pct = abs(float(pivot_resistance) - float(row["close"])) / float(row["close"])
            if float(pivot_resistance) >= float(row["close"]):
                if resistance_distance_pct <= 0.015:
                    pivot_adjustment += 15
                elif resistance_distance_pct <= 0.03:
                    pivot_adjustment += 8
                elif resistance_distance_pct > 0.05:
                    pivot_adjustment -= 10

        if row["direction"] == "vente" and pd.notna(pivot_support):
            support_distance_pct = abs(float(row["close"]) - float(pivot_support)) / float(row["close"])
            if float(pivot_support) <= float(row["close"]) and support_distance_pct <= 0.02:
                pivot_adjustment -= 20

        score += pivot_adjustment

        if row["direction"] == "vente" and row["delta_pct"] <= 0:
            continue
        if row["direction"] == "achat" and row["delta_pct"] >= 0:
            continue

        # 🆕 Si un achat reste trop longtemps faible sans reprise, on ne le qualifie plus comme opportunité forte
        if row["direction"] == "achat":
            below_days = int(row.get("below_sma200_days", 0) or 0)
            buy_days = int(row.get("buy_zone_days", 0) or 0)
            recovery_started = (
                pd.notna(row["MACD"])
                and pd.notna(row["Signal"])
                and pd.notna(row["RSI"])
                and row["MACD"] > row["Signal"]
                and row["RSI"] >= 45
            )
            if (below_days >= 50 or buy_days >= 50) and not recovery_started:
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
                "below_sma200_days": int(row.get("below_sma200_days", 0) or 0),
                "buy_zone_days": int(row.get("buy_zone_days", 0) or 0),
                "pivot_support": round(float(row["pivot_support"]), 5) if pd.notna(row.get("pivot_support")) else None,
                "pivot_resistance": round(float(row["pivot_resistance"]), 5) if pd.notna(row.get("pivot_resistance")) else None,
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

    # 🆕 Le statut principal doit refléter la bougie actuelle, pas le dernier signal historique
    signal = "NEUTRE"
    score = 60

    if latest["direction"] != "neutre":
        current_score = 75

        if pd.notna(latest["RSI"]):
            if latest["direction"] == "achat" and latest["RSI"] < 30:
                current_score += 15
            if latest["direction"] == "vente" and latest["RSI"] > 70:
                current_score += 15

        if pd.notna(latest["MACD"]) and pd.notna(latest["Signal"]):
            if latest["direction"] == "achat" and latest["MACD"] > latest["Signal"]:
                current_score += 15
            if latest["direction"] == "vente" and latest["MACD"] < latest["Signal"]:
                current_score += 15

        if latest["direction"] == "achat":
            duration_penalty = 0
            below_days = int(latest.get("below_sma200_days", 0) or 0)
            buy_days = int(latest.get("buy_zone_days", 0) or 0)
            recovery_started = (
                pd.notna(latest["MACD"])
                and pd.notna(latest["Signal"])
                and pd.notna(latest["RSI"])
                and latest["MACD"] > latest["Signal"]
                and latest["RSI"] >= 45
            )

            if below_days >= 20:
                duration_penalty += 10
            if below_days >= 35:
                duration_penalty += 10
            if below_days >= 50:
                duration_penalty += 15

            if buy_days >= 20 and not recovery_started:
                duration_penalty += 10
            if buy_days >= 35 and not recovery_started:
                duration_penalty += 10
            if buy_days >= 50 and not recovery_started:
                duration_penalty += 15

            current_score -= duration_penalty

        pivot_support = latest.get("pivot_support")
        pivot_resistance = latest.get("pivot_resistance")
        pivot_adjustment = 0

        if latest["direction"] == "achat" and pd.notna(pivot_support):
            support_distance_pct = abs(float(latest["close"]) - float(pivot_support)) / float(latest["close"])
            if float(pivot_support) <= float(latest["close"]):
                if support_distance_pct <= 0.015:
                    pivot_adjustment += 15
                elif support_distance_pct <= 0.03:
                    pivot_adjustment += 8
                elif support_distance_pct > 0.05:
                    pivot_adjustment -= 10

        if latest["direction"] == "achat" and pd.notna(pivot_resistance):
            resistance_distance_pct = abs(float(pivot_resistance) - float(latest["close"])) / float(latest["close"])
            if float(pivot_resistance) >= float(latest["close"]) and resistance_distance_pct <= 0.02:
                pivot_adjustment -= 20

        if latest["direction"] == "vente" and pd.notna(pivot_resistance):
            resistance_distance_pct = abs(float(pivot_resistance) - float(latest["close"])) / float(latest["close"])
            if float(pivot_resistance) >= float(latest["close"]):
                if resistance_distance_pct <= 0.015:
                    pivot_adjustment += 15
                elif resistance_distance_pct <= 0.03:
                    pivot_adjustment += 8
                elif resistance_distance_pct > 0.05:
                    pivot_adjustment -= 10

        if latest["direction"] == "vente" and pd.notna(pivot_support):
            support_distance_pct = abs(float(latest["close"]) - float(pivot_support)) / float(latest["close"])
            if float(pivot_support) <= float(latest["close"]) and support_distance_pct <= 0.02:
                pivot_adjustment -= 20

        current_score += pivot_adjustment

        current_score = max(0, min(100, current_score))
        current_is_valid = True

        if latest["direction"] == "vente" and latest["delta_pct"] <= 0:
            current_is_valid = False
        if latest["direction"] == "achat" and latest["delta_pct"] >= 0:
            current_is_valid = False

        if latest["direction"] == "achat":
            below_days = int(latest.get("below_sma200_days", 0) or 0)
            buy_days = int(latest.get("buy_zone_days", 0) or 0)
            recovery_started = (
                pd.notna(latest["MACD"])
                and pd.notna(latest["Signal"])
                and pd.notna(latest["RSI"])
                and latest["MACD"] > latest["Signal"]
                and latest["RSI"] >= 45
            )
            if (below_days >= 50 or buy_days >= 50) and not recovery_started:
                current_is_valid = False

        if current_is_valid:
            signal = "ACHAT" if latest["direction"] == "achat" else "VENTE"
            score = int(current_score)

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
            "channelDirection": latest["channel_direction"],
            "belowSma200Days": int(latest["below_sma200_days"]) if pd.notna(latest["below_sma200_days"]) else 0,
            "buyZoneDays": int(latest["buy_zone_days"]) if pd.notna(latest["buy_zone_days"]) else 0,
            "pivotSupport": float(latest["pivot_support"]) if pd.notna(latest.get("pivot_support")) else None,
            "pivotResistance": float(latest["pivot_resistance"]) if pd.notna(latest.get("pivot_resistance")) else None,
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
                "pivot_support",
                "pivot_resistance",
            ]
        ].copy(),
    }
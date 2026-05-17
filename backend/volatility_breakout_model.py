from __future__ import annotations

from typing import Any

import pandas as pd

from cbpr_service import _to_dataframe, compute_rsi_series, compute_macd


def _safe_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _score(value: float) -> int:
    return int(max(0, min(100, round(value))))


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    previous_close = df["close"].shift(1)
    true_range = pd.concat(
        [
            (df["high"] - df["low"]).abs(),
            (df["high"] - previous_close).abs(),
            (df["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)

    df["ATR14"] = true_range.rolling(period).mean()
    df["ATR14_mean"] = df["ATR14"].rolling(50).mean()
    df["volatility_ratio"] = df["ATR14"] / df["ATR14_mean"]
    return df


def compute_breakout_context(df: pd.DataFrame, range_window: int = 40) -> pd.DataFrame:
    df["EMA20"] = df["close"].ewm(span=20, adjust=False).mean()
    df["EMA50"] = df["close"].ewm(span=50, adjust=False).mean()
    df["range_high"] = df["high"].rolling(range_window).max().shift(1)
    df["range_low"] = df["low"].rolling(range_window).min().shift(1)

    df["breakout_direction"] = "neutre"
    df.loc[df["close"] > df["range_high"], "breakout_direction"] = "haussier"
    df.loc[df["close"] < df["range_low"], "breakout_direction"] = "baissier"

    df["trend_confirmation"] = "neutre"
    df.loc[df["EMA20"] > df["EMA50"], "trend_confirmation"] = "haussier"
    df.loc[df["EMA20"] < df["EMA50"], "trend_confirmation"] = "baissier"
    return df


def compute_breakout_score(row: pd.Series) -> int:
    close = row.get("close")
    range_high = row.get("range_high")
    range_low = row.get("range_low")
    atr = row.get("ATR14")
    volatility_ratio = row.get("volatility_ratio")
    breakout_direction = row.get("breakout_direction", "neutre")
    trend_confirmation = row.get("trend_confirmation", "neutre")
    rsi = row.get("RSI")

    if pd.isna(close) or breakout_direction == "neutre":
        return 10

    score = 25.0

    if breakout_direction == "haussier" and pd.notna(range_high) and pd.notna(atr) and float(atr) > 0:
        score += min(max((float(close) - float(range_high)) / float(atr), 0), 2) * 20
    elif breakout_direction == "baissier" and pd.notna(range_low) and pd.notna(atr) and float(atr) > 0:
        score += min(max((float(range_low) - float(close)) / float(atr), 0), 2) * 20

    if pd.notna(volatility_ratio):
        score += min(max(float(volatility_ratio) - 1, 0), 1.5) * 20

    if breakout_direction == trend_confirmation:
        score += 25

    if pd.notna(rsi):
        if breakout_direction == "haussier" and float(rsi) >= 55:
            score += 10
        elif breakout_direction == "baissier" and float(rsi) <= 45:
            score += 10

    return _score(score)


def build_breakout_explanation(row: pd.Series, signal: str, score: int) -> dict[str, Any]:
    breakout_direction = row.get("breakout_direction", "neutre")
    trend_confirmation = row.get("trend_confirmation", "neutre")
    volatility_ratio = row.get("volatility_ratio")

    if signal == "ACHAT":
        title = "Pourquoi rupture haussière ?"
        summary = "Le modèle de rupture détecte une cassure au-dessus du range récent, accompagnée d'une volatilité en expansion et d'une tendance courte favorable."
    elif signal == "VENTE":
        title = "Pourquoi rupture baissière ?"
        summary = "Le modèle de rupture détecte une cassure sous le range récent, accompagnée d'une volatilité en expansion et d'une tendance courte défavorable."
    else:
        title = "Pourquoi neutre ?"
        summary = "Le modèle de rupture ne détecte pas encore de cassure suffisamment cohérente entre volatilité, range et tendance."

    return {
        "title": title,
        "summary": summary,
        "reasons": [
            f"Cassure : direction détectée = {breakout_direction}.",
            f"Volatilité : ratio ATR = {float(volatility_ratio):.2f}." if pd.notna(volatility_ratio) else "Volatilité : indisponible.",
            f"Tendance : confirmation courte = {trend_confirmation}.",
        ],
        "scoreLabel": f"Score rupture volatilité : {score}/100",
    }


def analyze_volatility_breakout(
    time_series_data: dict[str, Any],
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
) -> dict[str, Any]:
    df = _to_dataframe(time_series_data)

    if df.empty:
        return {"model": "volatility_breakout", "signal": "NEUTRE", "score": 0, "indicators": {}, "signals": []}

    df["RSI"] = compute_rsi_series(df["close"])
    df = compute_macd(df)
    df = compute_atr(df)
    df = compute_breakout_context(df)

    latest = df.iloc[-1]
    score = compute_breakout_score(latest)

    volatility_ok = pd.notna(latest.get("volatility_ratio")) and float(latest["volatility_ratio"]) >= 1.10

    if latest.get("breakout_direction") == "haussier" and latest.get("trend_confirmation") == "haussier" and volatility_ok:
        signal = "ACHAT"
    elif latest.get("breakout_direction") == "baissier" and latest.get("trend_confirmation") == "baissier" and volatility_ok:
        signal = "VENTE"
    else:
        signal = "NEUTRE"

    return {
        "model": "volatility_breakout",
        "signal": signal,
        "score": score,
        "explanation": build_breakout_explanation(latest, signal, score),
        "signals": [],
        "lastSignal": None,
        "indicators": {
            "currentPrice": _safe_float(latest.get("close")),
            "ema20": _safe_float(latest.get("EMA20")),
            "ema50": _safe_float(latest.get("EMA50")),
            "atr14": _safe_float(latest.get("ATR14")),
            "volatilityRatio": _safe_float(latest.get("volatility_ratio")),
            "rangeHigh": _safe_float(latest.get("range_high")),
            "rangeLow": _safe_float(latest.get("range_low")),
            "breakoutDirection": latest.get("breakout_direction", "neutre"),
            "trendConfirmation": latest.get("trend_confirmation", "neutre"),
            "rsi14": _safe_float(latest.get("RSI")),
        },
        "chart": [
            {
                "datetime": row["datetime"].isoformat(),
                "open": _safe_float(row["open"]),
                "high": _safe_float(row["high"]),
                "low": _safe_float(row["low"]),
                "close": _safe_float(row["close"]),
                "ema20": _safe_float(row["EMA20"]),
                "ema50": _safe_float(row["EMA50"]),
                "atr14": _safe_float(row["ATR14"]),
                "volatilityRatio": _safe_float(row["volatility_ratio"]),
                "rangeHigh": _safe_float(row["range_high"]),
                "rangeLow": _safe_float(row["range_low"]),
                "breakoutDirection": row["breakout_direction"],
                "trendConfirmation": row["trend_confirmation"],
                "rsi14": _safe_float(row["RSI"]),
            }
            for _, row in df.tail(180).iterrows()
        ],
    }
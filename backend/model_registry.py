"""Four observational lenses on ONE market snapshot (no provider calls here).

Periods count 4h bars, not trading days. Thresholds are model definitions,
not probabilities, recommendations or performance claims.
"""
from __future__ import annotations

from copy import deepcopy
import math
from typing import Any
import pandas as pd
from cbpr_service import analyze_cbpr

MODELS = {
    "cbpr-v1": ("cbpr", "CBPR"),
    "mean-reversion-v1": ("mean_reversion", "Retour à la moyenne"),
    "volatility-breakout-v1": ("volatility_breakout", "Cassure de volatilité"),
    "trend-following-v1": ("trend_following", "Suivi de tendance"),
}


def number(value: Any) -> float | None:
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def observation(label: str, english: str, value: Any, unit: str = "") -> dict:
    return {"label": label, "labelEN": english, "value": number(value), "unit": unit}


def analyze_model(data: dict, model: str, *, symbol: str, asset_name: str, exchange: str) -> dict:
    df = pd.DataFrame(deepcopy(data.get("values", [])))
    if df.empty:
        raise ValueError("No market bars")
    df = df.sort_values("datetime").reset_index(drop=True)
    for key in ("open", "high", "low", "close"):
        df[key] = pd.to_numeric(df[key], errors="coerce")
    if df[["open", "high", "low", "close"]].isna().any().any() or len(df) < 200:
        raise ValueError("At least 200 valid OHLC bars are required")
    close = df.close
    price = float(close.iloc[-1])
    chart = df[["datetime", "open", "high", "low", "close"]].to_dict("records")
    indicators: dict = {"currentPrice": price}
    legacy: dict = {}
    if model == "cbpr":
        legacy = analyze_cbpr(deepcopy(data), symbol=symbol, asset_name=asset_name, exchange=exchange)
        indicators = legacy.get("indicators", {})
        chart = legacy.get("chart", chart)
        center = number(indicators.get("sma200"))
        direction = str(indicators.get("channelDirection") or indicators.get("direction") or "").lower()
        state = "UPWARD" if direction in {"up", "bullish", "haussier", "hausse"} else "DOWNWARD" if direction in {"down", "bearish", "baissier", "baisse"} else "BALANCED"
        description = "Le canal décrit la position et l’évolution du prix autour de sa moyenne longue. Il ne constitue pas une consigne d’action."
        english = "The channel describes the price around its long-term average. It is not an instruction to trade."
        cards = [observation("Moyenne 200 bougies", "200-bar average", center), observation("RSI 14", "RSI 14", indicators.get("rsi14")), observation("Support", "Support", indicators.get("pivotSupport")), observation("Résistance", "Resistance", indicators.get("pivotResistance"))]
    elif model == "mean_reversion":
        mean = close.rolling(20).mean()
        deviation = close.rolling(20).std(ddof=0)
        z = (close - mean) / deviation.replace(0, float("nan"))
        last_z = number(z.iloc[-1]) or 0.0
        state = "ABOVE_MEAN" if last_z >= 2 else "BELOW_MEAN" if last_z <= -2 else "NEAR_MEAN"
        description = "Le prix est comparé à sa moyenne sur 20 bougies et à sa dispersion. Un écart ne garantit pas un retour à la moyenne."
        english = "Price is compared with its 20-bar average and dispersion. A deviation does not guarantee a return to the mean."
        cards = [observation("Moyenne 20 bougies", "20-bar average", mean.iloc[-1]), observation("Écart normalisé", "Standardized distance", last_z, "σ"), observation("Dispersion", "Dispersion", deviation.iloc[-1])]
        for i, point in enumerate(chart):
            point.update(mean=number(mean.iloc[i]), meanUpper=number((mean + 2*deviation).iloc[i]), meanLower=number((mean - 2*deviation).iloc[i]))
    elif model == "volatility_breakout":
        # Prior range excludes the current bar: no look-ahead / self-inclusion.
        high = df.high.rolling(20).max().shift(1)
        low = df.low.rolling(20).min().shift(1)
        tr = pd.concat([df.high-df.low, (df.high-close.shift()).abs(), (df.low-close.shift()).abs()], axis=1).max(axis=1)
        atr = tr.rolling(14).mean()
        ratio = atr / atr.rolling(50).mean().replace(0, float("nan"))
        state = "BREAKOUT_UP" if price > high.iloc[-1] else "BREAKOUT_DOWN" if price < low.iloc[-1] else "IN_RANGE"
        description = "Le prix est comparé au range des 20 bougies précédentes. L’ATR décrit la volatilité ; une cassure peut être temporaire."
        english = "Price is compared with the previous 20-bar range. ATR describes volatility; a breakout may be temporary."
        cards = [observation("Range haut", "Range high", high.iloc[-1]), observation("Range bas", "Range low", low.iloc[-1]), observation("ATR 14", "ATR 14", atr.iloc[-1]), observation("Ratio de volatilité", "Volatility ratio", ratio.iloc[-1])]
        for i, point in enumerate(chart):
            point.update(rangeHigh=number(high.iloc[i]), rangeLow=number(low.iloc[i]))
    elif model == "trend_following":
        fast = close.ewm(span=20, adjust=False).mean()
        slow = close.ewm(span=50, adjust=False).mean()
        gap = (fast.iloc[-1]/slow.iloc[-1]-1)*100 if slow.iloc[-1] else 0
        state = "UPWARD" if gap > 0.25 else "DOWNWARD" if gap < -0.25 else "BALANCED"
        description = "Deux moyennes exponentielles, sur 20 et 50 bougies, décrivent la direction du prix. Elles réagissent avec retard et ne prédisent pas la suite."
        english = "20- and 50-bar exponential averages describe price direction. They lag behind price and do not predict what comes next."
        cards = [observation("EMA 20", "EMA 20", fast.iloc[-1]), observation("EMA 50", "EMA 50", slow.iloc[-1]), observation("Écart des moyennes", "Average gap", gap, "%")]
        for i, point in enumerate(chart):
            point.update(ema20=number(fast.iloc[i]), ema50=number(slow.iloc[i]))
    else:
        raise ValueError(f"Unsupported model: {model}")
    # Keep legacy CBPR signal for old clients; use separate observational state for alerts.
    return {
        "signal": legacy.get("signal", state), "score": legacy.get("score", 0),
        "state": state, "indicators": indicators, "observations": cards,
        "explanation": {"title": "Lecture du modèle", "summary": description, "summaryEN": english, "reasons": []},
        "chart": chart,
    }


def analyze_snapshot(data: dict, quote: dict, *, symbol: str, timeframe: str, normalized_quote: dict) -> dict:
    results, errors = {}, {}
    for version, (model, _) in MODELS.items():
        try:
            result = analyze_model(data, model, symbol=symbol, asset_name=quote.get("name", symbol), exchange=quote.get("exchange", ""))
            chart = []
            for point in result.pop("chart"):
                point = dict(point)
                point["datetime"] = pd.Timestamp(point["datetime"]).isoformat()
                for old, new in (("sma200", "SMA200"), ("sma200Upper", "SMA200_upper"), ("sma200Lower", "SMA200_lower")):
                    if old in point:
                        point[new] = point.pop(old)
                chart.append(point)
            results[version] = {"analysis": result, "values": chart, "quote": normalized_quote, "meta": data.get("meta", {}), "interval": timeframe}
        except Exception as error:
            errors[version] = f"{type(error).__name__}: {error}"
    return {"models": results, "errors": errors}

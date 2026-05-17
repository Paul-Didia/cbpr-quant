from __future__ import annotations

from typing import Any

import pandas as pd

from cbpr_service import _to_dataframe, compute_rsi_series, compute_sma200


def _safe_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _score(value: float) -> int:
    return int(max(0, min(100, round(value))))


def get_mean_reversion_margin(symbol: str, asset_name: str = "", exchange: str = "") -> float:
    base = symbol.split("/")[0].split(":")[-1].upper()

    if base in {"BTC", "ETH", "SOL", "BNB", "ADA", "XRP", "DOGE", "DOT"}:
        return 0.10
    if "/" in symbol and (exchange or "").lower() == "forex":
        return 0.02
    if "etf" in (asset_name or "").lower() or "ucits" in (asset_name or "").lower():
        return 0.04
    return 0.09


def compute_mean_reversion_context(
    df: pd.DataFrame,
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
) -> pd.DataFrame:
    df = compute_sma200(df)
    df["RSI"] = compute_rsi_series(df["close"])

    margin = get_mean_reversion_margin(symbol, asset_name, exchange)
    df["mean_upper"] = df["SMA200"] * (1 + margin)
    df["mean_lower"] = df["SMA200"] * (1 - margin)
    df["distance_pct"] = ((df["close"] - df["SMA200"]) / df["SMA200"]) * 100
    return df


def compute_mean_reversion_score(row: pd.Series) -> int:
    close = row.get("close")
    mean = row.get("SMA200")
    upper = row.get("mean_upper")
    lower = row.get("mean_lower")
    rsi = row.get("RSI")

    if pd.isna(close) or pd.isna(mean) or pd.isna(upper) or pd.isna(lower):
        return 10

    close_value = float(close)
    mean_value = float(mean)
    upper_value = float(upper)
    lower_value = float(lower)

    if close_value > upper_value:
        distance_ratio = min(abs(close_value - upper_value) / max(abs(mean_value), 1e-6) / 0.05, 1)
        score = 50 + distance_ratio * 35
        if pd.notna(rsi) and float(rsi) >= 60:
            score += 15
        return _score(score)

    if close_value < lower_value:
        distance_ratio = min(abs(lower_value - close_value) / max(abs(mean_value), 1e-6) / 0.05, 1)
        score = 50 + distance_ratio * 35
        if pd.notna(rsi) and float(rsi) <= 40:
            score += 15
        return _score(score)

    return 20


def build_mean_reversion_explanation(row: pd.Series, signal: str, score: int) -> dict[str, Any]:
    distance_pct = row.get("distance_pct")
    rsi = row.get("RSI")

    if signal == "ACHAT":
        title = "Pourquoi retour à la moyenne ?"
        summary = "Le prix évolue sous sa moyenne long terme avec un niveau d'écart suffisant pour envisager un retour vers l'équilibre."
    elif signal == "VENTE":
        title = "Pourquoi risque de retour ?"
        summary = "Le prix évolue au-dessus de sa moyenne long terme avec un niveau d'écart suffisant pour envisager un retour vers l'équilibre."
    else:
        title = "Pourquoi neutre ?"
        summary = "Le prix reste proche de sa moyenne long terme. L'écart n'est pas suffisant pour signaler une vraie tension."

    return {
        "title": title,
        "summary": summary,
        "reasons": [
            "Moyenne long terme : SMA200 utilisée comme point d'équilibre.",
            f"Écart à la moyenne : {float(distance_pct):.2f}%." if pd.notna(distance_pct) else "Écart à la moyenne : indisponible.",
            f"RSI : {float(rsi):.1f}." if pd.notna(rsi) else "RSI : indisponible.",
        ],
        "scoreLabel": f"Score retour à la moyenne : {score}/100",
    }


def analyze_mean_reversion(
    time_series_data: dict[str, Any],
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
) -> dict[str, Any]:
    df = _to_dataframe(time_series_data)

    if df.empty:
        return {"model": "mean_reversion", "signal": "NEUTRE", "score": 0, "indicators": {}, "signals": []}

    df = compute_mean_reversion_context(df, symbol, asset_name, exchange)
    latest = df.iloc[-1]

    signal = "NEUTRE"
    if pd.notna(latest.get("close")) and pd.notna(latest.get("mean_upper")) and pd.notna(latest.get("mean_lower")):
        if float(latest["close"]) < float(latest["mean_lower"]):
            signal = "ACHAT"
        elif float(latest["close"]) > float(latest["mean_upper"]):
            signal = "VENTE"

    score = compute_mean_reversion_score(latest)

    return {
        "model": "mean_reversion",
        "signal": signal,
        "score": score,
        "explanation": build_mean_reversion_explanation(latest, signal, score),
        "signals": [],
        "lastSignal": None,
        "indicators": {
            "currentPrice": _safe_float(latest.get("close")),
            "mean": _safe_float(latest.get("SMA200")),
            "meanUpper": _safe_float(latest.get("mean_upper")),
            "meanLower": _safe_float(latest.get("mean_lower")),
            "distancePct": _safe_float(latest.get("distance_pct")),
            "rsi14": _safe_float(latest.get("RSI")),
        },
        "chart": [
            {
                "datetime": row["datetime"].isoformat(),
                "open": _safe_float(row["open"]),
                "high": _safe_float(row["high"]),
                "low": _safe_float(row["low"]),
                "close": _safe_float(row["close"]),
                "mean": _safe_float(row["SMA200"]),
                "meanUpper": _safe_float(row["mean_upper"]),
                "meanLower": _safe_float(row["mean_lower"]),
                "distancePct": _safe_float(row["distance_pct"]),
                "rsi14": _safe_float(row["RSI"]),
            }
            for _, row in df.tail(180).iterrows()
        ],
    }
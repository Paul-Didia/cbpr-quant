from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _to_dataframe(time_series_data: dict[str, Any]) -> pd.DataFrame:
    values = time_series_data.get("values", [])
    if not values:
        return pd.DataFrame()

    df = pd.DataFrame(values)

    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])

    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce", downcast="float")

    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce", downcast="float").fillna(0.0)
    else:
        df["volume"] = np.float32(0.0)

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



def compute_sma200_trend_direction(
    df: pd.DataFrame,
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
    lookback: int = 120,
) -> pd.DataFrame:
    trend_directions: list[str] = []

    base = symbol.split("/")[0].split(":")[-1].upper()
    crypto = ["BTC", "ETH", "SOL", "ADA", "XRP", "BNB", "DOGE", "DOT"]

    if base in crypto:
        flat_threshold_pct = 0.005
    elif "/" in symbol and (exchange or "").lower() == "forex":
        flat_threshold_pct = 0.002
    elif is_etf(symbol, asset_name, exchange):
        flat_threshold_pct = 0.003
    else:
        flat_threshold_pct = 0.005

    sma_series = df["SMA200"]

    for i in range(len(df)):
        current_sma = sma_series.iloc[i]

        if pd.isna(current_sma):
            trend_directions.append("neutre")
            continue

        start_index = max(0, i - lookback)
        sma_window = sma_series.iloc[start_index : i + 1].dropna()

        if len(sma_window) < 2:
            trend_directions.append("neutre")
            continue

        y = sma_window.to_numpy(dtype=float)
        x = np.arange(len(y), dtype=float)

        slope = np.polyfit(x, y, 1)[0]
        mean_sma = float(np.mean(y))

        if mean_sma == 0:
            trend_directions.append("neutre")
            continue

        # On convertit la pente par bougie en variation totale estimée sur toute la fenêtre.
        # Sinon la pente brute reste trop petite et classe trop souvent la tendance en neutre.
        estimated_total_move = slope * max(len(y) - 1, 1)
        slope_pct = estimated_total_move / mean_sma

        if slope_pct > flat_threshold_pct:
            trend_directions.append("haussier")
        elif slope_pct < -flat_threshold_pct:
            trend_directions.append("baissier")
        else:
            trend_directions.append("neutre")

    df["sma200_trend_direction"] = trend_directions
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

    df["pivot_high"] = pd.Series(pivot_highs, index=df.index, dtype="float32")
    df["pivot_low"] = pd.Series(pivot_lows, index=df.index, dtype="float32")
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


# --- CBPR score and actionable signal logic ---

def _clamp_score(value: float) -> int:
    return int(max(0, min(100, round(value))))


def compute_cbpr_score(row: pd.Series) -> int:
    direction = row.get("direction", "neutre")
    close = row.get("close")
    sma200 = row.get("SMA200")
    sma200_upper = row.get("SMA200_upper")
    sma200_lower = row.get("SMA200_lower")
    rsi = row.get("RSI")
    macd = row.get("MACD")
    signal_line = row.get("Signal")
    delta_pct = row.get("delta_pct")
    pivot_support = row.get("pivot_support")
    pivot_resistance = row.get("pivot_resistance")
    below_days = int(row.get("below_sma200_days", 0) or 0)
    buy_days = int(row.get("buy_zone_days", 0) or 0)

    if (
        pd.isna(close)
        or pd.isna(sma200)
        or pd.isna(sma200_upper)
        or pd.isna(sma200_lower)
    ):
        return 0

    channel_width = float(sma200_upper) - float(sma200_lower)
    half_channel = channel_width / 2 if channel_width > 0 else 0.0
    channel_mid = (float(sma200_upper) + float(sma200_lower)) / 2

    if direction == "neutre":
        score = 0.0

        if half_channel > 0:
            distance_to_mid = abs(float(close) - channel_mid)
            center_ratio = max(0.0, 1.0 - (distance_to_mid / half_channel))
            score += center_ratio * 40
        else:
            score += 20

        if pd.notna(rsi):
            rsi_distance = abs(float(rsi) - 50.0)
            rsi_ratio = max(0.0, 1.0 - (rsi_distance / 20.0))
            score += rsi_ratio * 20

        if pd.notna(macd) and pd.notna(signal_line):
            macd_gap = abs(float(macd) - float(signal_line))
            macd_scale = max(abs(float(close)) * 0.01, 1e-6)
            macd_ratio = max(0.0, 1.0 - (macd_gap / macd_scale))
            score += macd_ratio * 20

        if pd.notna(delta_pct):
            daily_move_ratio = max(0.0, 1.0 - min(abs(float(delta_pct)) / 0.03, 1.0))
            score += daily_move_ratio * 10

        nearest_pivot_distance = None
        if pd.notna(pivot_support):
            nearest_pivot_distance = abs(float(close) - float(pivot_support)) / float(close)
        if pd.notna(pivot_resistance):
            resistance_distance = abs(float(pivot_resistance) - float(close)) / float(close)
            if nearest_pivot_distance is None or resistance_distance < nearest_pivot_distance:
                nearest_pivot_distance = resistance_distance

        if nearest_pivot_distance is None:
            score += 10
        else:
            pivot_neutral_ratio = min(nearest_pivot_distance / 0.05, 1.0)
            score += pivot_neutral_ratio * 10

        return _clamp_score(score)

    score = 0.0

    outside_distance = 0.0
    outside_reference = max(channel_width * 0.5, abs(float(close)) * 0.02, 1e-6)

    if direction == "achat":
        outside_distance = max(0.0, float(sma200_lower) - float(close))
    elif direction == "vente":
        outside_distance = max(0.0, float(close) - float(sma200_upper))

    outside_ratio = min(outside_distance / outside_reference, 1.0)
    score += outside_ratio * 35

    if pd.notna(rsi):
        if direction == "achat":
            if float(rsi) <= 30:
                score += 20
            elif float(rsi) <= 40:
                score += 12
            elif float(rsi) <= 50:
                score += 5
        elif direction == "vente":
            if float(rsi) >= 70:
                score += 20
            elif float(rsi) >= 60:
                score += 12
            elif float(rsi) >= 50:
                score += 5

    if pd.notna(macd) and pd.notna(signal_line):
        if direction == "achat":
            if float(macd) > float(signal_line):
                score += 20
            else:
                score += 5
        elif direction == "vente":
            if float(macd) < float(signal_line):
                score += 20
            else:
                score += 5

    if pd.notna(delta_pct):
        if direction == "achat":
            if float(delta_pct) < 0:
                score += 10
            elif float(delta_pct) < 0.01:
                score += 4
        elif direction == "vente":
            if float(delta_pct) > 0:
                score += 10
            elif float(delta_pct) > -0.01:
                score += 4

    pivot_adjustment = 0.0
    if direction == "achat" and pd.notna(pivot_support):
        support_distance_pct = abs(float(close) - float(pivot_support)) / float(close)
        if float(pivot_support) <= float(close):
            if support_distance_pct <= 0.015:
                pivot_adjustment += 8
            elif support_distance_pct <= 0.03:
                pivot_adjustment += 4
            elif support_distance_pct > 0.05:
                pivot_adjustment -= 4

    if direction == "achat" and pd.notna(pivot_resistance):
        resistance_distance_pct = abs(float(pivot_resistance) - float(close)) / float(close)
        if float(pivot_resistance) >= float(close) and resistance_distance_pct <= 0.02:
            pivot_adjustment -= 8

    if direction == "vente" and pd.notna(pivot_resistance):
        resistance_distance_pct = abs(float(pivot_resistance) - float(close)) / float(close)
        if float(pivot_resistance) >= float(close):
            if resistance_distance_pct <= 0.015:
                pivot_adjustment += 8
            elif resistance_distance_pct <= 0.03:
                pivot_adjustment += 4
            elif resistance_distance_pct > 0.05:
                pivot_adjustment -= 4

    if direction == "vente" and pd.notna(pivot_support):
        support_distance_pct = abs(float(close) - float(pivot_support)) / float(close)
        if float(pivot_support) <= float(close) and support_distance_pct <= 0.02:
            pivot_adjustment -= 8

    score += pivot_adjustment

    if direction == "achat":
        recovery_started = (
            pd.notna(macd)
            and pd.notna(signal_line)
            and pd.notna(rsi)
            and float(macd) > float(signal_line)
            and float(rsi) >= 45
        )

        if below_days >= 20:
            score -= 10
        if below_days >= 35:
            score -= 10
        if below_days >= 50:
            score -= 15

        if buy_days >= 20 and not recovery_started:
            score -= 10
        if buy_days >= 35 and not recovery_started:
            score -= 10
        if buy_days >= 50 and not recovery_started:
            score -= 15

    return _clamp_score(score)


def is_cbpr_signal_actionable(row: pd.Series) -> bool:
    direction = row.get("direction", "neutre")
    if direction == "neutre":
        return False

    delta_pct = row.get("delta_pct")
    if pd.notna(delta_pct):
        if direction == "vente" and float(delta_pct) <= 0:
            return False
        if direction == "achat" and float(delta_pct) >= 0:
            return False

    if direction == "achat":
        below_days = int(row.get("below_sma200_days", 0) or 0)
        buy_days = int(row.get("buy_zone_days", 0) or 0)
        macd = row.get("MACD")
        signal_line = row.get("Signal")
        rsi = row.get("RSI")
        recovery_started = (
            pd.notna(macd)
            and pd.notna(signal_line)
            and pd.notna(rsi)
            and float(macd) > float(signal_line)
            and float(rsi) >= 45
        )
        if (below_days >= 50 or buy_days >= 50) and not recovery_started:
            return False

    return True


# --- CBPR Explanation Builder ---

def build_cbpr_explanation(
    row: pd.Series,
    signal: str,
    score: int,
    bollinger_zone: str,
) -> dict[str, Any]:
    direction = row.get("direction", "neutre")
    channel_direction = row.get("channel_direction", "neutre")
    rsi = row.get("RSI")
    macd = row.get("MACD")
    signal_line = row.get("Signal")
    close = row.get("close")
    sma200_upper = row.get("SMA200_upper")
    sma200_lower = row.get("SMA200_lower")
    pivot_support = row.get("pivot_support")
    pivot_resistance = row.get("pivot_resistance")

    # --- Phrase 1 : synthèse humaine du contexte ---
    if signal == "ACHAT":
        title = "Pourquoi opportunité ?"
        summary = "La synthèse CBPR indique une opportunité : le prix évolue dans une zone d’excès baissier et plusieurs indicateurs suggèrent qu’un retour vers l’équilibre devient crédible."
    elif signal == "VENTE":
        title = "Pourquoi risque ?"
        summary = "La synthèse CBPR indique une zone de risque : le prix évolue dans une zone d’excès haussier et plusieurs indicateurs suggèrent qu’un retour vers l’équilibre devient crédible."
    else:
        if direction == "achat":
            title = "Pourquoi neutre ?"
            summary = "La synthèse CBPR reste neutre : le prix se trouve déjà sous le canal, mais l’ensemble des indicateurs ne confirme pas encore une opportunité suffisamment nette."
        elif direction == "vente":
            title = "Pourquoi neutre ?"
            summary = "La synthèse CBPR reste neutre : le prix se trouve déjà au-dessus du canal, mais l’ensemble des indicateurs ne confirme pas encore un risque suffisamment net."
        else:
            title = "Pourquoi neutre ?"
            summary = "La synthèse CBPR reste neutre : le prix évolue globalement dans une zone d’équilibre et les indicateurs ne montrent pas encore de déséquilibre marqué."

    # --- Phrase 2 : canal ---
    if direction == "achat":
        canal_reason = "Canal : le prix évolue sous la borne basse du canal CBPR, ce qui signale un excès baissier par rapport à sa zone d’équilibre."
    elif direction == "vente":
        canal_reason = "Canal : le prix évolue au-dessus de la borne haute du canal CBPR, ce qui signale un excès haussier par rapport à sa zone d’équilibre."
    else:
        if channel_direction == "haussier":
            canal_reason = "Canal : le prix reste dans son canal, avec une tendance de fond encore haussière."
        elif channel_direction == "baissier":
            canal_reason = "Canal : le prix reste dans son canal, avec une tendance de fond encore baissière."
        else:
            canal_reason = "Canal : le prix reste dans son canal, sans excès clair ni déséquilibre majeur à ce stade."

    # --- Phrase 3 : pivot ---
    if pd.notna(close) and pd.notna(pivot_support) and float(pivot_support) <= float(close):
        support_distance_pct = abs(float(close) - float(pivot_support)) / max(abs(float(close)), 1e-6)
    else:
        support_distance_pct = None

    if pd.notna(close) and pd.notna(pivot_resistance) and float(pivot_resistance) >= float(close):
        resistance_distance_pct = abs(float(pivot_resistance) - float(close)) / max(abs(float(close)), 1e-6)
    else:
        resistance_distance_pct = None

    if direction == "achat" and support_distance_pct is not None and support_distance_pct <= 0.03:
        pivot_reason = "Pivot : un support reste proche du prix actuel, ce qui renforce l’idée d’une zone de réaction potentielle."
    elif direction == "vente" and resistance_distance_pct is not None and resistance_distance_pct <= 0.03:
        pivot_reason = "Pivot : une résistance reste proche du prix actuel, ce qui renforce l’idée d’une zone de réaction potentielle."
    elif support_distance_pct is not None and resistance_distance_pct is not None:
        if support_distance_pct <= resistance_distance_pct:
            pivot_reason = "Pivot : le prix reste plus proche d’un support que d’une résistance, mais ce niveau ne suffit pas à lui seul à valider le signal."
        else:
            pivot_reason = "Pivot : le prix reste plus proche d’une résistance que d’un support, mais ce niveau ne suffit pas à lui seul à valider le signal."
    elif support_distance_pct is not None:
        pivot_reason = "Pivot : un support existe sous le prix actuel, mais il ne suffit pas à lui seul à valider le contexte."
    elif resistance_distance_pct is not None:
        pivot_reason = "Pivot : une résistance existe au-dessus du prix actuel, mais elle ne suffit pas à elle seule à valider le contexte."
    else:
        pivot_reason = "Pivot : aucun niveau pivot proche ne renforce clairement le scénario actuel."

    # --- Phrase 4 : RSI ---
    if pd.isna(rsi):
        rsi_reason = "RSI : l’indicateur est indisponible sur cette bougie."
    elif float(rsi) <= 30:
        rsi_reason = "RSI : l’indicateur signale un excès baissier marqué."
    elif float(rsi) <= 40:
        rsi_reason = "RSI : l’indicateur reste faible, ce qui montre encore une pression vendeuse importante."
    elif float(rsi) >= 70:
        rsi_reason = "RSI : l’indicateur signale un excès haussier marqué."
    elif float(rsi) >= 60:
        rsi_reason = "RSI : l’indicateur reste élevé, ce qui montre encore une pression acheteuse importante."
    else:
        rsi_reason = "RSI : l’indicateur reste intermédiaire, sans excès net dans un sens ou dans l’autre."

    # --- Phrase 5 : Bollinger ---
    if bollinger_zone == "Sur bande basse":
        bollinger_reason = "Bollinger : le prix travaille une zone basse, ce qui confirme une pression baissière ou un possible début de réaction technique."
    elif bollinger_zone == "Sur bande haute":
        bollinger_reason = "Bollinger : le prix travaille une zone haute, ce qui confirme une pression haussière ou un possible début d’essoufflement."
    elif bollinger_zone == "Zone neutre":
        bollinger_reason = "Bollinger : les bandes ne montrent pas de tension particulière autour du prix actuel."
    else:
        bollinger_reason = "Bollinger : l’indicateur est indisponible sur cette bougie."

    # Le MACD reste utilisé dans la synthèse de calcul mais n’est plus affiché en phrase dédiée.
    # On ajuste légèrement la phrase de synthèse si le MACD renforce ou affaiblit le scénario.
    if pd.notna(macd) and pd.notna(signal_line):
        if signal == "ACHAT" and float(macd) > float(signal_line):
            summary += " Le MACD commence en plus à se redresser."
        elif signal == "VENTE" and float(macd) < float(signal_line):
            summary += " Le MACD commence en plus à ralentir."
        elif signal == "NEUTRE" and direction == "achat" and float(macd) <= float(signal_line):
            summary += " Le MACD ne confirme pas encore un vrai redressement."
        elif signal == "NEUTRE" and direction == "vente" and float(macd) >= float(signal_line):
            summary += " Le MACD ne confirme pas encore un vrai ralentissement."

    return {
        "title": title,
        "summary": summary,
        "reasons": [canal_reason, pivot_reason, rsi_reason, bollinger_reason],
        "scoreLabel": f"Score CBPR : {score}/100",
    }


def cbpr_analyze_historical(
    df_4h: pd.DataFrame,
    symbol: str,
    asset_name: str = "",
    exchange: str = "",
):
    df = df_4h
    df["RSI"] = compute_rsi_series(df["close"])
    df = compute_bbands(df)
    df = compute_macd(df)
    df = compute_sma200(df)
    df = compute_sma200_trend_direction(df, symbol=symbol, asset_name=asset_name, exchange=exchange)
    df = compute_pivot_levels(df)
    df = compute_daily_delta(df)

    base = symbol.split("/")[0].split(":")[-1].upper()

    crypto_margins = {
        "BTC": 0.06,
        "ETH": 0.08,
        "SOL": 0.10,
        "BNB": 0.10,
        "ADA": 0.10,
        "XRP": 0.10,
        "DOGE": 0.10,
        "DOT": 0.10,
    }

    if base in crypto_margins:
        margin = crypto_margins[base]
    elif "/" in symbol and (exchange or "").lower() == "forex":
        margin = 0.02
    elif is_etf(symbol, asset_name, exchange):
        margin = 0.04
    else:
        margin = 0.09

    df["SMA200_upper"] = df["SMA200"] * (1 + margin)
    df["SMA200_lower"] = df["SMA200"] * (1 - margin)

    # Vectorized direction computation (much faster than df.apply on every request)
    df["direction"] = "neutre"

    valid_sma_mask = pd.notna(df["SMA200"])
    outside_channel_mask = ~(
        (df["close"] >= df["SMA200_lower"]) &
        (df["close"] <= df["SMA200_upper"])
    )

    achat_mask = valid_sma_mask & outside_channel_mask & (df["close"] < df["SMA200"])
    vente_mask = valid_sma_mask & outside_channel_mask & (df["close"] >= df["SMA200"])

    df.loc[achat_mask, "direction"] = "achat"
    df.loc[vente_mask, "direction"] = "vente"
    df["channel_direction"] = df["sma200_trend_direction"]

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

    float_cols = [
        "RSI",
        "BB_upper",
        "BB_lower",
        "BB_middle",
        "MACD",
        "Signal",
        "SMA200",
        "SMA200_upper",
        "SMA200_lower",
        "pivot_high",
        "pivot_low",
        "pivot_support",
        "pivot_resistance",
        "delta_pct",
    ]
    for col in float_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce", downcast="float")

    signals = []

    # We only need recent signals for UI/history.
    # Avoid scanning the full dataset on every API call.
    recent_df = df.tail(180)

    for _, row in recent_df.iterrows():
        if row["direction"] == "neutre":
            continue

        score = compute_cbpr_score(row)

        if not is_cbpr_signal_actionable(row):
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

    # 🆕 Le statut principal doit toujours être calculé à partir des indicateurs de la bougie actuelle
    score = compute_cbpr_score(latest)
    signal = "NEUTRE"

    if latest["direction"] != "neutre" and is_cbpr_signal_actionable(latest):
        signal = "ACHAT" if latest["direction"] == "achat" else "VENTE"

    if pd.isna(latest.get("BB_upper")) or pd.isna(latest.get("BB_lower")):
        bollinger_zone = "Indisponible"
    elif latest["close"] >= latest["BB_upper"]:
        bollinger_zone = "Sur bande haute"
    elif latest["close"] <= latest["BB_lower"]:
        bollinger_zone = "Sur bande basse"
    else:
        bollinger_zone = "Zone neutre"
    explanation = build_cbpr_explanation(latest, signal, score, bollinger_zone)

    # Keep API payload lighter: frontend only needs recent chart history
    chart_df = df[
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
    ].tail(180)

    chart = [
        {
            "datetime": row["datetime"].isoformat(),
            "open": None if pd.isna(row["open"]) else float(row["open"]),
            "high": None if pd.isna(row["high"]) else float(row["high"]),
            "low": None if pd.isna(row["low"]) else float(row["low"]),
            "close": None if pd.isna(row["close"]) else float(row["close"]),
            "sma200": None if pd.isna(row["SMA200"]) else float(row["SMA200"]),
            "sma200Upper": None if pd.isna(row["SMA200_upper"]) else float(row["SMA200_upper"]),
            "sma200Lower": None if pd.isna(row["SMA200_lower"]) else float(row["SMA200_lower"]),
            "pivotSupport": None if pd.isna(row["pivot_support"]) else float(row["pivot_support"]),
            "pivotResistance": None if pd.isna(row["pivot_resistance"]) else float(row["pivot_resistance"]),
        }
        for _, row in chart_df.iterrows()
    ]

    legacy_dataframe = chart_df.rename(
        columns={
            "pivot_support": "pivot_support",
            "pivot_resistance": "pivot_resistance",
        }
    ).copy()

    return {
        "signal": signal,
        "score": score,
        "explanation": explanation,
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
        "chart": chart,
        "dataframe": legacy_dataframe,
    }
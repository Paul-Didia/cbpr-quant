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
    reasons: list[str] = []

    direction = row.get("direction", "neutre")
    channel_direction = row.get("channel_direction", "neutre")
    rsi = row.get("RSI")
    macd = row.get("MACD")
    signal_line = row.get("Signal")
    close = row.get("close")
    sma200 = row.get("SMA200")
    sma200_upper = row.get("SMA200_upper")
    sma200_lower = row.get("SMA200_lower")
    pivot_support = row.get("pivot_support")
    pivot_resistance = row.get("pivot_resistance")
    buy_days = int(row.get("buy_zone_days", 0) or 0)

    if signal == "ACHAT":
        if pd.notna(close) and pd.notna(sma200_lower):
            reasons.append("Le prix évolue sous la borne basse du canal CBPR, ce qui place l’actif dans une zone d’excès baissier.")

        if channel_direction == "baissier":
            reasons.append("La tendance de fond reste baissière, ce qui renforce l’idée d’un actif actuellement sous pression.")
        elif channel_direction == "neutre":
            reasons.append("La tendance de fond reste modérée, ce qui laisse la place à un retour technique si le mouvement ralentit.")
        elif channel_direction == "haussier":
            reasons.append("La tendance de fond reste haussière, ce qui rend l’écart sous le canal encore plus intéressant à surveiller.")

        if pd.notna(rsi):
            if float(rsi) <= 30:
                reasons.append("Le RSI indique un excès baissier marqué, signe d’un mouvement déjà très étiré.")
            elif float(rsi) <= 40:
                reasons.append("Le RSI reste faible, ce qui montre que la pression vendeuse est encore importante.")

        if pd.notna(macd) and pd.notna(signal_line):
            if float(macd) > float(signal_line):
                reasons.append("Le MACD commence à se redresser au-dessus de sa ligne signal, ce qui suggère un ralentissement de la baisse.")
            else:
                reasons.append("Le MACD reste encore sous sa ligne signal, ce qui invite à surveiller la stabilisation du mouvement.")

        if pd.notna(pivot_support) and pd.notna(close):
            support_distance_pct = abs(float(close) - float(pivot_support)) / max(abs(float(close)), 1e-6)
            if float(pivot_support) <= float(close) and support_distance_pct <= 0.03:
                reasons.append("Un pivot support reste proche du prix actuel, ce qui renforce la possibilité d’une réaction technique.")

        if buy_days >= 20:
            reasons.append("L’actif reste depuis plusieurs jours dans sa zone d’achat, ce qui réduit la qualité du signal malgré l’excès observé.")

        title = "Pourquoi opportunité ?"
        summary = "Le signal est classé en opportunité car le prix se trouve dans une zone d’excès baissier, avec un contexte technique compatible avec un retour à l’équilibre."

    elif signal == "VENTE":
        if pd.notna(close) and pd.notna(sma200_upper):
            reasons.append("Le prix évolue au-dessus de la borne haute du canal CBPR, ce qui place l’actif dans une zone d’excès haussier.")

        if channel_direction == "haussier":
            reasons.append("La tendance de fond reste haussière, mais l’actif paraît déjà fortement étendu au-dessus de son équilibre.")
        elif channel_direction == "neutre":
            reasons.append("La tendance de fond reste modérée, ce qui peut favoriser un retour vers la zone centrale du canal.")
        elif channel_direction == "baissier":
            reasons.append("La tendance de fond est déjà baissière, ce qui rend l’excès haussier encore plus fragile.")

        if pd.notna(rsi):
            if float(rsi) >= 70:
                reasons.append("Le RSI indique un excès haussier marqué, signe d’un mouvement déjà très tendu.")
            elif float(rsi) >= 60:
                reasons.append("Le RSI reste élevé, ce qui montre que le prix avance dans une zone déjà exigeante.")

        if pd.notna(macd) and pd.notna(signal_line):
            if float(macd) < float(signal_line):
                reasons.append("Le MACD passe sous sa ligne signal, ce qui suggère un ralentissement du mouvement haussier.")
            else:
                reasons.append("Le MACD reste encore orienté à la hausse, ce qui invite à surveiller le timing du retournement.")

        if pd.notna(pivot_resistance) and pd.notna(close):
            resistance_distance_pct = abs(float(pivot_resistance) - float(close)) / max(abs(float(close)), 1e-6)
            if float(pivot_resistance) >= float(close) and resistance_distance_pct <= 0.03:
                reasons.append("Un pivot résistance se situe proche du prix actuel, ce qui peut freiner la poursuite du mouvement.")

        title = "Pourquoi risque ?"
        summary = "Le signal est classé en risque car le prix se trouve dans une zone d’excès haussier, avec plusieurs indicateurs suggérant une zone plus fragile qu’une nouvelle opportunité d’entrée."

    else:
        if pd.notna(close) and pd.notna(sma200_lower) and pd.notna(sma200_upper):
            reasons.append("Le prix reste à l’intérieur du canal CBPR, sans excès clair au-dessus ou au-dessous de son équilibre de long terme.")

        if channel_direction == "haussier":
            reasons.append("La tendance de fond reste haussière, mais le prix actuel ne se trouve pas dans une zone d’excès assez marquée pour parler d’opportunité immédiate.")
        elif channel_direction == "baissier":
            reasons.append("La tendance de fond reste baissière, mais le prix actuel ne se trouve pas encore dans une zone d’excès suffisamment claire pour parler d’opportunité.")
        else:
            reasons.append("La tendance de fond reste neutre, ce qui traduit un marché sans déséquilibre majeur à cet instant.")

        if pd.notna(rsi):
            if 45 <= float(rsi) <= 55:
                reasons.append("Le RSI reste proche de son point d’équilibre, sans tension forte dans un sens ou dans l’autre.")
            elif 40 <= float(rsi) <= 60:
                reasons.append("Le RSI reste intermédiaire, ce qui confirme l’absence d’excès net.")

        if pd.notna(macd) and pd.notna(signal_line):
            macd_gap = abs(float(macd) - float(signal_line))
            if macd_gap < max(abs(float(close)) * 0.002, 0.05):
                reasons.append("Le MACD reste proche de sa ligne signal, ce qui suggère une dynamique encore équilibrée.")

        if bollinger_zone == "Zone neutre":
            reasons.append("Les bandes de Bollinger ne montrent pas de tension particulière autour du prix actuel.")
        elif bollinger_zone == "Sur bande basse":
            reasons.append("Le prix touche une zone basse de Bollinger, mais le reste du contexte ne valide pas encore une opportunité claire.")
        elif bollinger_zone == "Sur bande haute":
            reasons.append("Le prix touche une zone haute de Bollinger, mais le reste du contexte ne valide pas encore un risque suffisamment fort.")

        nearest_pivot_reason_added = False
        if pd.notna(pivot_support) and pd.notna(close):
            support_distance_pct = abs(float(close) - float(pivot_support)) / max(abs(float(close)), 1e-6)
            if float(pivot_support) <= float(close) and support_distance_pct <= 0.02:
                reasons.append("Un pivot reste proche, mais il ne suffit pas à lui seul à transformer le contexte en opportunité claire.")
                nearest_pivot_reason_added = True
        if not nearest_pivot_reason_added and pd.notna(pivot_resistance) and pd.notna(close):
            resistance_distance_pct = abs(float(pivot_resistance) - float(close)) / max(abs(float(close)), 1e-6)
            if float(pivot_resistance) >= float(close) and resistance_distance_pct <= 0.02:
                reasons.append("Une résistance pivot reste proche, mais le contexte global demeure encore équilibré.")

        title = "Pourquoi neutre ?"
        summary = "Le signal est classé en neutre car le prix reste globalement dans une zone d’équilibre, sans combinaison d’indicateurs suffisamment forte pour parler d’opportunité ou de risque marqué."

    if not reasons:
        reasons.append("Le contexte actuel reste équilibré et ne montre pas de déséquilibre technique suffisamment clair.")

    return {
        "title": title,
        "summary": summary,
        "reasons": reasons[:4],
        "scoreLabel": f"Score CBPR : {score}/100",
    }


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
    df = compute_sma200_trend_direction(df, symbol=symbol, asset_name=asset_name, exchange=exchange)
    df = compute_pivot_levels(df)
    df = compute_daily_delta(df)

    base = symbol.split("/")[0].upper()
    crypto = ["BTC", "ETH", "SOL", "ADA", "XRP", "BNB", "DOGE", "DOT"]

    if base in crypto:
        margin = 0.15
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


    df["direction"] = df.apply(get_signal_direction, axis=1)
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

    signals = []

    for _, row in df.iterrows():
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
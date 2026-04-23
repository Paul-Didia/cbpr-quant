import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, HelpCircle, Star, X, Share } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { PageTransition } from "../components/PageTransition";
import { CbprMethode } from "../components/CbprMethode";
import { AssetIcon } from "../components/AssetIcon";
import { useFavorites } from "../contexts/FavoritesContext";
import { useAuth } from "../contexts/AuthContext";
import { apiService } from "../services/api";
import { type AssetType } from "../data/mockAssets";
import { useWebHaptics } from "web-haptics/react";
import logoEtoro from "../assets/logo_etoro.png";
import logoTradeRepublic from "../assets/logo_trade_rep.png";
import logoXInvest from "../assets/logo_x_invest.png";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
} from "recharts";


type AssetDetailData = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  currentPrice: number;
  change: number;
  changePercent: number;
  logo: string;
  exchange: string;
  currency: string;
  status: "opportunity" | "risk" | "neutral";
  signal: string;
  score: number;
  chartData: Array<{
    date: string;
    price: number;
    zone: "opportunity" | "risk" | "neutral";
    sma200: number;
    sma200Upper: number;
    sma200Lower: number;
    pivotLine: number | null;
  }>;
  smaChannel: {
    sma200: number | null;
    upper: number | null;
    lower: number | null;
  };
  legend: Array<{
    label: string;
    color: string;
  }>;
  technicalIndicators: {
    channelDirection: string;
    bollingerBands: string;
    pivot: string;
    sma200: string;
    timeInBuyZone: string;
    rsi: string;
    macd: string;
  };
  description: string;
  news: Array<{
    id: string;
    title: string;
  }>;
  explanation: {
    title: string;
    summary: string;
    reasons: string[];
    scoreLabel: string;
  };
};

type UserPlan = "free" | "pro" | "quant";

const HOME_ASSET_CACHE_PREFIX = "cbpr_home_asset_";

function getHomeAssetCacheKey(symbol: string) {
  return `${HOME_ASSET_CACHE_PREFIX}${encodeURIComponent(symbol)}`;
}

function setCachedHomeAsset(
  symbol: string,
  data: {
    id: string;
    symbol: string;
    name: string;
    logo: string;
    assetType: AssetType;
    currentPrice: number;
    status: "opportunity" | "risk" | "neutral";
  },
) {
  try {
    window.localStorage.setItem(
      getHomeAssetCacheKey(symbol),
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch {}
}

const FREE_STOCK_SYMBOLS = new Set([
  "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "JPM", "JNJ", "V",
  "WMT", "PG", "XOM", "UNH", "KO", "DIS", "NFLX", "INTC", "AMD", "CSCO",
  "ORCL", "IBM", "BA", "NKE", "PFE", "MRK", "CVX", "MCD", "COST", "PEP",
  "ABT", "AVGO", "TMO", "ACN", "QCOM", "TXN", "HON", "LIN", "UPS", "PM",
  "RTX", "LOW", "INTU", "AMGN", "SPGI", "CAT", "GS", "DE", "BLK", "MDT",
  "ISRG", "NOW", "BKNG", "ADBE", "PLD", "SYK", "GILD", "ADI", "VRTX", "ZTS",
  "CB", "CI", "MO", "LMT", "SCHW", "DUK", "MMC", "SO", "USB", "BDX",
  "FIS", "PNC", "T", "APD", "CSX", "NSC", "ICE", "GM", "F", "ETN",
  "EMR", "EOG", "MPC", "PSX", "KMI", "SLB", "COP", "HAL", "DVN", "OXY",
  "AIG", "MET", "PRU", "ALL", "TRV", "AXP", "COF", "DFS", "PYPL", "SQ",
  "CRM", "SNOW", "SHOP", "UBER", "LYFT", "TWLO", "DDOG", "NET", "OKTA", "ZS",
  "CRWD", "PANW", "FTNT", "TEAM", "WDAY", "DOCU", "ROKU", "TTD", "SPOT", "EA",
  "ATVI", "TTWO", "RBLX", "U", "PLTR", "AI", "SMCI", "MRVL", "KLAC", "LRCX",
  "ASML", "NXPI", "ON", "MPWR", "SWKS", "QRVO", "CDNS", "SNPS", "ANSS", "PAYC",
  "PAYX", "ADP", "HPQ", "DELL", "HPE", "SONY", "NTDOY", "BABA", "JD",
  "PDD", "TCEHY", "BIDU", "SE", "MELI", "TSM", "INFY", "SAP", "ORAN", "VOD"
]);

function normalizeAccessSymbol(symbol?: string) {
  return String(symbol || "").trim().toUpperCase();
}

function getRequiredPlanForAsset(asset: { symbol: string; assetType: AssetType }): UserPlan {
  const symbol = normalizeAccessSymbol(asset.symbol);

  if (asset.assetType === "crypto" || asset.assetType === "forex") {
    return "quant";
  }

  if (asset.assetType === "etf") {
    return "pro";
  }

  if (asset.assetType === "stock") {
    return FREE_STOCK_SYMBOLS.has(symbol) ? "free" : "pro";
  }

  return "quant";
}

function isAssetAllowedForPlan(
  asset: { symbol: string; assetType: AssetType },
  plan: UserPlan,
): boolean {
  const requiredPlan = getRequiredPlanForAsset(asset);

  if (plan === "quant") return true;
  if (plan === "pro") return requiredPlan !== "quant";
  return requiredPlan === "free";
}

function getPlanLabel(plan: UserPlan): string {
  if (plan === "quant") return "Quant";
  if (plan === "pro") return "Pro";
  return "Free";
}

function normalizeAssetType(rawType?: string, name?: string, exchange?: string): AssetType {
  const type = (rawType || "").toLowerCase();
  const nameValue = (name || "").toLowerCase();
  const exchangeValue = (exchange || "").toLowerCase();

  const cryptoExchanges = [
    "coinbase",
    "coinbase pro",
    "huobi",
    "binance",
    "kraken",
    "bybit",
    "okx",
  ];

  if (exchangeValue === "forex" || type.includes("forex")) return "forex";
  if (
    cryptoExchanges.some((item) => exchangeValue.includes(item)) ||
    type.includes("crypto") ||
    nameValue.includes("bitcoin") ||
    nameValue.includes("ethereum")
  ) {
    return "crypto";
  }
  if (type.includes("etf") || nameValue.includes("etf") || nameValue.includes("ucits")) {
    return "etf";
  }
  return "stock";
}

function formatCurrency(price: number, currency?: string) {
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeCurrency = (currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: safePrice >= 100 ? 2 : 4,
    }).format(safePrice);
  } catch {
    return `${safePrice.toFixed(2)} ${safeCurrency}`;
  }
}

function formatChange(change: number, changePercent: number, currency?: string) {
  const safeCurrency = (currency || "USD").toUpperCase();
  const formattedChange = Number.isFinite(change)
    ? `${change >= 0 ? "+" : ""}${change.toFixed(2)} ${safeCurrency}`
    : `0.00 ${safeCurrency}`;
  const formattedPercent = Number.isFinite(changePercent)
    ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`
    : "0.00%";

  return `${formattedChange} | ${formattedPercent}`;
}


function getStatusLabel(status: AssetDetailData["status"]) {
  switch (status) {
    case "opportunity":
      return "Zone d'opportunité";
    case "risk":
      return "Zone de risque";
    case "neutral":
      return "Zone neutre";
    default:
      return "Statut inconnu";
  }
}


const TECHNICAL_INDICATOR_HELP: Record<
  string,
  {
    title: string;
    description: string;
    insight: string;
    courbe: string;
  }
> = {
  Tendance: {
    title: "Tendance",
    description:
      "La tendance est représentée par le canal bleu foncé autour du prix. Il montre l’orientation générale du marché sur la durée.",
    insight:
      "Ce canal bleu permet de visualiser si le marché évolue dans une dynamique haussière, baissière ou neutre.",
    courbe:
      "Courbes : bleu foncé (canal autour du prix)",
  },
  "Bande Bollinger": {
    title: "Bande Bollinger",
    description:
      "Les bandes de Bollinger mesurent l’écart du prix autour de sa moyenne récente. Elles servent à repérer les phases de tension, d’excès ou d’accalmie.",
    insight:
      "Elles permettent de lire la volatilité de l’actif et de voir si le prix est dans une zone d’extension ou de retour à l’équilibre.",
    courbe:
      "",
  },
  "Pivot": {
    title: "Pivot",
    description:
      "Le pivot correspond à une ligne horizontale grise sur le graphique. C’est un niveau de prix clé où le marché a déjà réagi dans le passé.",
    insight:
      "Cette ligne grise permet de visualiser immédiatement les zones où le prix pourrait réagir à nouveau.",
    courbe:
      "Ligne horizontale : gris",
  },
  RSI: {
    title: "RSI",
    description:
      "Le RSI mesure le rythme et l’intensité du mouvement récent du prix. Il sert à repérer les excès haussiers ou baissiers.",
    insight:
      "Il permet de voir si le mouvement actuel semble trop fort, trop faible, ou déjà excessif.",
    courbe:
      "",
  },
  "MACD / Signal": {
    title: "MACD / Signal",
    description:
      "Le MACD compare plusieurs moyennes pour lire l’élan du marché. La ligne Signal sert de repère pour détecter un changement de dynamique.",
    insight:
      "Il permet de comprendre si la dynamique gagne en force, ralentit, ou commence à se retourner.",
    courbe:
      "",
  },
  "Prix moyen": {
    title: "Prix moyen",
    description:
      "Le prix moyen sur 200 périodes (SMA200) est représenté par la courbe bleu clair sur le graphique. Elle sert de repère central pour visualiser la tendance de fond de l’actif.",
    insight:
      "Lorsque le prix évolue au-dessus ou en dessous de cette courbe bleu clair, cela permet d’identifier rapidement le contexte de tendance globale.",
    courbe:
      "Courbe : bleu clair (Prix moyen sur 200 périodes)",
  },
  "Nombre de jours consécutifs en zone d'achat": {
    title: "Nombre de jours consécutifs en zone d'achat",
    description:
      "Cet indicateur mesure depuis combien de jours l’actif reste dans la zone d’achat CBPR sans réelle reprise. Une durée trop longue affaiblit la qualité de l’opportunité.",
    insight:
      "Il permet de repérer quand une opportunité théorique commence à ressembler davantage à un risque persistant.",
    courbe:
      "",
  },
};

function getNearestPivotLevel(
  currentPrice: number,
  pivotSupport: number | null,
  pivotResistance: number | null,
  currency: string,
) {
  const levels = [
    Number.isFinite(pivotSupport) ? pivotSupport : null,
    Number.isFinite(pivotResistance) ? pivotResistance : null,
  ].filter((level): level is number => level !== null && Number.isFinite(level));
  if (!levels.length || !Number.isFinite(currentPrice)) {
    return "Indisponible";
  }
  const nearest = levels.reduce((best, level) => {
    return Math.abs(level - currentPrice) < Math.abs(best - currentPrice) ? level : best;
  }, levels[0]);
  const side = nearest <= currentPrice ? "Support" : "Résistance";
  return `${side} : ${formatCurrency(nearest, currency)}`;
}

function mapSignalToStatus(signal?: string): AssetDetailData["status"] {
  const value = (signal || "").toUpperCase();
  if (value.includes("ACHAT")) return "opportunity";
  if (value.includes("VENTE")) return "risk";
  return "neutral";
}

function getSmaChannelMargin(assetType: AssetType): number {
  switch (assetType) {
    case "crypto":
      return 0.19;
    case "forex":
      return 0.02;
    case "etf":
      return 0.04;
    case "stock":
    default:
      return 0.09;
  }
}

function buildDescription(name: string, symbol: string, assetType: AssetType, exchange: string) {
  const assetTypeLabel =
    assetType === "crypto"
      ? "actif crypto"
      : assetType === "forex"
        ? "paire de devises"
        : assetType === "etf"
          ? "ETF"
          : "action";

  return `${name} (${symbol}) est actuellement suivi dans CBPR Quant comme ${assetTypeLabel}. Les données de marché sont récupérées en temps réel H4 et l'analyse affichée combine le prix actuel, la dynamique récente et les principaux indicateurs techniques du moteur CBPR. Marché de référence : ${exchange || "non renseigné"}.`;
}


function buildNewsPlaceholders(symbol: string, signal: string, score: number) {
  const displayedScore = Math.max(10, Number(score || 0));
  const scoreSuffix = Number(score || 0) <= 10 ? " min" : "";

  return [
    {
      id: `${symbol}-signal`,
      title: `Score CBPR : ${displayedScore}/100${scoreSuffix}.`,
    },
  ];
}

function buildElasticScoreSentence(
  score: number,
  status: AssetDetailData["status"],
) {
  const displayedScore = Math.max(10, Number(score || 0));
  const scoreSuffix = Number(score || 0) <= 10 ? " min" : "";
  const prefix = `Score CBPR : ${displayedScore}/100${scoreSuffix} — `;

  if (status === "neutral") {
    if (displayedScore <= 30) {
      return `${prefix}L'élastique est au repos, proche de son point d'équilibre.`;
    }
    if (displayedScore <= 80) {
      return `${prefix}L'élastique commence à s'écarter légèrement de son centre, sans tension significative.`;
    }
    return `${prefix}L'élastique s'étire vers les limites de sa zone d'équilibre.`;
  }

  if (status === "opportunity") {
    if (displayedScore <= 40) {
      return `${prefix}L'élastique est légèrement étiré — le retour n'est pas encore clairement engagé.`;
    }
    if (displayedScore <= 65) {
      return `${prefix}L'élastique est bien étiré — les conditions d'un retour commencent à se réunir.`;
    }
    if (displayedScore <= 85) {
      return `${prefix}L'élastique est fortement étiré — la zone d'opportunité est significative.`;
    }
    return `${prefix}L'élastique est à son maximum d'étirement — c'est le cœur de la zone d'opportunité.`;
  }

  if (displayedScore <= 40) {
    return `${prefix}L'élastique commence à dépasser son équilibre — la zone reste fragile.`;
  }
  if (displayedScore <= 65) {
    return `${prefix}L'élastique est bien au-dessus de son centre — la tension haussière est importante.`;
  }
  if (displayedScore <= 85) {
    return `${prefix}L'élastique est fortement étiré à la hausse — le retour vers la moyenne devient probable.`;
  }
  return `${prefix}L'élastique est à son maximum d'étirement haussier — la zone de risque est maximale.`;
}

function buildBrokerLinks(symbol: string) {
  const encodedSymbol = encodeURIComponent(symbol);

  return [
    {
      name: "Acheter sur Trade Republic",
      webUrl: `https://traderepublic.com/`,
      appUrl: null,
      color: "from-white to-white",
      logo: logoTradeRepublic,
    },
    {
      name: "Acheter sur eToro",
      webUrl: `https://www.etoro.com/discover/markets/stocks/${encodedSymbol}`,
      appUrl: `https://www.etoro.com/discover/markets/stocks/${encodedSymbol}`,
      color: "from-white to-white",
      logo: logoEtoro,
    },
    {
      name: "Acheter sur Xinvest",
      webUrl: `https://www.xinvest.tech/`,
      appUrl: null,
      color: "from-white to-white",
      logo: logoXInvest,
    },
  ];
}

function openBrokerLink(webUrl: string, appUrl?: string | null) {
  if (typeof window === "undefined") return;

  if (appUrl) {
    const fallback = window.setTimeout(() => {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 700);

    const clearFallback = () => {
      window.clearTimeout(fallback);
      window.removeEventListener("pagehide", clearFallback);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearFallback();
      }
    };

    window.addEventListener("pagehide", clearFallback);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.location.href = appUrl;
    return;
  }

  window.open(webUrl, "_blank", "noopener,noreferrer");
}

function mapToHomeAssetCache(asset: AssetDetailData) {
  return {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    logo: asset.logo || "",
    assetType: asset.assetType,
    currentPrice: asset.currentPrice,
    status: asset.status,
  };
}

function mapToAssetDetail(analysisResponse: any, symbol: string): AssetDetailData {
  const quote = analysisResponse?.quote || {};
  const analysis = analysisResponse?.analysis || {};
  const indicators = analysis?.indicators || {};
  const explanationData = analysis?.explanation || {};
  const status = mapSignalToStatus(analysis?.signal);
  const backendAssetType = String(analysisResponse?.assetType || "");
  const assetType = backendAssetType
    ? normalizeAssetType(backendAssetType, quote?.name || symbol, quote?.exchange)
    : normalizeAssetType(
        quote?.instrument_type,
        quote?.name || symbol,
        quote?.exchange,
      );

  const values = Array.isArray(analysisResponse?.values) ? analysisResponse.values : [];

  // Define these before any use of currentPrice in pivot calculations
  const currentPrice = Number(quote?.price || indicators?.currentPrice || 0);
  const change = Number(quote?.change || 0);
  const changePercent = Number(quote?.changePercent || 0);
  const signal = String(analysis?.signal || "NEUTRE");
  const score = Number(analysis?.score || 0);
  const exchange = String(quote?.exchange || "");
  const currency = String(quote?.currency || "USD");
  const name = String(quote?.name || symbol);

  // read indicators for pivots
  const pivotSupport = Number(indicators?.pivotSupport);
  const pivotResistance = Number(indicators?.pivotResistance);
  // Find the pivot line value for chart: nearest valid pivot (support or resistance) to currentPrice, or null if none
  let pivotLineValue: number | null = null;
  if (Number.isFinite(pivotSupport) && Number.isFinite(pivotResistance)) {
    // Both valid: pick nearest
    pivotLineValue =
      Math.abs(pivotSupport - currentPrice) <= Math.abs(pivotResistance - currentPrice)
        ? pivotSupport
        : pivotResistance;
  } else if (Number.isFinite(pivotSupport)) {
    pivotLineValue = pivotSupport;
  } else if (Number.isFinite(pivotResistance)) {
    pivotLineValue = pivotResistance;
  } else {
    pivotLineValue = null;
  }

  const chartData = values
    .slice()
    .map((point: any) => ({
      date: String(point?.datetime || ""),
      price: Number(point?.close || 0),
      zone: status,
      sma200: Number(point?.SMA200 ?? NaN),
      sma200Upper: Number(point?.SMA200_upper ?? NaN),
      sma200Lower: Number(point?.SMA200_lower ?? NaN),
      pivotLine: Number.isFinite(pivotLineValue) ? (pivotLineValue as number) : null,
    }))
    .filter((point: { price: number }) => Number.isFinite(point.price));

  const sma200 = Number(indicators?.sma200);
  const rsi14 = Number(indicators?.rsi14);
  const macd = Number(indicators?.macd);
  const macdSignal = Number(indicators?.macdSignal);
  const channelDirection = String(indicators?.channelDirection || indicators?.direction || "");
  const bollingerZone = String(indicators?.bollingerZone || "Indisponible");
  const smaMargin = getSmaChannelMargin(assetType);
  const smaUpper = Number.isFinite(sma200) ? sma200 * (1 + smaMargin) : null;
  const smaLower = Number.isFinite(sma200) ? sma200 * (1 - smaMargin) : null;

  const buyZoneDays = Number(indicators?.buyZoneDays || 0);
  // Use new pivot function
  const nearestPivotLevel = getNearestPivotLevel(
    currentPrice,
    Number.isFinite(pivotSupport) ? pivotSupport : null,
    Number.isFinite(pivotResistance) ? pivotResistance : null,
    currency,
  );

  return {
    id: symbol,
    symbol,
    name,
    assetType,
    currentPrice,
    change,
    changePercent,
    logo: String(analysisResponse?.logo || ""),
    exchange,
    currency,
    status,
    signal,
    score,
    chartData,

    // 🆕 Tendance SMA200 (contexte CBPR)
    smaChannel: {
      sma200: Number.isFinite(sma200) ? sma200 : null,
      upper: Number.isFinite(sma200) ? sma200 * (1 + getSmaChannelMargin(assetType)) : null,
      lower: Number.isFinite(sma200) ? sma200 * (1 - getSmaChannelMargin(assetType)) : null,
    },
    legend: [],
    technicalIndicators: {
      channelDirection:
        channelDirection === "haussier"
          ? "Haussier"
          : channelDirection === "baissier"
            ? "Baissier"
            : channelDirection === "achat"
              ? "Baissier"
              : channelDirection === "vente"
                ? "Haussier"
                : "Neutre",

      bollingerBands: bollingerZone,

      pivot: nearestPivotLevel,

      sma200: Number.isFinite(sma200)
        ? formatCurrency(sma200, currency)
        : "Indisponible",

      timeInBuyZone:
        buyZoneDays > 0
          ? `${buyZoneDays} jour${buyZoneDays > 1 ? "s" : ""}`
          : "0 jour",

      rsi: Number.isFinite(rsi14)
        ? `${rsi14.toFixed(1)}`
        : "Indisponible",

      macd:
        Number.isFinite(macd) && Number.isFinite(macdSignal)
          ? `${macd.toFixed(4)} / ${macdSignal.toFixed(4)}`
          : signal,
    },

    description: buildDescription(name, symbol, assetType, exchange),
    news: buildNewsPlaceholders(symbol, signal, score),
    explanation: {
      title: String(explanationData?.title || "Analyse CBPR"),
      summary: String(
        explanationData?.summary ||
          "Le contexte actuel reste équilibré et ne montre pas de déséquilibre technique suffisamment clair.",
      ),
      reasons: Array.isArray(explanationData?.reasons)
        ? explanationData.reasons.map((item: unknown) => String(item))
        : [],
      scoreLabel: buildElasticScoreSentence(score, status),
    },
  };
}

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const symbol = decodeURIComponent(id || "");
  const { isFavorite, addFavorite, removeFavorite, favorites } = useFavorites() as {
    isFavorite: (assetId: string) => boolean;
    addFavorite: (assetId: string) => Promise<void>;
    removeFavorite: (assetId: string) => Promise<void>;
    favorites?: string[];
  };
  const { user } = useAuth();
  const { trigger } = useWebHaptics();
  const triggerBackTap = () => trigger("light");
  const triggerFavoriteTap = () => trigger("success");
  const [optimisticFavorite, setOptimisticFavorite] = useState<boolean | null>(null);
  const [favoriteBurst, setFavoriteBurst] = useState(0);
  const lastFavoriteActionRef = useRef(0);

  const [asset, setAsset] = useState<AssetDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [openIndicatorHelp, setOpenIndicatorHelp] = useState<string | null>(null);
  const [openCbprMethod, setOpenCbprMethod] = useState(false);
  const currentPlan: UserPlan = user?.subscription || "free";

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [symbol]);


  useEffect(() => {
    setOptimisticFavorite(null);
    lastFavoriteActionRef.current = 0;
  }, [asset?.id]);

  const [favoriteLimitToastVisible, setFavoriteLimitToastVisible] = useState(false);
  const favoriteLimitToastTimeoutRef = useRef<number | null>(null);
  const showFavoriteLimitToast = () => {
    setFavoriteLimitToastVisible(true);

    if (favoriteLimitToastTimeoutRef.current) {
      window.clearTimeout(favoriteLimitToastTimeoutRef.current);
    }

    favoriteLimitToastTimeoutRef.current = window.setTimeout(() => {
      setFavoriteLimitToastVisible(false);
      favoriteLimitToastTimeoutRef.current = null;
    }, 2000);
  };

  const favoriteCount = Array.isArray(favorites) ? favorites.length : 0;


  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      if (!symbol) {
        setAsset(null);
        setErrorMessage("Actif non trouvé");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const analysisResponse = await apiService.getAnalysis(symbol);

        const mapped = mapToAssetDetail(analysisResponse, symbol);
        const backendRequiredPlan = String(analysisResponse?.subscription || "")
          .trim()
          .toLowerCase();

        const requiredPlan: UserPlan =
          backendRequiredPlan === "free" ||
          backendRequiredPlan === "pro" ||
          backendRequiredPlan === "quant"
            ? (backendRequiredPlan as UserPlan)
            : getRequiredPlanForAsset({
                symbol: mapped.symbol,
                assetType: mapped.assetType,
              });

        const isAllowed =
          currentPlan === "quant"
            ? true
            : currentPlan === "pro"
              ? requiredPlan !== "quant"
              : requiredPlan === "free";

        if (!isAllowed) {
          if (!isCancelled) {
            setAsset(null);
            setErrorMessage(`Cet actif est réservé au plan ${getPlanLabel(requiredPlan)}.`);
          }
          return;
        }

        if (!isCancelled) {
          setAsset(mapped);
          setCachedHomeAsset(mapped.symbol, mapToHomeAssetCache(mapped));
        }
      } catch (error) {
        console.error("Error loading asset detail:", error);
        if (!isCancelled) {
          setAsset(null);
          setErrorMessage("Impossible de charger l'analyse de cet actif pour le moment.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      isCancelled = true;
    };
  }, [symbol, currentPlan]);

  useEffect(() => {
    return () => {
      if (favoriteLimitToastTimeoutRef.current) {
        window.clearTimeout(favoriteLimitToastTimeoutRef.current);
      }
    };
  }, []);

  const toggleWatchlist = async () => {
    if (!asset) return;

    triggerFavoriteTap();

    const isAllowed = isAssetAllowedForPlan(
      { symbol: asset.symbol, assetType: asset.assetType },
      currentPlan,
    );

    if (!isAllowed) {
      return;
    }

    const currentValue =
      optimisticFavorite !== null ? optimisticFavorite : isFavorite(asset.id);

    const nextValue = !currentValue;

    if (nextValue && !currentValue && favoriteCount >= 15) {
      showFavoriteLimitToast();
      return;
    }

    const actionId = lastFavoriteActionRef.current + 1;
    lastFavoriteActionRef.current = actionId;

    setOptimisticFavorite(nextValue);
    setFavoriteBurst((prev) => prev + 1);

    try {
      if (nextValue) {
        await addFavorite(asset.id);
      } else {
        await removeFavorite(asset.id);
      }

      if (lastFavoriteActionRef.current !== actionId) {
        return;
      }

      setOptimisticFavorite(null);
    } catch (error) {
      console.error("Error toggling favorite:", error);

      const errorMessage =
        error instanceof Error ? error.message : String(error || "");

      if (nextValue && errorMessage.toLowerCase().includes("maximum 15 favorites allowed")) {
        showFavoriteLimitToast();
      }

      if (lastFavoriteActionRef.current !== actionId) {
        return;
      }

      setOptimisticFavorite(currentValue);
      window.setTimeout(() => {
        if (lastFavoriteActionRef.current === actionId) {
          setOptimisticFavorite(null);
        }
      }, 600);
    }
  };

  const isWatched = asset
    ? optimisticFavorite !== null
      ? optimisticFavorite
      : isFavorite(asset.id)
    : false;

  const enrichedChartData = useMemo(() => {
    if (!asset) return [];

    return asset.chartData.map((point, index) => ({
      ...point,
      id: `${point.date}-${index}`,
      opportunityPrice: point.zone === "opportunity" ? point.price : null,
      riskPrice: point.zone === "risk" ? point.price : null,
      neutralPrice: point.zone === "neutral" ? point.price : null,
      sma200: Number.isFinite(point.sma200) ? point.sma200 : null,
      sma200Upper: Number.isFinite(point.sma200Upper) ? point.sma200Upper : null,
      sma200Lower: Number.isFinite(point.sma200Lower) ? point.sma200Lower : null,
      pivotLine: Number.isFinite(point.pivotLine as number) ? point.pivotLine : null,
    }));
  }, [asset]);

  const opportunityGradientId = `opportunityGradient-${asset?.id || "unknown"}`;
  const riskGradientId = `riskGradient-${asset?.id || "unknown"}`;
  const brokerLinks = asset ? buildBrokerLinks(asset.symbol) : [];
  const explanation = asset?.explanation ?? {
    title: "Analyse CBPR",
    summary:
      "Le contexte actuel reste équilibré et ne montre pas de déséquilibre technique suffisamment clair.",
    reasons: [] as string[],
    scoreLabel: buildElasticScoreSentence(
      Number(asset?.score || 0),
      asset?.status || "neutral",
    ),
  };
  const technicalIndicators = [
    {
      label: "Tendance",
      value: asset?.technicalIndicators.channelDirection || "Indisponible",
    },
    {
      label: "Bande Bollinger",
      value: asset?.technicalIndicators.bollingerBands || "Indisponible",
    },
    {
      label: "Pivot",
      value: asset?.technicalIndicators.pivot || "Indisponible",
      colSpan: true,
    },
    {
      label: "Prix moyen",
      value: asset?.technicalIndicators.sma200 || "Indisponible",
    },
    {
      label: "Nombre de jours consécutifs en zone d'achat",
      value: asset?.technicalIndicators.timeInBuyZone || "Indisponible",
    },
    {
      label: "RSI",
      value: asset?.technicalIndicators.rsi || "Indisponible",
    },
    {
      label: "MACD / Signal",
      value: asset?.technicalIndicators.macd || "Indisponible",
    },
  ];

  if (isLoading) {
    return (
      <PageTransition>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div className="h-6 w-28 bg-gray-100 rounded-xl" />
              <div className="w-10 h-10 bg-gray-100 rounded-full" />
            </div>

            <div className="flex items-start gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-3xl" />
              <div className="space-y-3 flex-1">
                <div className="h-8 w-32 bg-gray-100 rounded-xl" />
                <div className="h-4 w-56 bg-gray-100 rounded-xl" />
                <div className="h-10 w-40 bg-gray-100 rounded-xl" />
              </div>
            </div>

            <div className="h-[300px] bg-white rounded-3xl border border-gray-100" />
            <div className="h-24 bg-white rounded-3xl border border-gray-100" />
            <div className="h-56 bg-white rounded-3xl border border-gray-100" />
            <div className="h-36 bg-white rounded-3xl border border-gray-100" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!asset) {
    return (
      <PageTransition>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h2 className="text-xl font-medium text-gray-900">
              {errorMessage || "Actif non trouvé"}
            </h2>
            {errorMessage?.includes("réservé au plan") && (
              <p className="text-sm text-gray-500 mt-3">
                Passez à l’abonnement requis depuis votre profil pour débloquer cet actif.
              </p>
            )}
            <Link
              to="/library"
              className="text-blue-600 hover:underline mt-4 inline-block"
            >
              Retour à la bibliothèque
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <motion.div
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.button
            onClick={() => {
              triggerBackTap();
              navigate(-1);
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17,
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Retour</span>
          </motion.button>

          <motion.button
            onClick={toggleWatchlist}
            className="p-2 hover:bg-gray-100 rounded-full transition-all relative overflow-hidden"
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.9 }}
          >
            {isWatched && (
              <motion.div
                key={`favorite-burst-${favoriteBurst}`}
                className="absolute inset-0 rounded-full"
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                style={{
                  background:
                    "conic-gradient(from 0deg, #ff0080, #7928ca, #0070f3, #00c853, #ffeb3b, #ff6d00, #ff0080)",
                }}
              />
            )}

            <motion.div
              key={`star-${isWatched}-${favoriteBurst}`}
              initial={isWatched ? { scale: 0.7, rotate: -20 } : { scale: 1 }}
              animate={
                isWatched
                  ? { scale: [0.7, 1.35, 1], rotate: [0, -12, 10, 0] }
                  : { scale: [1, 0.85, 1], rotate: [0, -8, 0] }
              }
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative z-10"
            >
              <Star
                className={`w-6 h-6 ${isWatched ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
                  }`}
              />
            </motion.div>
          </motion.button>
        </motion.div>

        <motion.div
          className="mb-8 flex items-start gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <AssetIcon
              logo={asset.logo || ""}
              name={asset.name}
              assetType={asset.assetType}
              size="lg"
            />
          </motion.div>
          <div>
            <div className="flex items-center justify-between w-full">
              <h1
                className="text-[32px] font-semibold text-gray-900 tracking-tight"
                style={{
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
                }}
              >
                {asset.symbol}
              </h1>

              <button
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.share) {
                    navigator.share({
                      title: `${asset.symbol} - CBPR Quant`,
                      text: `Analyse CBPR de ${asset.symbol}`,
                      url,
                    });
                  } else {
                    navigator.clipboard.writeText(url);
                    alert("Lien copié !");
                  }
                }}
                className="p-2 rounded-full hover:bg-gray-100 transition-all"
              >
                <Share className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-gray-600">{asset.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {asset.exchange || "Marché non renseigné"}
            </p>
            <motion.div
              className="text-4xl font-semibold text-gray-900 mt-3 tracking-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              {formatCurrency(asset.currentPrice, asset.currency)}
            </motion.div>
            <div
              className={`mt-2 text-sm font-medium ${asset.change >= 0 ? "text-green-600" : "text-red-600"
                }`}
            >
              {formatChange(asset.change, asset.changePercent, asset.currency)}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="pb-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={enrichedChartData}>
              <defs>
                <linearGradient id={opportunityGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={riskGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#e2e2e2a1" />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getDate()}/${date.getMonth() + 1}`;
                }}
              />

              <YAxis
                hide
                domain={[
                  (dataMin: number) => Math.min(dataMin, asset.smaChannel.lower ?? dataMin),
                  (dataMax: number) => Math.max(dataMax, asset.smaChannel.upper ?? dataMax),
                ]}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value: number) => [formatCurrency(value, asset.currency), "Prix"]}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString("fr-FR");
                }}
              />

              <Area
                key="opportunity-area"
                type="monotone"
                dataKey="opportunityPrice"
                stroke="#10b981"
                strokeWidth={3}
                fill={`url(#${opportunityGradientId})`}
                connectNulls={false}
              />

              <Area
                key="risk-area"
                type="monotone"
                dataKey="riskPrice"
                stroke="#ef4444"
                strokeWidth={3}
                fill={`url(#${riskGradientId})`}
                connectNulls={false}
              />

              <Area
                key="neutral-area"
                type="monotone"
                dataKey="neutralPrice"
                stroke="#6b7280"
                strokeWidth={3}
                fill="none"
                connectNulls={false}
              />

              <Line
                type="monotone"
                dataKey="sma200Upper"
                stroke="#0055ff"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />

              <Line
                type="monotone"
                dataKey="sma200"
                stroke="#0055ff61"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />

              <Line
                type="monotone"
                dataKey="sma200Lower"
                stroke="#0055ff"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pivotLine"
                stroke="#8c8c8c27"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

        </motion.div>

        {/* Signal */}
        <motion.div
          className="bg-white rounded-3xl px-5 py-4 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          <div className="text-xs text-gray-400 mb-2 tracking-wide uppercase">
            Statut de l'actif
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${asset.status === "opportunity"
                  ? "bg-green-500"
                  : asset.status === "risk"
                    ? "bg-red-500"
                    : "bg-yellow-400"
                  }`}
              />
              <div className="text-sm text-gray-500">{getStatusLabel(asset.status)}</div>
            </div>
          </div>
        </motion.div>

        {/* indicateurs techniques */}
        <motion.div
          className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h2 className="font-semibold text-gray-900 mb-5 text-lg tracking-tight">
            Indicateurs techniques
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {technicalIndicators.map((indicator, index) => {
              const help = TECHNICAL_INDICATOR_HELP[indicator.label];

              return (
                <motion.button
                  key={indicator.label}
                  type="button"
                  onClick={() => help && setOpenIndicatorHelp(indicator.label)}
                  className={`relative bg-gray-50 rounded-2xl p-4 text-left ${indicator.colSpan ? "col-span-2 sm:col-span-1" : ""}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.4 + index * 0.05,
                    duration: 0.3,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-xs text-gray-500">{indicator.label}</div>
                    {help && (
                      <span
                        className="text-gray-400 flex-shrink-0"
                        aria-label={`Comprendre ${indicator.label}`}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  <div className="font-semibold text-gray-900 tracking-tight">{indicator.value}</div>
                </motion.button>
              );
            })}
          </div>

          {openIndicatorHelp && TECHNICAL_INDICATOR_HELP[openIndicatorHelp] && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
              onClick={() => setOpenIndicatorHelp(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-lg font-semibold text-gray-900">
                    {TECHNICAL_INDICATOR_HELP[openIndicatorHelp].title}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenIndicatorHelp(null)}
                    className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                    aria-label="Fermer l'explication"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-3">
                  {TECHNICAL_INDICATOR_HELP[openIndicatorHelp].description}
                </p>
                <p className="text-sm text-gray-900 leading-relaxed font-medium mb-4">
                  {TECHNICAL_INDICATOR_HELP[openIndicatorHelp].insight}
                </p>
                {TECHNICAL_INDICATOR_HELP[openIndicatorHelp].courbe ? (
                  <p className="text-sm text-gray-900 leading-relaxed">
                    {TECHNICAL_INDICATOR_HELP[openIndicatorHelp].courbe}
                  </p>
                ) : null}
              </motion.div>
            </motion.div>
          )}
        </motion.div>

        {/* Méthode cbpr */}
        <motion.div
          className="my-8 flex justify-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.62, duration: 0.35 }}
        >
          <button
            type="button"
            onClick={() => setOpenCbprMethod(true)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-4"
          >
            Comprendre la méthode CBPR
          </button>
        </motion.div>


        {/* achet cet actif */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.23, duration: 0.5 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {brokerLinks.map((platform, index) => (
              <motion.button
                key={platform.name}
                type="button"
                onClick={() => openBrokerLink(platform.webUrl, platform.appUrl)}
                className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${platform.color} px-4 py-3 shadow-sm hover:shadow-md transition-all group min-h-[84px] flex items-center border border-gray-100`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.25 + index * 0.08,
                  duration: 0.4,
                }}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                <div className="relative flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-2xl overflow-hidden flex-shrink-0 border border-gray-100 bg-white">
                      <img
                        src={platform.logo}
                        alt={platform.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-gray-700 text-[15px] leading-tight tracking-tight truncate">
                        {platform.name}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-gray-400 group-hover:scale-105 transition-all flex-shrink-0" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* à propos de l'actif */}
        <motion.div
          className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <h2 className="font-semibold text-gray-900 mb-3 text-lg tracking-tight">
            À propos de l'actif
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">{asset.description}</p>
        </motion.div>

        {/* synthèse récente */}
        <motion.div
          className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <h2 className="font-semibold text-gray-900 mb-4 text-lg tracking-tight">
            Synthèse récente
          </h2>
          <div className="flex flex-col gap-3">
            <motion.div
              className="bg-gray-50 px-4 py-4 rounded-2xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              <div className="text-sm font-semibold text-gray-900 mb-1">
                {explanation.title}
              </div>
              <div className="text-sm text-gray-600 leading-relaxed">
                {explanation.summary}
              </div>
            </motion.div>

            {explanation.reasons.map((reason, index) => (
              <motion.div
                key={`${reason}-${index}`}
                className="bg-gray-50 px-4 py-3 rounded-2xl text-sm text-gray-700"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.68 + index * 0.08,
                  duration: 0.3,
                }}
              >
                {reason}
              </motion.div>
            ))}

            <motion.div
              className="bg-gray-50 px-4 py-4 rounded-2xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: 0.92,
                duration: 0.3,
              }}
            >
              <div className="text-sm text-gray-700 leading-relaxed">
                {explanation.scoreLabel}
              </div>
            </motion.div>

            {asset.news
              .filter((news) => !news.title.startsWith("Score CBPR :"))
              .map((news, index) => (
                <motion.div
                  key={news.id}
                  className="bg-gray-50 px-4 py-3 rounded-2xl text-sm text-gray-700"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 1 + index * 0.08,
                    duration: 0.3,
                  }}
                >
                  {news.title}
                </motion.div>
              ))}
          </div>
        </motion.div>

        <CbprMethode isOpen={openCbprMethod} onClose={() => setOpenCbprMethod(false)} />

        {favoriteLimitToastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 px-4 w-[calc(100%-2rem)] max-w-sm"
          >
            <div className="rounded-2xl bg-gray-900/95 text-white shadow-2xl px-4 py-3 text-sm font-medium backdrop-blur-md border border-white/10 text-center">
              Maximum 15 favoris autorisés.
            </div>
          </motion.div>
        )}

        <motion.div
          className="mt-8 pb-6 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
        >
          <p className="text-xs text-gray-400">© CBPR Capital – All rights reserved</p>
          <p className="text-xs text-gray-400 mt-1">CBPR™ methodology</p>
        </motion.div>
      </div>
    </PageTransition>
  );
}
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { PageTransition } from "../components/PageTransition";
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
  }>;
  smaChannel: {
    sma200: number | null;
    upper: number | null;
    lower: number | null;
  };
  technicalIndicators: {
    channelDirection: string;
    bollingerBands: string;
    nearestLevel: string;
    rsi: string;
    macd: string;
  };
  description: string;
  news: Array<{
    id: string;
    title: string;
  }>;
};

type UserPlan = "free" | "pro" | "quant";

const FREE_STOCK_SYMBOLS = new Set([
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
  return [
    {
      id: `${symbol}-signal`,
      title: `Score CBPR : ${score}.`,
    },
    {
      id: `${symbol}-analysis`,
      title: `Analyse mise à jour automatiquement au chargement de la fiche actif.`,
    },
    {
      id: `${symbol}-watchlist`,
      title: `Ajoutez ${symbol} aux favoris pour le suivre depuis votre watchlist CBPR.`,
    },
  ];
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

function mapToAssetDetail(assetResponse: any, analysisResponse: any, symbol: string): AssetDetailData {
  const quote = assetResponse?.quote || {};
  const analysis = analysisResponse?.analysis || {};
  const indicators = analysis?.indicators || {};
  const status = mapSignalToStatus(analysis?.signal);
  const assetType = normalizeAssetType(
    quote?.instrument_type,
    quote?.name || symbol,
    quote?.exchange,
  );

  const values = Array.isArray(analysisResponse?.values) ? analysisResponse.values : [];
  const chartData = values
    .slice()
    .map((point: any) => ({
      date: String(point?.datetime || ""),
      price: Number(point?.close || 0),
      zone: status,
      sma200: Number(point?.SMA200 ?? NaN),
      sma200Upper: Number(point?.SMA200_upper ?? NaN),
      sma200Lower: Number(point?.SMA200_lower ?? NaN),
    }))
    .filter((point: { price: number }) => Number.isFinite(point.price));

  const currentPrice = Number(quote?.price || indicators?.currentPrice || 0);
  const change = Number(quote?.change || 0);
  const changePercent = Number(quote?.changePercent || 0);
  const signal = String(analysis?.signal || "NEUTRE");
  const score = Number(analysis?.score || 0);
  const exchange = String(quote?.exchange || "");
  const currency = String(quote?.currency || "USD");
  const name = String(quote?.name || symbol);

  const sma200 = Number(indicators?.sma200);
  const rsi14 = Number(indicators?.rsi14);
  const macd = Number(indicators?.macd);
  const macdSignal = Number(indicators?.macdSignal);
  const direction = String(indicators?.direction || "");
  const bollingerZone = String(indicators?.bollingerZone || "Indisponible");
  const smaMargin = getSmaChannelMargin(assetType);
  const smaUpper = Number.isFinite(sma200) ? sma200 * (1 + smaMargin) : null;
  const smaLower = Number.isFinite(sma200) ? sma200 * (1 - smaMargin) : null;

  return {
    id: symbol,
    symbol,
    name,
    assetType,
    currentPrice,
    change,
    changePercent,
    logo: String(assetResponse?.logo || ""),
    exchange,
    currency,
    status,
    signal,
    score,
    chartData,

    // 🆕 Canal SMA200 (contexte CBPR)
    smaChannel: {
      sma200: Number.isFinite(sma200) ? sma200 : null,
      upper: Number.isFinite(sma200) ? sma200 * (1 + getSmaChannelMargin(assetType)) : null,
      lower: Number.isFinite(sma200) ? sma200 * (1 - getSmaChannelMargin(assetType)) : null,
    },

    technicalIndicators: {
      channelDirection:
        direction === "achat"
          ? "Haussier"
          : direction === "vente"
            ? "Baissier"
            : "Neutre",

      bollingerBands: bollingerZone,

      nearestLevel:
        Number.isFinite(sma200)
          ? `SMA200 : ${formatCurrency(sma200, currency)}`
          : "Indisponible",

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
  };
}

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const symbol = decodeURIComponent(id || "");
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
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
        const [assetResponse, analysisResponse] = await Promise.all([
          apiService.getAssetDetail(symbol),
          apiService.getAnalysis(symbol),
        ]);

        const mapped = mapToAssetDetail(assetResponse, analysisResponse, symbol);
        const requiredPlan = getRequiredPlanForAsset({
          symbol: mapped.symbol,
          assetType: mapped.assetType,
        });
        const isAllowed = isAssetAllowedForPlan(
          {
            symbol: mapped.symbol,
            assetType: mapped.assetType,
          },
          currentPlan,
        );

        if (!isAllowed) {
          if (!isCancelled) {
            setAsset(null);
            setErrorMessage(`Cet actif est réservé au plan ${getPlanLabel(requiredPlan)}.`);
          }
          return;
        }

        if (!isCancelled) {
          setAsset(mapped);
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
    }));
  }, [asset]);

  const opportunityGradientId = `opportunityGradient-${asset?.id || "unknown"}`;
  const riskGradientId = `riskGradient-${asset?.id || "unknown"}`;
  const brokerLinks = asset ? buildBrokerLinks(asset.symbol) : [];

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
            <h1
              className="text-[32px] font-semibold text-gray-900 tracking-tight"
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
              }}
            >
              {asset.symbol}
            </h1>
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
          className="pb-5 mb-6"
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

              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getDate()}/${date.getMonth() + 1}`;
                }}
              />

              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
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
            <div className="text-sm font-semibold text-gray-900">
              Score {asset.score}/100
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
            {[
              {
                label: "Direction du canal",
                value: asset.technicalIndicators.channelDirection,
              },
              {
                label: "Bande Bollinger",
                value: asset.technicalIndicators.bollingerBands,
              },
              {
                label: "Support/Résistance",
                value: asset.technicalIndicators.nearestLevel,
                colSpan: true,
              },
              {
                label: "RSI",
                value: asset.technicalIndicators.rsi,
              },
              {
                label: "MACD / Signal",
                value: asset.technicalIndicators.macd,
              },
            ].map((indicator, index) => (
              <motion.div
                key={indicator.label}
                className={`bg-gray-50 rounded-2xl p-4 ${indicator.colSpan ? "col-span-2 sm:col-span-1" : ""}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.4 + index * 0.05,
                  duration: 0.3,
                }}
                whileHover={{ scale: 1.05 }}
              >
                <div className="text-xs text-gray-500 mb-1">{indicator.label}</div>
                <div className="font-semibold text-gray-900 tracking-tight">{indicator.value}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* achet cet actif */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.23, duration: 0.5 }}
        >
          <div className="text-xs text-gray-400 mb-3 tracking-wide uppercase px-1">
            Acheter cet actif
          </div>
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
          <div className="flex flex-col gap-2">
            {asset.news.map((news, index) => (
              <motion.button
                key={news.id}
                className="bg-gray-50 hover:bg-gray-100 px-4 py-3 rounded-2xl text-sm text-gray-700 transition-all text-left"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.6 + index * 0.1,
                  duration: 0.3,
                }}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
              >
                {news.title}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
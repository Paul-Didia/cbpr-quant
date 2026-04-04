import { Link } from "react-router-dom";
import { ArrowRight, Star, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PageTransition } from "../components/PageTransition";
import { AssetIcon } from "../components/AssetIcon";
import { type AssetType } from "../data/mockAssets";
import { useFavorites } from "../contexts/FavoritesContext";
import { useAuth } from "../contexts/AuthContext";
import { apiService } from "../services/api";
import { useWebHaptics } from "web-haptics/react";

type LibraryAsset = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  logo?: string;
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

const LIBRARY_CACHE_KEY = "cbpr_library_cache_v1";

function normalizeAssetType(
  rawType?: string,
  rawCategory?: string,
  symbol?: string,
  name?: string,
  exchange?: string,
): AssetType {
  const type = (rawType || "").toLowerCase();
  const category = (rawCategory || "").toLowerCase();
  const exchangeValue = (exchange || "").toLowerCase();
  const symbolValue = (symbol || "").toUpperCase();

  // ✅ 1. PRIORITÉ AU BACKEND
  if (category === "forex") return "forex";
  if (category === "crypto") return "crypto";
  if (category === "etf") return "etf";
  if (category === "actions") return "stock";

  // ✅ 2. TYPE BACKEND
  if (type.includes("forex")) return "forex";
  if (type.includes("crypto")) return "crypto";
  if (type.includes("etf")) return "etf";
  if (type.includes("stock") || type.includes("equity")) return "stock";

  // ✅ 3. FALLBACK LOGIQUE
  if (exchangeValue === "forex" || symbolValue.includes("/")) return "forex";

  if (
    ["nasdaq", "nyse", "euronext", "lse"].some((ex) =>
      exchangeValue.includes(ex)
    )
  ) {
    return "stock";
  }

  return "stock";
}

function mapBackendAsset(asset: any): LibraryAsset {
  const symbol = String(asset.symbol || "");
  const name = String(asset.name || symbol);

  return {
    id: symbol,
    symbol,
    name,
    assetType: normalizeAssetType(
      asset.type || asset.instrument_type,
      asset.category,
      symbol,
      name,
      asset.exchange,
    ),
    logo: "",
  };
}

function rankSearchResults(results: LibraryAsset[], query: string): LibraryAsset[] {
  const q = query.trim().toUpperCase();
  if (!q) return results;

  const uniqueResults = results.filter(
    (asset, index, self) => index === self.findIndex((a) => a.id === asset.id)
  );

  const exactMatches = uniqueResults.filter(
    (asset) => asset.symbol.toUpperCase() === q
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const scored = uniqueResults.map((asset) => {
    const symbol = asset.symbol.toUpperCase();
    const name = asset.name.toUpperCase();

    let score = 0;

    if (symbol.startsWith(q)) score += 100;
    else if (symbol.includes(q)) score += 60;

    if (name.startsWith(q)) score += 40;
    else if (name.includes(q)) score += 20;

    return { asset, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.asset);
}

function normalizeAccessSymbol(symbol?: string) {
  return String(symbol || "").trim().toUpperCase();
}

function getRequiredPlanForAsset(asset: LibraryAsset): UserPlan {
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

function isAssetAllowedForPlan(asset: LibraryAsset, plan: UserPlan): boolean {
  const requiredPlan = getRequiredPlanForAsset(asset);

  if (plan === "quant") return true;
  if (plan === "pro") return requiredPlan !== "quant";
  return requiredPlan === "free";
}

function getPlanBadgeClasses(plan: UserPlan): string {
  if (plan === "quant") return "bg-gradient-to-r from-yellow-400 to-orange-500 text-white";
  if (plan === "pro") return "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white";
  return "bg-gray-100 text-gray-700";
}

function getPlanLabel(plan: UserPlan): string {
  if (plan === "quant") return "Quant";
  if (plan === "pro") return "Pro";
  return "Free";
}

export function Library() {
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  const { trigger } = useWebHaptics();
  const triggerAssetTap = () => trigger("light");
  const triggerFavoriteTap = () => trigger("success");
  const { user } = useAuth();
  const [optimisticFavorites, setOptimisticFavorites] = useState<Record<string, boolean>>({});
  const [favoriteBursts, setFavoriteBursts] = useState<Record<string, number>>({});
  const lastFavoriteActionRef = useRef<Record<string, number>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<AssetType | "all">("all");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const currentPlan: UserPlan = user?.subscription || "free";

  const getFavoriteState = (assetId: string) => {
    return assetId in optimisticFavorites
      ? optimisticFavorites[assetId]
      : isFavorite(assetId);
  };

  const toggleWatchlist = async (assetId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerFavoriteTap();

    const targetAsset = assets.find((item) => item.id === assetId);
    if (!targetAsset) return;

    const isAllowed = isAssetAllowedForPlan(targetAsset, currentPlan);
    if (!isAllowed) {
      return;
    }

    const currentValue = getFavoriteState(assetId);
    const nextValue = !currentValue;
    const actionId = (lastFavoriteActionRef.current[assetId] || 0) + 1;
    lastFavoriteActionRef.current[assetId] = actionId;

    setOptimisticFavorites((prev) => ({
      ...prev,
      [assetId]: nextValue,
    }));

    setFavoriteBursts((prev) => ({
      ...prev,
      [assetId]: (prev[assetId] || 0) + 1,
    }));

    try {
      if (nextValue) {
        await addFavorite(assetId);
      } else {
        await removeFavorite(assetId);
      }

      if (lastFavoriteActionRef.current[assetId] !== actionId) {
        return;
      }

      setOptimisticFavorites((prev) => {
        const copy = { ...prev };
        delete copy[assetId];
        return copy;
      });
    } catch (error) {
      console.error("Error toggling favorite:", error);

      if (lastFavoriteActionRef.current[assetId] !== actionId) {
        return;
      }

      setOptimisticFavorites((prev) => ({
        ...prev,
        [assetId]: currentValue,
      }));

      window.setTimeout(() => {
        if (lastFavoriteActionRef.current[assetId] === actionId) {
          setOptimisticFavorites((prev) => {
            const copy = { ...prev };
            delete copy[assetId];
            return copy;
          });
        }
      }, 600);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const query = searchQuery.trim();

    if (!query && selectedCategory === "all") {
      try {
        const cached = window.localStorage.getItem(LIBRARY_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as LibraryAsset[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAssets(parsed);
            setHasLoadedOnce(true);
          }
        }
      } catch (error) {
        console.error("Error reading library cache:", error);
      }
    }

    const run = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const limit =
          query
            ? 50
            : selectedCategory === "all"
              ? 5000
              : selectedCategory === "stock"
                ? 3000
                : 1500;

        const data = query
          ? await apiService.searchAssets(query, selectedCategory, limit)
          : await apiService.getLibraryAssets(query, limit, selectedCategory);

        const rawAssets = Array.isArray(query ? data?.data : data?.assets)
          ? (query ? data.data : data.assets)
          : [];

        const mappedAssets = rawAssets.map(mapBackendAsset);
        const finalAssets = query
          ? rankSearchResults(mappedAssets, query)
          : mappedAssets;

        if (!isCancelled) {
          setAssets(finalAssets);
          setHasLoadedOnce(true);

          if (!query && selectedCategory === "all") {
            window.localStorage.setItem(
              LIBRARY_CACHE_KEY,
              JSON.stringify(finalAssets),
            );
          }
        }
      } catch (error) {
        console.error("Error loading library assets:", error);

        if (!isCancelled) {
          setAssets((prev) => prev);
          setErrorMessage("Impossible de charger les actifs pour le moment.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    const timeout = window.setTimeout(run, query ? 250 : 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery, selectedCategory]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesCategory =
        selectedCategory === "all" || asset.assetType === selectedCategory;

      return matchesCategory;
    });
  }, [assets, selectedCategory]);

  const categories = [
    { id: "all" as const, label: "Tous", icon: "⟡" },
    { id: "stock" as const, label: "Actions", icon: "$" },
    { id: "etf" as const, label: "ETF", icon: "E" },
    { id: "forex" as const, label: "Forex", icon: "£" },
    { id: "crypto" as const, label: "Crypto", icon: "฿" },
  ];

  useEffect(() => {
    if (assets.length > 0) {
      console.log(
        "Library assets loaded:",
        assets.length,
        assets.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
        })),
      );
    }
  }, [assets]);

  const SkeletonList = () => (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <motion.div
          key={`skeleton-${index}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.04, duration: 0.25 }}
          className="bg-white rounded-2xl p-4 border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-22 h-22 rounded-2xl bg-gray-100 animate-pulse" />

              <div className="flex-1 space-y-2">
                <div className="h-5 w-24 bg-gray-100 rounded-md animate-pulse" />
                <div className="h-3 w-40 bg-gray-100 rounded-md animate-pulse" />
              </div>

              <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />

              <div className="w-20 h-5 bg-gray-100 rounded-md animate-pulse" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 overflow-x-hidden">
        <motion.h1
          className="text-[28px] font-semibold mb-6 tracking-tight"
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Bibliothèque d'actifs
        </motion.h1>

        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un actif..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-all"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4 text-gray-400" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div
          className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          {categories.map((category, index) => (
            <motion.button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === category.id
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:border-blue-300"
                }`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.2 + index * 0.05,
                duration: 0.3,
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="mr-2">{category.icon}</span>
              {category.label}
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence>
          {!isLoading && (
            <motion.div
              className="mb-4 text-sm text-gray-600"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {filteredAssets.length} actif
              {filteredAssets.length > 1 ? "s" : ""}
              {searchQuery ? " trouvé" : " affiché"}
              {filteredAssets.length > 1 ? "s" : ""}
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && !hasLoadedOnce ? (
          <SkeletonList />
        ) : errorMessage && filteredAssets.length === 0 ? (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Erreur de chargement
            </h3>
            <p className="text-gray-600">{errorMessage}</p>
          </motion.div>
        ) : filteredAssets.length === 0 ? (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun actif trouvé
            </h3>
            <p className="text-gray-600">
              Essayez une autre recherche
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {filteredAssets.map((asset, index) => {
              const isWatched = getFavoriteState(asset.id);
              const burstKey = favoriteBursts[asset.id] || 0;
              const requiredPlan = getRequiredPlanForAsset(asset);
              const isAllowed = isAssetAllowedForPlan(asset, currentPlan);

              return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.05,
                    duration: 0.4,
                  }}
                >
                  {isAllowed ? (
                    <Link
                      to={`/asset/${encodeURIComponent(asset.id)}`}
                      onClick={triggerAssetTap}
                    >
                      <div className="block bg-white rounded-2xl p-4 border border-gray-100 active:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <AssetIcon
                              logo=""
                              name={asset.name}
                              assetType={asset.assetType}
                              size="md"
                            />

                            <div className="flex-1">
                              <div className="items-baseline gap-2">
                                <p className="font-semibold text-gray-900 tracking-tight">
                                  {asset.symbol}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {asset.name}
                                </p>
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPlanBadgeClasses(requiredPlan)}`}
                                >
                                  {getPlanLabel(requiredPlan)}
                                </span>
                              </div>
                            </div>

                            <motion.button
                              onClick={(e) => toggleWatchlist(asset.id, e)}
                              className="p-2 rounded-full transition-all relative overflow-hidden isolate hover:bg-gray-100"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.85 }}
                            >
                              {isWatched && (
                                <motion.div
                                  key={`favorite-burst-${asset.id}-${burstKey}`}
                                  className="absolute inset-0 rounded-full pointer-events-none z-0"
                                  initial={{ scale: 0.2, opacity: 0.9 }}
                                  animate={{ scale: 2, opacity: 0 }}
                                  transition={{ duration: 0.5, ease: "easeOut" }}
                                  style={{
                                    background:
                                      "conic-gradient(from 0deg, #ff0080, #7928ca, #0070f3, #00c853, #ffeb3b, #ff6d00, #ff0080)",
                                  }}
                                />
                              )}

                              <motion.div
                                key={`star-${asset.id}-${isWatched}-${burstKey}`}
                                initial={isWatched ? { scale: 0.7, rotate: -15 } : { scale: 1 }}
                                animate={
                                  isWatched
                                    ? { scale: [0.7, 1.3, 1], rotate: [0, -10, 8, 0] }
                                    : { scale: [1, 0.88, 1], rotate: [0, -8, 0] }
                                }
                                transition={{ duration: 0.45, ease: "easeOut" }}
                                className="relative z-10 pointer-events-none"
                              >
                                <Star
                                  className={`w-5 h-5 transition-colors duration-200 ${
                                    isWatched ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
                                  }`}
                                />
                              </motion.div>
                            </motion.button>

                            <div className="w-4" />
                          </div>

                          <ArrowRight className="w-5 h-5 text-gray-400 ml-4" />
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className="block bg-white rounded-2xl p-4 border border-gray-100 transition-colors opacity-75">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <AssetIcon
                            logo=""
                            name={asset.name}
                            assetType={asset.assetType}
                            size="md"
                          />

                          <div className="flex-1">
                            <div className="items-baseline gap-2">
                              <p className="font-semibold text-gray-900 tracking-tight">
                                {asset.symbol}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {asset.name}
                              </p>
                            </div>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPlanBadgeClasses(requiredPlan)}`}
                              >
                                {getPlanLabel(requiredPlan)}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                Disponible avec le plan {getPlanLabel(requiredPlan)}
                              </span>
                            </div>
                          </div>

                          <motion.button
                            onClick={(e) => toggleWatchlist(asset.id, e)}
                            className="p-2 rounded-full transition-all relative overflow-hidden isolate bg-gray-50 cursor-not-allowed opacity-50"
                            disabled
                          >
                            <motion.div
                              key={`star-${asset.id}-${isWatched}-${burstKey}`}
                              initial={isWatched ? { scale: 0.7, rotate: -15 } : { scale: 1 }}
                              animate={
                                isWatched
                                  ? { scale: [0.7, 1.3, 1], rotate: [0, -10, 8, 0] }
                                  : { scale: [1, 0.88, 1], rotate: [0, -8, 0] }
                              }
                              transition={{ duration: 0.45, ease: "easeOut" }}
                              className="relative z-10 pointer-events-none"
                            >
                              <Star
                                className={`w-5 h-5 transition-colors duration-200 ${
                                  isWatched ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
                                }`}
                              />
                            </motion.div>
                          </motion.button>

                          <div className="w-4" />
                        </div>

                        <div className="text-[10px] text-gray-400 ml-4 font-medium">
                          Plan {getPlanLabel(requiredPlan)}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
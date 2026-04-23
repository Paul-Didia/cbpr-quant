import { Link } from "react-router-dom";
import { Circle, ArrowRight } from "lucide-react";
import {
  type AssetStatus,
  type AssetType,
} from "../data/mockAssets";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { PageTransition } from "../components/PageTransition";
import { CbprMethode } from "../components/CbprMethode";
import { AssetIcon } from "../components/AssetIcon";
import { useFavorites } from "../contexts/FavoritesContext";
import { apiService } from "../services/api";

type HomeAsset = {
  id: string;
  symbol: string;
  name: string;
  logo: string;
  assetType: AssetType;
  currentPrice: number;
  status: AssetStatus;
};

const LIBRARY_CACHE_KEY = "cbpr_library_cache_v1";

const HOME_ASSET_CACHE_PREFIX = "cbpr_home_asset_";
const HOME_CACHE_DURATION = 1000 * 60 * 60 * 4; // 4h
const HOME_REFRESH_LIMIT = 7;

function getHomeAssetCacheKey(symbol: string) {
  return `${HOME_ASSET_CACHE_PREFIX}${encodeURIComponent(symbol)}`;
}

function getCachedHomeAsset(symbol: string): HomeAsset | null {
  try {
    const raw = window.localStorage.getItem(getHomeAssetCacheKey(symbol));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.timestamp) return null;

    const isFresh = Date.now() - parsed.timestamp < HOME_CACHE_DURATION;
    if (!isFresh) return null;

    return parsed.data as HomeAsset;
  } catch {
    return null;
  }
}

function setCachedHomeAsset(symbol: string, data: HomeAsset) {
  try {
    window.localStorage.setItem(
      getHomeAssetCacheKey(symbol),
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch { }
}


function inferAssetType(
  symbol: string,
  name: string,
  exchange: string,
): AssetType {
  const symbolValue = (symbol || "").toUpperCase();
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

  if (exchangeValue === "forex") return "forex";

  if (
    cryptoExchanges.some((item) => exchangeValue.includes(item)) ||
    nameValue.includes("bitcoin") ||
    nameValue.includes("ethereum")
  ) {
    return "crypto";
  }

  if (nameValue.includes("etf") || nameValue.includes("ucits")) {
    return "etf";
  }

  if (symbolValue.includes("/")) {
    return "forex";
  }

  return "stock";
}

function mapSignalToStatus(signal?: string): AssetStatus {
  const value = (signal || "").toUpperCase();

  if (value.includes("ACHAT")) return "opportunity";
  if (value.includes("VENTE")) return "risk";
  return "neutral";
}

function getCachedLibraryAssets(): Array<{
  id: string;
  symbol: string;
  name: string;
  logo?: string;
  assetType: AssetType;
}> {
  try {
    const raw = window.localStorage.getItem(LIBRARY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function Home() {
  const { favorites } = useFavorites();
  const [openCbprMethod, setOpenCbprMethod] = useState(false);
  const [watchedAssets, setWatchedAssets] = useState<HomeAsset[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, []);

  useEffect(() => {
    try {
      const shouldShowMethod = sessionStorage.getItem("cbpr_show_method_on_home") === "true";

      if (shouldShowMethod) {
        setOpenCbprMethod(true);
        sessionStorage.removeItem("cbpr_show_method_on_home");
      }
    } catch { }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const cachedLibrary = getCachedLibraryAssets();

    const immediateAssets = favorites.map((symbol) => {
      const cachedAsset = getCachedHomeAsset(symbol);
      if (cachedAsset) {
        return cachedAsset;
      }

      const libraryAsset = cachedLibrary.find((asset) => asset.id === symbol);

      return {
        id: symbol,
        symbol,
        name: libraryAsset?.name || symbol,
        logo: "",
        assetType: libraryAsset?.assetType || "stock",
        currentPrice: 0,
        status: "neutral" as AssetStatus,
      };
    });

    const symbolsToRefresh = favorites
      .slice(0, HOME_REFRESH_LIMIT)
      .filter((symbol) => !getCachedHomeAsset(symbol));

    if (!isCancelled) {
      setWatchedAssets(immediateAssets);
    }

    if (favorites.length === 0 || symbolsToRefresh.length === 0) {
      return () => {
        isCancelled = true;
      };
    }

    const run = async () => {
      if (!isCancelled) {
        setIsRefreshing(true);
      }

      try {
        const refreshedResults = await Promise.all(
          symbolsToRefresh.map(async (symbol): Promise<HomeAsset | null> => {
            try {
              const [assetResponse, analysisResponse] = await Promise.all([
                apiService.getAssetDetail(symbol),
                apiService.getAnalysis(symbol),
              ]);

              const quote = assetResponse?.quote || {};
              const analysis = analysisResponse?.analysis || {};
              const cachedLibraryAsset = cachedLibrary.find((asset) => asset.id === symbol);

              const name = String(quote?.name || cachedLibraryAsset?.name || symbol);
              const exchange = String(quote?.exchange || "");
              const currentPrice = Number(quote?.price || 0);
              const signal = String(analysis?.signal || "NEUTRE");

              const mappedAsset: HomeAsset = {
                id: symbol,
                symbol,
                name,
                logo: "",
                assetType:
                  cachedLibraryAsset?.assetType ||
                  inferAssetType(symbol, name, exchange),
                currentPrice,
                status: mapSignalToStatus(signal),
              };

              setCachedHomeAsset(symbol, mappedAsset);
              return mappedAsset;
            } catch (error) {
              console.error(`Error loading favorite ${symbol}:`, error);
              return null;
            }
          })
        );

        if (!isCancelled) {
          const refreshedMap = new Map<string, HomeAsset>();

          refreshedResults.forEach((asset) => {
            if (asset) {
              refreshedMap.set(asset.id, asset);
            }
          });

          setWatchedAssets((current) =>
            current.map((asset) => refreshedMap.get(asset.id) || asset)
          );
        }
      } catch (error) {
        console.error("Error refreshing watched assets:", error);
      } finally {
        if (!isCancelled) {
          setIsRefreshing(false);
        }
      }
    };

    run();

    return () => {
      isCancelled = true;
    };
  }, [favorites]);

  const displayedAssets = useMemo(() => {
    const watchedMap = new Map(watchedAssets.map((asset) => [asset.id, asset]));
    const cachedLibrary = getCachedLibraryAssets();

    return favorites.map((symbol) => {
      const loaded = watchedMap.get(symbol);
      if (loaded) return loaded;

      const libraryAsset = cachedLibrary.find((asset) => asset.id === symbol);

      return {
        id: symbol,
        symbol,
        name: libraryAsset?.name || symbol,
        logo: "",
        assetType: libraryAsset?.assetType || "stock",
        currentPrice: 0,
        status: "neutral" as AssetStatus,
      };
    });
  }, [favorites, watchedAssets]);

  const getStatusColor = (status: AssetStatus) => {
    switch (status) {
      case "opportunity":
        return "text-green-500";
      case "neutral":
        return "text-yellow-500";
      case "risk":
        return "text-red-500";
    }
  };

  const getStatusLabel = (status: AssetStatus) => {
    switch (status) {
      case "opportunity":
        return "Opportunité";
      case "neutral":
        return "Neutre";
      case "risk":
        return "Risque";
    }
  };

  if (!isRefreshing && favorites.length === 0) {
    return (
      <PageTransition>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            Mes actifs suivis
          </motion.h1>

          <motion.div
            className="max-w-md mx-auto text-center space-y-8 py-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <motion.div
              className="flex justify-center mt-5"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center">
                <span className="text-5xl font-semibold text-gray-400">
                  $
                </span>
              </div>
            </motion.div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                Aucun actif suivi
              </h2>
              <p className="text-gray-600 leading-relaxed px-4 mb-2">
                Commencez par ajouter des actifs à votre liste
                de suivi depuis la bibliothèque
              </p>
              <p className="text-gray-600 leading-relaxed px-4">
                15 actifs maximum
              </p>
            </div>

            <Link to="/library">
              <motion.button
                className="inline-flex items-center gap-2 bg-blue-500 text-white py-3.5 px-6 rounded-2xl shadow-lg shadow-blue-500/25 font-medium"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 17,
                }}
              >
                Parcourir la bibliothèque
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
        <CbprMethode isOpen={openCbprMethod} onClose={() => setOpenCbprMethod(false)} />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          Mes actifs suivis
        </motion.h1>

        <div className="flex items-center justify-between text-xs text-gray-400 mb-4 tracking-wide">
          <span>Analyse temps réel</span>
        </div>

        <div className="space-y-3">
          {displayedAssets.map((asset, index) => {
            const isPending = asset.currentPrice <= 0;
            return (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08, duration: 0.35 }}
              >
                <Link to={`/asset/${encodeURIComponent(asset.id)}`}>
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
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 tracking-tight">
                              {asset.symbol}
                            </span>
                            <motion.div
                              animate={{ scale: [1, 1.12, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <Circle
                                className={`w-2 h-2 fill-current ${getStatusColor(asset.status)}`}
                              />
                            </motion.div>
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {isPending ? "Signal en cours..." : getStatusLabel(asset.status)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-semibold text-gray-900 tracking-tight">
                            {isPending ? "--" : `${asset.currentPrice.toFixed(2)}€`}
                          </div>
                        </div>
                      </div>

                      <ArrowRight className="w-5 h-5 text-gray-400 ml-4" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
}
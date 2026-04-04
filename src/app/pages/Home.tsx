import { Link } from "react-router-dom";
import { Circle, ArrowRight } from "lucide-react";
import {
  type AssetStatus,
  type AssetType,
} from "../data/mockAssets";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { PageTransition } from "../components/PageTransition";
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
const HOME_VISIBLE_BATCH = 5;

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
  } catch {}
}

function removeCachedHomeAsset(symbol: string) {
  try {
    window.localStorage.removeItem(getHomeAssetCacheKey(symbol));
  } catch {}
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
  const [watchedAssets, setWatchedAssets] = useState<HomeAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(HOME_VISIBLE_BATCH);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, []);

  useEffect(() => {
    setVisibleCount(HOME_VISIBLE_BATCH);
  }, [favorites]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry?.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + HOME_VISIBLE_BATCH, favorites.length)
          );
        }
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [favorites.length]);

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      if (favorites.length === 0) {
        if (!isCancelled) {
          setWatchedAssets([]);
          setIsLoading(false);
        }
        return;
      }

      if (!isCancelled) {
        setIsLoading(true);
      }

      try {
        const cachedLibrary = getCachedLibraryAssets();
        const visibleFavorites = favorites.slice(0, visibleCount);

        const results = await Promise.all(
          visibleFavorites.map(async (symbol): Promise<HomeAsset | null> => {
            const cachedAsset = getCachedHomeAsset(symbol);
            if (cachedAsset) {
              return cachedAsset;
            }

            try {
              const [assetResponse, analysisResponse] = await Promise.all([
                apiService.getAssetDetail(symbol),
                apiService.getAnalysis(symbol),
              ]);

              const quote = assetResponse?.quote || {};
              const analysis = analysisResponse?.analysis || {};

              const cachedLibraryAsset = cachedLibrary.find(
                (asset) => asset.id === symbol
              );

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
          }),
        );

        const validResults = results.filter(
          (item): item is HomeAsset => item !== null,
        );

        if (!isCancelled) {
          setWatchedAssets(validResults);
        }

        // nettoyage optionnel : on supprime les caches des symboles retirés des favoris
        try {
          Object.keys(localStorage).forEach((key) => {
            if (!key.startsWith(HOME_ASSET_CACHE_PREFIX)) return;

            const encodedSymbol = key.replace(HOME_ASSET_CACHE_PREFIX, "");
            const decodedSymbol = decodeURIComponent(encodedSymbol);

            if (!favorites.includes(decodedSymbol)) {
              removeCachedHomeAsset(decodedSymbol);
            }
          });
        } catch (error) {
          console.error("Error cleaning home asset cache:", error);
        }
      } catch (error) {
        console.error("Error loading watched assets:", error);
        if (!isCancelled) {
          setWatchedAssets([]);
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
  }, [favorites, visibleCount]);

  const displayedAssets = useMemo(() => {
    return favorites.slice(0, visibleCount).map((symbol) => {
      const loaded = watchedAssets.find((asset) => asset.id === symbol);
      if (loaded) return loaded;

      const cachedLibrary = getCachedLibraryAssets();
      const libraryAsset = cachedLibrary.find((asset) => asset.id === symbol);

      return {
        id: symbol,
        symbol,
        name: libraryAsset?.name || symbol,
        logo: "",
        assetType: libraryAsset?.assetType || "stock",
        currentPrice: 0,
        status: "neutral" as AssetStatus,
        isPlaceholder: true,
      };
    });
  }, [favorites, visibleCount, watchedAssets]);

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

  if (!isLoading && watchedAssets.length === 0) {
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
              <p className="text-gray-600 leading-relaxed px-4">
                Commencez par ajouter des actifs à votre liste
                de suivi depuis la bibliothèque
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

        <div className="space-y-3">
          {isLoading
            ? Array.from({ length: Math.max(favorites.length, 3) }).map((_, index) => (
              <motion.div
                key={`home-skeleton-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08, duration: 0.35 }}
              >
                <div className="block bg-white rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 animate-pulse" />

                      <div className="flex-1">
                        <div className="h-5 w-24 bg-gray-100 rounded-md animate-pulse mb-2" />
                        <div className="h-4 w-20 bg-gray-100 rounded-md animate-pulse" />
                      </div>

                      <div className="text-right">
                        <div className="h-5 w-16 bg-gray-100 rounded-md animate-pulse" />
                      </div>
                    </div>

                    <div className="w-5 h-5 ml-4 bg-gray-100 rounded-md animate-pulse" />
                  </div>
                </div>
              </motion.div>
            ))
            : displayedAssets.map((asset, index) => {
                const isPlaceholder = "isPlaceholder" in asset && asset.isPlaceholder;
                return (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                {isPlaceholder ? (
                  <div className="block bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-14 h-14 rounded-2xl bg-gray-100 animate-pulse" />

                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 tracking-tight">
                            {asset.symbol}
                          </div>
                          <div className="text-sm text-gray-400 mt-0.5">
                            Chargement...
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="h-5 w-16 bg-gray-100 rounded-md animate-pulse" />
                        </div>
                      </div>

                      <div className="w-5 h-5 ml-4 bg-gray-100 rounded-md animate-pulse" />
                    </div>
                  </div>
                ) : (
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
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                }}
                              >
                                <Circle
                                  className={`w-2 h-2 fill-current ${getStatusColor(asset.status)}`}
                                />
                              </motion.div>
                            </div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              {getStatusLabel(asset.status)}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-semibold text-gray-900 tracking-tight">
                              {asset.currentPrice.toFixed(2)}€
                            </div>
                          </div>
                        </div>

                        <ArrowRight className="w-5 h-5 text-gray-400 ml-4" />
                      </div>
                    </div>
                  </Link>
                )}
              </motion.div>
                );
              })}
        </div>
        {visibleCount < favorites.length && (
          <div ref={loadMoreRef} className="h-10" />
        )}
      </div>
    </PageTransition>
  );
}
import { Link } from "react-router-dom";
import { Circle, ArrowRight, ChevronDown } from "lucide-react";
import {
  type AssetStatus,
  type AssetType,
} from "../data/mockAssets";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { PageTransition } from "../components/PageTransition";
import { CbprMethode } from "../components/CbprMethode";
import { AnalysisModelPopup, ANALYSIS_MODELS, type AnalysisModel } from "../components/AnalysisModelPopup";
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

const SELECTED_MODEL_STORAGE_KEY = "cbpr_selected_analysis_model";

function getStoredAnalysisModel(): AnalysisModel {
  try {
    const storedModel = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
    if (storedModel === "volatility_breakout" || storedModel === "mean_reversion" || storedModel === "cbpr") {
      return storedModel;
    }
  } catch { }

  return "cbpr";
}


function getHomeAssetCacheKey(symbol: string, model: AnalysisModel) {
  return `${HOME_ASSET_CACHE_PREFIX}${model}_${encodeURIComponent(symbol)}`;
}

function getCachedHomeAsset(symbol: string, model: AnalysisModel): HomeAsset | null {
  try {
    const raw = window.localStorage.getItem(getHomeAssetCacheKey(symbol, model));
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

function setCachedHomeAsset(symbol: string, model: AnalysisModel, data: HomeAsset) {
  try {
    window.localStorage.setItem(
      getHomeAssetCacheKey(symbol, model),
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
  const [selectedModel, setSelectedModel] = useState<AnalysisModel>(() => getStoredAnalysisModel());
  const [openModelPopup, setOpenModelPopup] = useState(false);
  const selectedModelInfo = useMemo(
    () => ANALYSIS_MODELS.find((model) => model.id === selectedModel) || ANALYSIS_MODELS[0],
    [selectedModel],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel);
    } catch { }
  }, [selectedModel]);

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
      const cachedAsset = getCachedHomeAsset(symbol, selectedModel);
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
      .filter((symbol) => !getCachedHomeAsset(symbol, selectedModel));

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
              const analysisResponse = await apiService.getAnalysis(symbol, "4h", 300, selectedModel);

              const quote = analysisResponse?.quote || {};
              const analysis = analysisResponse?.analysis || {};
              const cachedLibraryAsset = cachedLibrary.find((asset) => asset.id === symbol);

              const name = String(quote?.name || cachedLibraryAsset?.name || symbol);
              const exchange = String(quote?.exchange || "");
              const currentPrice = Number(quote?.price || 0);
              const signal = String(analysis?.signal || "NEUTRE");
              const backendAssetType = String(analysisResponse?.assetType || "");

              const mappedAsset: HomeAsset = {
                id: symbol,
                symbol,
                name,
                logo: String(analysisResponse?.logo || ""),
                assetType:
                  (backendAssetType as AssetType) ||
                  cachedLibraryAsset?.assetType ||
                  inferAssetType(symbol, name, exchange),
                currentPrice,
                status: mapSignalToStatus(signal),
              };

              setCachedHomeAsset(symbol, selectedModel, mappedAsset);
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
  }, [favorites, selectedModel]);

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

  const totalValue = useMemo(() => {
    return displayedAssets.reduce((sum, asset) => {
      if (!asset.currentPrice || asset.currentPrice <= 0) return sum;
      return sum + asset.currentPrice;
    }, 0);
  }, [displayedAssets]);

  const globalStatus = useMemo<AssetStatus>(() => {
    const counts: Record<AssetStatus, number> = {
      opportunity: 0,
      neutral: 0,
      risk: 0,
    };

    displayedAssets.forEach((asset) => {
      if (!asset.currentPrice || asset.currentPrice <= 0) return;
      counts[asset.status] += 1;
    });

    if (counts.opportunity > counts.neutral && counts.opportunity > counts.risk) {
      return "opportunity";
    }

    if (counts.risk > counts.neutral && counts.risk > counts.opportunity) {
      return "risk";
    }

    return "neutral";
  }, [displayedAssets]);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-white">

          <motion.div
            className="flex items-center gap-3 mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >

            <h1
              className="text-[28px] font-semibold tracking-tight"
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
              }}
            >
              Mes actifs suivis
            </h1>
          </motion.div>

          <motion.div className="max-w-md mx-auto text-center space-y-8 py-16">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white tracking-tight">
                Aucun actif suivi
              </h2>
              <p className="text-[#a3aab8] leading-relaxed px-4">
                Commencez par ajouter des actifs à votre liste depuis la bibliothèque.
              </p>
            </div>

            <Link to="/library">
              <motion.button className="inline-flex items-center gap-2 bg-[#262730] border border-white/15 text-white py-3.5 px-6 rounded-2xl font-medium shadow-lg shadow-black/30">
                Parcourir la bibliothèque
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
        </div>

        <CbprMethode
          isOpen={openCbprMethod}
          onClose={() => setOpenCbprMethod(false)}
        />
      </PageTransition>
    );
  }

  return (
    <div className="bg-[#28374D] text-white">
      <div className="relative min-h-screen overflow-hidden bg-[#28374D] pb-24">

        <section
          className="fixed left-0 right-0 top-0 z-0 h-[240px] lg:h-[320px] overflow-hidden bg-[#28374D] px-6 pt-12 sm:px-8 lg:px-12"
        >

          <div className="relative z-10 max-w-7xl mx-auto">

            <h1
              className="text-[28px] font-semibold tracking-tight text-white"
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
              }}
            >
              Mes actifs suivis
            </h1>

            <div className="mt-2">
              <div className="text-sm text-white/80">Valeur théorique suivie</div>

              <motion.div
                className="mt-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-[42px] lg:text-[60px] leading-none tracking-tight text-white">
                  {totalValue > 0 ? `${totalValue.toFixed(2)} €` : "--"}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <motion.span
                    className={`relative inline-flex h-2.5 w-2.5 ${getStatusColor(globalStatus)}`}
                    aria-hidden="true"
                  >
                    <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-30 animate-ping" />
                    <Circle className="relative inline-flex h-2.5 w-2.5 fill-current" />
                  </motion.span>
                  <span className="text-base font-semibold text-white/90">
                    {getStatusLabel(globalStatus)}
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <PageTransition>
          <div className="relative z-10 mt-[220px] bg-[#28374D] px-4 pb-6 pt-6 sm:px-6 lg:mt-[250px] lg:px-8">
            <div className="mx-auto max-w-7xl">


              <div className="relative flex z-10 max-w-7xl mx-auto">

                <div className="mb-4 text-sm text-[#a3aab8]">
                  Analyse en temps réel 4H
                </div>

                <div className="ml-auto mb-5">
                  <button
                    type="button"
                    onClick={() => setOpenModelPopup(true)}
                    className="flex items-center gap-2 appearance-none bg-blue-500 rounded-2xl border border-white/5 active:bg-[#1f2937] transition-colors shadow-sm shadow-blue-500/20 py-2 pl-4 pr-3 text-sm focus:outline-none"
                  >
                    <span>{selectedModelInfo.shortLabel}</span>
                    <ChevronDown className="h-4 w-4 text-gray-200" />
                  </button>
                </div>

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
                      <Link to={`/asset/${encodeURIComponent(asset.id)}?model=${selectedModel}`}>
                        <div className="block bg-[#1E2939] rounded-2xl p-4 border border-white/1 active:bg-[#1f2937] transition-colors shadow-lg shadow-black/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <AssetIcon
                                logo={asset.logo}
                                name={asset.name}
                                assetType={asset.assetType}
                                size="md"
                              />

                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white tracking-tight">
                                    {asset.symbol}
                                  </span>
                                  <motion.span
                                    className={`relative inline-flex h-2 w-2 ${getStatusColor(asset.status)}`}
                                    aria-hidden="true"
                                  >
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-25 animate-ping" />
                                    <Circle className="relative inline-flex h-2 w-2 fill-current" />
                                  </motion.span>
                                </div>

                                <div className="text-sm text-[#a3aab8] mt-0.5">
                                  {isPending
                                    ? "Signal en cours..."
                                    : getStatusLabel(asset.status)}
                                </div>
                              </div>

                              <div className="text-right font-semibold text-white tracking-tight">
                                {isPending
                                  ? "--"
                                  : `${asset.currentPrice.toFixed(2)}€`}
                              </div>
                            </div>

                            <ArrowRight className="w-5 h-5 text-[#6b7280] ml-4" />
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

            </div>
          </div>
        </PageTransition>

      </div>
      <AnalysisModelPopup
        isOpen={openModelPopup}
        selectedModel={selectedModel}
        onApply={setSelectedModel}
        onClose={() => setOpenModelPopup(false)}
      />
      <CbprMethode
        isOpen={openCbprMethod}
        onClose={() => setOpenCbprMethod(false)}
      />
    </div>
  );
}
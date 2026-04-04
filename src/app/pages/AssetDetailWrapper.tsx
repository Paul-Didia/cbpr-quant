import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { AssetLoadingTransition } from "../components/AssetLoadingTransition";
import { AssetDetail } from "./AssetDetail";
import { AnimatePresence } from "motion/react";
import { type AssetType } from "../data/mockAssets";

type CachedLibraryAsset = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  currentPrice: number;
  logo?: string;
};

const LIBRARY_CACHE_KEY = "cbpr_library_cache_v1";

function inferAssetTypeFromSymbol(symbol: string): AssetType {
  const upper = symbol.toUpperCase();

  if (upper.includes("/")) {
    if (upper === "BTC/USD" || upper === "ETH/USD") {
      return "crypto";
    }
    return "forex";
  }

  return "stock";
}

export function AssetDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id || "");
  const [isLoading, setIsLoading] = useState(true);

  const cachedAsset = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(LIBRARY_CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as CachedLibraryAsset[];
      if (!Array.isArray(parsed)) return null;

      return parsed.find((asset) => asset.id === decodedId) || null;
    } catch (error) {
      console.error("Error reading library cache in AssetDetailWrapper:", error);
      return null;
    }
  }, [decodedId]);

  const fallbackAsset = {
    name: decodedId || "Actif",
    logo: "",
    assetType: inferAssetTypeFromSymbol(decodedId),
  };

  const transitionAsset = cachedAsset || fallbackAsset;

  useEffect(() => {
    setIsLoading(true);

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [decodedId]);

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && (
          <AssetLoadingTransition
            assetName={transitionAsset.name}
            assetLogo={transitionAsset.logo || ""}
            assetType={transitionAsset.assetType}
          />
        )}
      </AnimatePresence>

      {!isLoading && <AssetDetail />}
    </>
  );
}
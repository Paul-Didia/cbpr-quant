import { useState } from "react";
import { type AssetType } from "../data/mockAssets";

interface AssetIconProps {
  logo: string;
  name: string;
  assetType: AssetType;
  size?: "sm" | "md" | "lg" | "xl";
}

export function AssetIcon({
  logo,
  name,
  assetType,
  size = "md",
}: AssetIconProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: "w-20 h-20 text-base",
    md: "w-22 h-22 text-lg",
    lg: "w-26 h-26 text-2xl",
    xl: "w-32 h-32 text-4xl",
  };

  const getAssetSymbol = (type: AssetType): string => {
    switch (type) {
      case "stock":
        return "$";
      case "etf":
        return "E";
      case "forex":
        return "£";
      case "crypto":
        return "฿";
    }
  };

  const getAssetColor = (type: AssetType): string => {
    switch (type) {
      case "stock":
        return "bg-green-500/10 text-green-600";
      case "etf":
        return "bg-blue-500/10 text-blue-600";
      case "forex":
        return "bg-purple-500/10 text-purple-600";
      case "crypto":
        return "bg-orange-500/10 text-orange-600";
    }
  };

  if (imageError || !logo) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg flex items-center justify-center font-semibold ${getAssetColor(assetType)}`}
      >
        {getAssetSymbol(assetType)}
      </div>
    );
  }

  return (
    <img
      src={logo}
      alt={name}
      className={`${sizeClasses[size]} rounded-xl object-cover bg-gray-100`}
      onError={() => setImageError(true)}
    />
  );
}
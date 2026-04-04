export type UserPlan = "free" | "pro" | "quant";
export type AssetType = "stock" | "etf" | "crypto" | "forex";

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

function normalizeSymbol(symbol?: string) {
  return String(symbol || "").trim().toUpperCase();
}

export function getRequiredPlanForAsset(
  asset: { symbol: string; assetType: AssetType }
): UserPlan {
  const symbol = normalizeSymbol(asset.symbol);

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

export function isAssetAllowedForPlan(
  asset: { symbol: string; assetType: AssetType },
  plan: UserPlan
): boolean {
  const requiredPlan = getRequiredPlanForAsset(asset);

  if (plan === "quant") return true;
  if (plan === "pro") return requiredPlan !== "quant";
  return requiredPlan === "free";
}

export function getUpgradeMessage(requiredPlan: UserPlan): string {
  if (requiredPlan === "pro") {
    return "Cet actif est réservé aux abonnés Pro ou Quant.";
  }

  if (requiredPlan === "quant") {
    return "Cet actif est réservé aux abonnés Quant.";
  }

  return "Cet actif est disponible avec votre formule actuelle.";
}
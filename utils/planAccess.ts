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

const FREE_CRYPTO_SYMBOLS = new Set([
  "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "BNB/USD"
]);

const PRO_CRYPTO_SYMBOLS = new Set([
  "ADA/USD", "DOGE/USD", "AVAX/USD", "LINK/USD", "DOT/USD",
  "TRX/USD", "TON/USD", "MATIC/USD", "SHIB/USD", "BCH/USD"
]);

const FREE_ETF_SYMBOLS = new Set([
  "SPY", "QQQ", "VTI", "IVV", "VT"
]);

const PRO_ETF_SYMBOLS = new Set([
  "IWM", "DIA", "XLK", "VEA", "EEM",
  "VWO", "XLF", "XLE", "ARKK", "VNQ"
]);

function normalizeSymbol(symbol?: string) {
  let normalized = String(symbol || "").trim().toUpperCase();

  if (":" in Object(normalized) && normalized.includes(":")) {
    normalized = normalized.split(":").pop() || normalized;
  }

  return normalized;
}

export function getRequiredPlanForAsset(
  asset: { symbol: string; assetType: AssetType }
): UserPlan {
  const symbol = normalizeSymbol(asset.symbol);

  if (FREE_STOCK_SYMBOLS.has(symbol)) {
    return "free";
  }

  if (asset.assetType === "crypto") {
    if (FREE_CRYPTO_SYMBOLS.has(symbol)) {
      return "free";
    }

    if (PRO_CRYPTO_SYMBOLS.has(symbol)) {
      return "pro";
    }

    return "quant";
  }

  if (asset.assetType === "etf") {
    if (FREE_ETF_SYMBOLS.has(symbol)) {
      return "free";
    }

    if (PRO_ETF_SYMBOLS.has(symbol)) {
      return "pro";
    }

    return "quant";
  }

  if (asset.assetType === "forex") {
    return "quant";
  }

  if (asset.assetType === "stock") {
    return "pro";
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
export type AssetStatus = 'opportunity' | 'neutral' | 'risk';
export type AssetType = 'stock' | 'etf' | 'forex' | 'crypto';

export interface TechnicalIndicator {
  channelDirection: 'Haussier' | 'Baissier' | 'Latéral';
  bollingerBands: 'Test haut' | 'Test bas' | 'Neutre' | 'Zone médiane';
  nearestLevel: string;
  rsi: number;
  macd: 'Positif' | 'Négatif' | 'Croisement' | 'Neutre';
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  status: AssetStatus;
  assetType: AssetType;
  description: string;
  news: NewsItem[];
  technicalIndicators: TechnicalIndicator;
  logo: string;
  chartData: {
    date: string;
    price: number;
    zone: 'risk' | 'opportunity' | 'neutral';
  }[];
}

export const mockAssets: Asset[] = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currentPrice: 178.45,
    status: 'opportunity',
    assetType: 'stock',
    description: "Apple conçoit, fabrique et commercialise des smartphones, ordinateurs personnels, tablettes, wearables et accessoires. L'entreprise est leader dans l'innovation technologique avec des produits comme l'iPhone, l'iPad et le Mac.",
    news: [
      { id: '1', title: 'Apple annonce de nouveaux produits d\'IA', date: '2026-03-25' },
      { id: '2', title: 'Résultats trimestriels au-dessus des attentes', date: '2026-03-20' },
      { id: '3', title: 'Expansion en Inde avec nouvelles usines', date: '2026-03-15' },
    ],
    technicalIndicators: {
      channelDirection: 'Haussier',
      bollingerBands: 'Test bas',
      nearestLevel: 'Support à 175.20€',
      rsi: 42,
      macd: 'Positif',
    },
    logo: 'https://logo.clearbit.com/apple.com',
    chartData: generateChartData(150, 180, 'opportunity'),
  },
  {
    id: '2',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    currentPrice: 425.30,
    status: 'neutral',
    assetType: 'stock',
    description: "Microsoft développe, fabrique, licence et soutient des logiciels, services, appareils et solutions. L'entreprise est leader dans le cloud computing avec Azure et dans la productivité avec Office 365.",
    news: [
      { id: '1', title: 'Partenariat stratégique dans l\'IA générative', date: '2026-03-24' },
      { id: '2', title: 'Azure affiche une croissance de 30%', date: '2026-03-18' },
      { id: '3', title: 'Nouvelle version de Windows annoncée', date: '2026-03-10' },
    ],
    technicalIndicators: {
      channelDirection: 'Haussier',
      bollingerBands: 'Neutre',
      nearestLevel: 'Résistance à 430.00€',
      rsi: 55,
      macd: 'Croisement',
    },
    logo: 'https://logo.clearbit.com/microsoft.com',
    chartData: generateChartData(400, 430, 'neutral'),
  },
  {
    id: '3',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    currentPrice: 195.80,
    status: 'risk',
    assetType: 'stock',
    description: "Tesla conçoit, développe, fabrique et vend des véhicules électriques, des systèmes de stockage d'énergie et des solutions d'énergie solaire. L'entreprise révolutionne l'industrie automobile et énergétique.",
    news: [
      { id: '1', title: 'Problèmes de production en Chine', date: '2026-03-25' },
      { id: '2', title: 'Concurrence accrue sur le marché EV', date: '2026-03-22' },
      { id: '3', title: 'Baisse des livraisons au Q1', date: '2026-03-16' },
    ],
    technicalIndicators: {
      channelDirection: 'Baissier',
      bollingerBands: 'Test haut',
      nearestLevel: 'Résistance à 200.00€',
      rsi: 68,
      macd: 'Négatif',
    },
    logo: 'https://logo.clearbit.com/tesla.com',
    chartData: generateChartData(180, 210, 'risk'),
  },
  {
    id: '4',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    currentPrice: 142.60,
    status: 'opportunity',
    assetType: 'stock',
    description: "Alphabet est une holding regroupant plusieurs entreprises, dont Google. Elle offre des services de recherche, publicité, systèmes d'exploitation, cloud computing et matériel informatique.",
    news: [
      { id: '1', title: 'Gemini AI dépasse les attentes', date: '2026-03-23' },
      { id: '2', title: 'Croissance forte dans le cloud', date: '2026-03-19' },
      { id: '3', title: 'Rachat stratégique dans la cybersécurité', date: '2026-03-12' },
    ],
    technicalIndicators: {
      channelDirection: 'Haussier',
      bollingerBands: 'Test bas',
      nearestLevel: 'Support à 140.00€',
      rsi: 38,
      macd: 'Positif',
    },
    logo: 'https://logo.clearbit.com/google.com',
    chartData: generateChartData(130, 150, 'opportunity'),
  },
  {
    id: '5',
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    currentPrice: 178.90,
    status: 'neutral',
    assetType: 'stock',
    description: "Amazon est une entreprise de commerce électronique et de cloud computing. Elle opère dans le retail en ligne, AWS (cloud), streaming vidéo, et intelligence artificielle.",
    news: [
      { id: '1', title: 'AWS maintient sa position de leader', date: '2026-03-24' },
      { id: '2', title: 'Expansion du réseau logistique', date: '2026-03-17' },
      { id: '3', title: 'Prime atteint 250M d\'abonnés', date: '2026-03-11' },
    ],
    technicalIndicators: {
      channelDirection: 'Haussier',
      bollingerBands: 'Neutre',
      nearestLevel: 'Résistance à 182.50€',
      rsi: 52,
      macd: 'Croisement',
    },
    logo: 'https://logo.clearbit.com/amazon.com',
    chartData: generateChartData(165, 185, 'neutral'),
  },
  {
    id: '6',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    currentPrice: 880.20,
    status: 'risk',
    assetType: 'stock',
    description: "NVIDIA conçoit des processeurs graphiques (GPU) pour le gaming et le calcul professionnel. L'entreprise est leader dans l'IA et le machine learning avec ses puces spécialisées.",
    news: [
      { id: '1', title: 'Valorisation jugée excessive par analystes', date: '2026-03-25' },
      { id: '2', title: 'Nouvelle puce IA annoncée', date: '2026-03-21' },
      { id: '3', title: 'Tensions géopolitiques sur semi-conducteurs', date: '2026-03-14' },
    ],
    technicalIndicators: {
      channelDirection: 'Baissier',
      bollingerBands: 'Test haut',
      nearestLevel: 'Résistance à 900.00€',
      rsi: 72,
      macd: 'Négatif',
    },
    logo: 'https://logo.clearbit.com/nvidia.com',
    chartData: generateChartData(750, 900, 'risk'),
  },
  {
    id: '7',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF',
    currentPrice: 512.45,
    status: 'opportunity',
    assetType: 'etf',
    description: "Le SPDR S&P 500 ETF Trust est un fonds négocié en bourse qui vise à suivre la performance de l'indice S&P 500. C'est l'un des ETF les plus populaires et liquides au monde.",
    news: [
      { id: '1', title: 'Flux entrants records sur les ETF S&P 500', date: '2026-03-26' },
      { id: '2', title: 'Dividendes trimestriels annoncés', date: '2026-03-22' },
      { id: '3', title: 'Rééquilibrage de l\'indice prévu', date: '2026-03-18' },
    ],
    technicalIndicators: {
      channelDirection: 'Haussier',
      bollingerBands: 'Zone médiane',
      nearestLevel: 'Support à 505.00€',
      rsi: 58,
      macd: 'Positif',
    },
    logo: '',
    chartData: generateChartData(480, 520, 'opportunity'),
  },
  {
    id: '8',
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    currentPrice: 1.0845,
    status: 'neutral',
    assetType: 'forex',
    description: "L'EUR/USD est la paire de devises la plus échangée au monde, représentant le taux de change entre l'euro et le dollar américain. Cette paire est influencée par les politiques monétaires de la BCE et de la Fed.",
    news: [
      { id: '1', title: 'BCE maintient ses taux directeurs', date: '2026-03-27' },
      { id: '2', title: 'Données économiques US mitigées', date: '2026-03-24' },
      { id: '3', title: 'Volatilité attendue sur le marché', date: '2026-03-20' },
    ],
    technicalIndicators: {
      channelDirection: 'Latéral',
      bollingerBands: 'Zone médiane',
      nearestLevel: 'Résistance à 1.0900',
      rsi: 52,
      macd: 'Neutre',
    },
    logo: '',
    chartData: generateChartData(1.07, 1.10, 'neutral'),
  },
  {
    id: '9',
    symbol: 'BTC',
    name: 'Bitcoin',
    currentPrice: 68500.00,
    status: 'risk',
    assetType: 'crypto',
    description: "Bitcoin est la première et la plus grande cryptomonnaie par capitalisation boursière. Créée en 2009, elle fonctionne sur une technologie de blockchain décentralisée et est considérée comme de l'or numérique.",
    news: [
      { id: '1', title: 'Régulation crypto renforcée en Europe', date: '2026-03-28' },
      { id: '2', title: 'Halving Bitcoin prévu pour 2028', date: '2026-03-25' },
      { id: '3', title: 'Volatilité extrême sur les marchés crypto', date: '2026-03-22' },
    ],
    technicalIndicators: {
      channelDirection: 'Baissier',
      bollingerBands: 'Test haut',
      nearestLevel: 'Support majeur à 65000€',
      rsi: 68,
      macd: 'Négatif',
    },
    logo: '',
    chartData: generateChartData(62000, 72000, 'risk'),
  },
];

function generateChartData(
  minPrice: number,
  maxPrice: number,
  trend: 'opportunity' | 'neutral' | 'risk'
): Asset['chartData'] {
  const data: Asset['chartData'] = [];
  const today = new Date('2026-03-26');
  
  for (let i = 60; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    let zone: 'risk' | 'opportunity' | 'neutral' = 'neutral';
    let price: number;
    
    // Générer un prix basé sur la tendance
    const progress = (60 - i) / 60;
    
    if (trend === 'opportunity') {
      price = minPrice + (maxPrice - minPrice) * 0.3 + Math.random() * (maxPrice - minPrice) * 0.2;
      if (i < 15) zone = 'opportunity';
    } else if (trend === 'risk') {
      price = maxPrice - (maxPrice - minPrice) * 0.2 + Math.random() * (maxPrice - minPrice) * 0.15;
      if (i < 15) zone = 'risk';
    } else {
      price = minPrice + (maxPrice - minPrice) * (0.4 + Math.random() * 0.3);
    }
    
    data.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(price * 100) / 100,
      zone,
    });
  }
  
  return data;
}
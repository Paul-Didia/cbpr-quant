import { projectId } from '/utils/supabase/info';

const SUPABASE_API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-819c6d9b`;
const PYTHON_API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const IS_DEV = import.meta.env.DEV;

export class ApiService {
  private token: string | null = null;
  private userEmail: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setUserEmail(email: string | null) {
    this.userEmail = email;
  }

  private async request(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {},
    extraHeaders: Record<string, string> = {}
  ) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${baseUrl}${endpoint}`;

    if (IS_DEV) {
      console.log('API Request →', url, {
        hasToken: !!this.token,
        userEmail: this.userEmail,
        extraHeaders,
      });
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      console.error(`API Error [${url}]`, error);
      throw new Error(error.detail || error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private async requestSupabase(endpoint: string, options: RequestInit = {}) {
    return this.request(SUPABASE_API_BASE, endpoint, options);
  }

  private async requestPython(endpoint: string, options: RequestInit = {}) {
    const extraHeaders: Record<string, string> = {};

    if (this.userEmail) {
      extraHeaders['X-User-Email'] = this.userEmail;
    }

    return this.request(PYTHON_API_BASE, endpoint, options, extraHeaders);
  }

  // ===== FAVORITES (SUPABASE) =====
  async getFavorites(): Promise<string[]> {
    const data = await this.requestSupabase('/favorites');
    return data.favorites;
  }

  async addFavorite(assetId: string): Promise<string[]> {
    const data = await this.requestSupabase('/favorites', {
      method: 'POST',
      body: JSON.stringify({ assetId }),
    });
    return data.favorites;
  }

  async removeFavorite(assetId: string): Promise<string[]> {
    const data = await this.requestSupabase(
      `/favorites/${encodeURIComponent(assetId)}`,
      {
        method: 'DELETE',
      }
    );
    return data.favorites;
  }

  // ===== USER PROFILE (SUPABASE) =====
  async getProfile() {
    const data = await this.requestSupabase('/auth/profile');
    return data.profile;
  }

  // ===== SUBSCRIPTION (PYTHON) =====
  async getSubscription(email: string): Promise<'free' | 'pro' | 'quant'> {
    const data = await this.requestPython(
      `/subscription?email=${encodeURIComponent(email)}`
    );
    return data.subscription;
  }

  async updateSubscription(subscription: 'free' | 'pro' | 'quant') {
    const data = await this.requestSupabase('/subscription', {
      method: 'POST',
      body: JSON.stringify({ subscription }),
    });
    return data.subscription;
  }

  // ===== LIBRARY / SEARCH (PYTHON) =====
  async searchAssets(query: string, category: string = 'all', limit: number = 100) {
    return this.requestPython(
      `/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&limit=${limit}`
    );
  }

  async getLibraryAssets(
    query: string = '',
    limit: number = 30,
    category: string = 'all'
  ) {
    return this.requestPython(
      `/library?q=${encodeURIComponent(query)}&limit=${limit}&category=${encodeURIComponent(category)}`
    );
  }

  // ===== MARKET DATA (PYTHON) =====
  async getQuote(symbol: string) {
    return this.requestPython(`/quote/${encodeURIComponent(symbol)}`);
  }

  async getTimeSeries(symbol: string, interval: string = '4h', outputsize: number = 300) {
    return this.requestPython(
      `/timeseries/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&outputsize=${outputsize}`
    );
  }

  async getLogo(symbol: string) {
    return this.requestPython(`/logo/${encodeURIComponent(symbol)}`);
  }

  async getAssetDetail(symbol: string) {
    return this.requestPython(`/asset/${encodeURIComponent(symbol)}`);
  }

  // ===== CBPR ANALYSIS (PYTHON) =====
  async getAnalysis(symbol: string, interval: string = '4h', outputsize: number = 300) {
    return this.requestPython(
      `/analysis/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&outputsize=${outputsize}`
    );
  }

  async analyzeFavorites(interval: string = '4h', outputsize: number = 300) {
    const favorites = await this.getFavorites();

    const results = await Promise.all(
      favorites.map(async (symbol) => {
        try {
          const analysis = await this.getAnalysis(symbol, interval, outputsize);
          return { symbol, ...analysis };
        } catch (error) {
          return {
            symbol,
            error: error instanceof Error ? error.message : 'Analysis failed',
          };
        }
      })
    );

    return { results };
  }
}

export const apiService = new ApiService();
import { projectId } from '/utils/supabase/info';

const SUPABASE_API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-819c6d9b`;
const PYTHON_API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const IS_DEV = import.meta.env.DEV;

export interface DeskMember {
  id: string;
  label: string;
  role: 'owner' | 'member';
}

export interface DeskGroup {
  id: string;
  name: string;
  role: 'owner' | 'member';
  members: DeskMember[];
}

export interface GroupAsset {
  id: string;
  group_id: string;
  symbol: string;
  name?: string | null;
  asset_type?: string | null;
  logo?: string | null;
  added_by?: string | null;
  added_at?: string;
}

export interface GroupAssetPayload {
  symbol: string;
  name?: string;
  assetType?: string;
  logo?: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  room_id: string;
  message: string;
  user_id: string;
  user_email?: string | null;
  created_at: string;
}

export interface GroupMessagePayload {
  roomId: string;
  message: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id?: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  subscription_plan: 'trader' | 'fund' | 'organization';
  max_users: number;
  subscription_active: boolean;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  created_at: string;
}

export interface OrganizationDashboard {
  organization: Organization;
  members: OrganizationMember[];
  used_users: number;
  max_users: number;
}

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

  async deleteAccount() {
    return this.requestSupabase('/auth/delete-account', {
      method: 'POST',
    });
  }

  // ===== DESK GROUPS (SUPABASE) =====
  async getGroups(): Promise<DeskGroup[]> {
    const data = await this.requestSupabase('/groups');
    return data.groups || [];
  }

  async createGroup(name: string, password: string): Promise<DeskGroup> {
    const data = await this.requestSupabase('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });

    return data.group;
  }

  async joinGroup(groupId: string, password: string): Promise<DeskGroup> {
    const data = await this.requestSupabase('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ groupId, password }),
    });

    return data.group;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<{ success: boolean; deletedGroup?: boolean }> {
    return this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ===== DESK GROUP ASSETS (SUPABASE) =====
  async getGroupAssets(groupId: string): Promise<GroupAsset[]> {
    const data = await this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/assets`
    );

    return data.assets || [];
  }

  async addGroupAsset(groupId: string, asset: GroupAssetPayload): Promise<GroupAsset> {
    const data = await this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/assets`,
      {
        method: 'POST',
        body: JSON.stringify(asset),
      }
    );

    return data.asset;
  }

  async removeGroupAsset(groupId: string, symbol: string): Promise<{ success: boolean }> {
    return this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/assets/${encodeURIComponent(symbol)}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ===== DESK GROUP MESSAGES (SUPABASE) =====
  async getGroupMessages(groupId: string, roomId: string = 'general'): Promise<GroupMessage[]> {
    const data = await this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/messages?roomId=${encodeURIComponent(roomId)}`
    );

    return data.messages || [];
  }

  async sendGroupMessage(groupId: string, payload: GroupMessagePayload): Promise<GroupMessage> {
    const data = await this.requestSupabase(
      `/groups/${encodeURIComponent(groupId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return data.message;
  }

  // ===== ORGANIZATIONS / ENTERPRISE ACCESS (SUPABASE) =====
  async enterpriseLogin(name: string, password: string): Promise<OrganizationDashboard> {
    return this.requestSupabase('/organizations/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
  }

  async getOrganizationDashboard(organizationId: string): Promise<OrganizationDashboard> {
    return this.requestSupabase(
      `/organizations/${encodeURIComponent(organizationId)}`
    );
  }

  async addOrganizationMember(organizationId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<OrganizationMember> {
    const data = await this.requestSupabase(
      `/organizations/${encodeURIComponent(organizationId)}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }
    );

    return data.member;
  }

  async removeOrganizationMember(organizationId: string, memberId: string): Promise<{ success: boolean }> {
    return this.requestSupabase(
      `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}`,
      {
        method: 'DELETE',
      }
    );
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

  // ===== MACRO STATUS (PYTHON) =====
  async getMacroStatus() {
    return this.requestPython('/macro/status');
  }

  // ===== CBPR ANALYSIS (PYTHON) =====
  async getAnalysis(
    symbol: string,
    interval: string = '4h',
    outputsize: number = 300,
    model: string = 'cbpr'
  ) {
    return this.requestPython(
      `/analysis/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&model=${encodeURIComponent(model)}`
    );
  }

  async analyzeFavorites(interval: string = '4h', outputsize: number = 300, model: string = 'cbpr') {
    const favorites = await this.getFavorites();

    const results = await Promise.all(
      favorites.map(async (symbol) => {
        try {
          const analysis = await this.getAnalysis(symbol, interval, outputsize, model);
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
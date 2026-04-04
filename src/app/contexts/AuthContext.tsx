import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { apiService } from '../services/api';

interface User {
  email: string;
  name: string;
  memberSince: string;
  subscription: 'free' | 'pro' | 'quant';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  updateSubscription: (subscription: 'free' | 'pro' | 'quant') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('Initial session check:', {
          hasSession: !!session,
          hasToken: !!session?.access_token,
        });

        if (session?.access_token) {
          apiService.setToken(session.access_token);
          apiService.setUserEmail(session.user?.email ?? null);
          loadUserProfile();
        } else {
          apiService.setToken(null);
          apiService.setUserEmail(null);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error getting session:', error);
        apiService.setToken(null);
        apiService.setUserEmail(null);
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', { event, hasSession: !!session });

      if (session?.access_token) {
        apiService.setToken(session.access_token);
        apiService.setUserEmail(session.user?.email ?? null);
        loadUserProfile();
      } else {
        setUser(null);
        apiService.setToken(null);
        apiService.setUserEmail(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async () => {
    try {
      console.log('Loading user profile...');
      const profile = await apiService.getProfile();
      console.log('Profile loaded:', profile);

      apiService.setUserEmail(profile.email);

      const subscription = await apiService.getSubscription(profile.email);
      console.log('Subscription loaded:', subscription);

      setUser({
        email: profile.email,
        name: profile.name,
        memberSince: new Date(profile.memberSince).toLocaleDateString('fr-FR', {
          month: 'long',
          year: 'numeric',
        }),
        subscription,
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
      await supabase.auth.signOut();
      setUser(null);
      apiService.setToken(null);
      apiService.setUserEmail(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data.session?.access_token) {
      apiService.setToken(data.session.access_token);
      apiService.setUserEmail(data.session.user?.email ?? email);
      await loadUserProfile();
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-819c6d9b/auth/signup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Signup failed');
    }

    await login(email, password);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    apiService.setToken(null);
    apiService.setUserEmail(null);
  };

  const updateSubscription = async (subscription: 'free' | 'pro' | 'quant') => {
    if (user) {
      try {
        await apiService.updateSubscription(subscription);
        setUser({ ...user, subscription });
      } catch (error) {
        console.error('Error updating subscription:', error);
        throw error;
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
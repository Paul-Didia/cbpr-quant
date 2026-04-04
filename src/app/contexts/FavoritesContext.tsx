import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';

interface FavoritesContextType {
  favorites: string[];
  isLoading: boolean;
  addFavorite: (assetId: string) => Promise<void>;
  removeFavorite: (assetId: string) => Promise<void>;
  isFavorite: (assetId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, isLoading: authIsLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading before loading favorites
    if (authIsLoading) {
      return;
    }

    if (isAuthenticated) {
      loadFavorites();
    } else {
      // Load from localStorage if not authenticated
      const stored = localStorage.getItem('watchlist');
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
      setIsLoading(false);
    }
  }, [isAuthenticated, authIsLoading]);

  const loadFavorites = async () => {
    try {
      const favs = await apiService.getFavorites();
      setFavorites(favs);
    } catch (error) {
      console.error('Error loading favorites:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('watchlist');
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const addFavorite = async (assetId: string) => {
    if (isAuthenticated) {
      try {
        const updatedFavorites = await apiService.addFavorite(assetId);
        setFavorites(updatedFavorites);
      } catch (error) {
        console.error('Error adding favorite:', error);
        throw error;
      }
    } else {
      // Use localStorage if not authenticated
      const updatedFavorites = [...favorites, assetId];
      setFavorites(updatedFavorites);
      localStorage.setItem('watchlist', JSON.stringify(updatedFavorites));
    }
  };

  const removeFavorite = async (assetId: string) => {
    if (isAuthenticated) {
      try {
        const updatedFavorites = await apiService.removeFavorite(assetId);
        setFavorites(updatedFavorites);
      } catch (error) {
        console.error('Error removing favorite:', error);
        throw error;
      }
    } else {
      // Use localStorage if not authenticated
      const updatedFavorites = favorites.filter(id => id !== assetId);
      setFavorites(updatedFavorites);
      localStorage.setItem('watchlist', JSON.stringify(updatedFavorites));
    }
  };

  const isFavorite = (assetId: string) => {
    return favorites.includes(assetId);
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isLoading,
        addFavorite,
        removeFavorite,
        isFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    console.error('useFavorites was called outside of FavoritesProvider!');
    console.error('Component tree location:', new Error().stack);
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { SplashScreen } from './components/SplashScreen';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  
  useEffect(() => {
    // Check if user has seen splash screen before
    const hasSeenSplash = localStorage.getItem('hasSeenSplash');
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);
  
  const handleSplashComplete = () => {
    localStorage.setItem('hasSeenSplash', 'true');
    setShowSplash(false);
  };
  
  return (
    <AuthProvider>
      <FavoritesProvider>
        {showSplash ? (
          <AnimatePresence mode="wait">
            <SplashScreen onComplete={handleSplashComplete} />
          </AnimatePresence>
        ) : (
          <RouterProvider router={router} />
        )}
      </FavoritesProvider>
    </AuthProvider>
  );
}
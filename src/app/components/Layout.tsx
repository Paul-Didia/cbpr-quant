import { Link, Outlet, useLocation } from 'react-router';
import { Home, Library, User } from 'lucide-react';
import { motion } from 'motion/react';
import { useWebHaptics } from 'web-haptics/react';

export function Layout() {
  const location = useLocation();

  const { trigger } = useWebHaptics();

  const triggerNavHaptic = () => {
    trigger('medium');
  };
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      {/* Main Content */}
      <main className="flex-1 pt-4 pb-6">
        <Outlet />
      </main>
      
      {/* Bottom Navigation */}
      <motion.nav 
        className="fixed bottom-0 left-0 right-0 z-[100000] bg-white/90 backdrop-blur-xl border-t border-gray-200/50 pb-safe"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-around items-center h-20">
            <Link to="/home" onClick={triggerNavHaptic}>
              <motion.div
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                  isActive('/home')
                    ? 'text-blue-500'
                    : 'text-gray-500'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
              >
                <Home className="w-6 h-6" strokeWidth={isActive('/home') ? 2.5 : 2} />
                <motion.span 
                  className="text-[11px] font-medium tracking-tight"
                  animate={{ fontWeight: isActive('/home') ? 600 : 500 }}
                >
                  Accueil
                </motion.span>
              </motion.div>
            </Link>
            
            <Link to="/library" onClick={triggerNavHaptic}>
              <motion.div
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                  isActive('/library')
                    ? 'text-blue-500'
                    : 'text-gray-500'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
              >
                <Library className="w-6 h-6" strokeWidth={isActive('/library') ? 2.5 : 2} />
                <motion.span 
                  className="text-[11px] font-medium tracking-tight"
                  animate={{ fontWeight: isActive('/library') ? 600 : 500 }}
                >
                  Bibliothèque
                </motion.span>
              </motion.div>
            </Link>

            <Link to="/profile" onClick={triggerNavHaptic}>
              <motion.div
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                  isActive('/profile')
                    ? 'text-blue-500'
                    : 'text-gray-500'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
              >
                <User className="w-6 h-6" strokeWidth={isActive('/profile') ? 2.5 : 2} />
                <motion.span 
                  className="text-[11px] font-medium tracking-tight"
                  animate={{ fontWeight: isActive('/profile') ? 600 : 500 }}
                >
                  Profil
                </motion.span>
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.nav>
    </div>
  );
}
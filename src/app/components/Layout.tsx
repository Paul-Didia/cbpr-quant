import { Link, Outlet, useLocation } from 'react-router';
import { Home, Library, LayoutDashboard, User } from 'lucide-react';
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
    <div className="min-h-screen bg-[#28374D] text-white flex flex-col pb-24 overflow-x-hidden">
      {/* Main Content */}
      <main className="flex-1 pt-4 pb-6">
        <Outlet />
      </main>
      
      {/* Bottom Navigation */}
      <motion.nav 
        className="fixed bottom-0 left-0 right-0 z-[100000] isolate pointer-events-auto touch-manipulation select-none bg-[#1f2937]/95 backdrop-blur-xl border-t border-white/10 pb-safe shadow-2xl shadow-black/40"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="max-w-7xl mx-auto px-4 pb-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-4 items-stretch h-20">
            <Link
              to="/home"
              onClick={triggerNavHaptic}
              className="h-full w-full flex items-center justify-center touch-manipulation"
            >
              <motion.div
                className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
                  isActive('/home')
                    ? 'text-[#60a5fa]'
                    : 'text-[#a3aab8]'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
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
            
            <Link
              to="/library"
              onClick={triggerNavHaptic}
              className="h-full w-full flex items-center justify-center touch-manipulation"
            >
              <motion.div
                className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
                  isActive('/library')
                    ? 'text-[#60a5fa]'
                    : 'text-[#a3aab8]'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
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

            
            <Link
              to="/desk"
              onClick={triggerNavHaptic}
              className="h-full w-full flex items-center justify-center touch-manipulation"
            >
              <motion.div
                className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
                  isActive('/desk')
                    ? 'text-[#60a5fa]'
                    : 'text-[#a3aab8]'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
              >
                <LayoutDashboard className="w-6 h-6" strokeWidth={isActive('/desk') ? 2.5 : 2} />
                <motion.span
                  className="text-[11px] font-medium tracking-tight"
                  animate={{ fontWeight: isActive('/desk') ? 600 : 500 }}
                >
                  Desk
                </motion.span>
              </motion.div>
            </Link>

            <Link
              to="/profile"
              onClick={triggerNavHaptic}
              className="h-full w-full flex items-center justify-center touch-manipulation"
            >
              <motion.div
                className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
                  isActive('/profile')
                    ? 'text-[#60a5fa]'
                    : 'text-[#a3aab8]'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
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
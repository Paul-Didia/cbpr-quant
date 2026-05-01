import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppLogo } from '../components/AppLogo';
import { useWebHaptics } from "web-haptics/react";

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { trigger } = useWebHaptics();
  const triggerSuccessTap = () => trigger("success");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    triggerSuccessTap();

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (!name.trim()) {
          setError('Veuillez entrer votre nom');
          setIsLoading(false);
          return;
        }
        await signup(email, password, name);
        sessionStorage.setItem('cbpr_show_method_on_home', 'true');
      }
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#061a3a] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(59,130,246,0.35)_0%,rgba(15,60,130,0.22)_24%,rgba(6,26,58,0)_58%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#071b3c_0%,#06152f_52%,#030b1b_100%)] pointer-events-none" />
      <div className="absolute left-1/2 top-[38%] h-[980px] w-[1600px] -translate-x-1/2 rounded-[50%] bg-[#061225] border-t border-blue-300/50 shadow-[0_-18px_45px_rgba(59,130,246,0.65)] pointer-events-none" />
      <div className="absolute left-[18%] top-[14%] h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[18%] top-[11%] h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[30%] top-[23%] h-2 w-2 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute left-[10%] top-[32%] h-2 w-2 rotate-45 bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute left-[22%] top-[30%] h-1 w-1 rotate-45 bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute right-[13%] top-[30%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[30%] top-[10%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[70%] top-[12%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[62%] top-[10%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[35%] top-[8%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[50%] top-[18%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[40%] top-[26%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[15%] top-[40%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />

      
      
      <motion.div 
        className="relative z-10 w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Logo */}
        <motion.div 
          className="flex justify-center mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <AppLogo
            size={80}
            rounded="rounded-[24px]"
            shadow={true}
          />
        </motion.div>

        {/* Titre */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h1 className="text-3xl font-semibold text-white mb-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
            {isLogin ? 'Bienvenue' : 'Créer un compte'}
          </h1>
          <p className="text-white/80">
            {isLogin ? 'Connectez-vous pour accéder à vos actifs' : 'Rejoignez CBPR Quant'}
          </p>
        </motion.div>

        {/* Formulaire */}
        <motion.div 
          className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom (uniquement pour inscription) */}
            <AnimatePresence>
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom complet
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      required={!isLogin}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Message d'erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bouton de soumission */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-500 text-white py-3.5 rounded-2xl font-semibold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={!isLoading ? { scale: 1.02, boxShadow: '0 20px 25px -5px rgb(59 130 246 / 0.3)' } : {}}
              whileTap={!isLoading ? { scale: 0.98 } : {}}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <span>Chargement...</span>
                </div>
              ) : (
                <>
                  <span>{isLogin ? 'Se connecter' : 'Créer mon compte'}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </form>

          {/* Basculer entre connexion et inscription */}
          <motion.div 
            className="mt-6 text-center"
            whileHover={{ scale: 1.02 }}
          >
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-blue-500 font-medium text-sm hover:underline"
            >
              {isLogin ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
            </button>
          </motion.div>
        </motion.div>

        {/* Disclaimer */}
        <motion.p 
          className="text-xs text-white/60 text-center mt-6 px-8 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          En vous connectant, vous acceptez nos conditions d'utilisation.
          CBPR Quant ne fournit pas de conseils d'investissement.
        </motion.p>
      </motion.div>
    </div>
  );
}
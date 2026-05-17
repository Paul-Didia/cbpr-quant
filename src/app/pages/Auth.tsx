import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppLogo } from '../components/AppLogo';
import { useWebHaptics } from "web-haptics/react";
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
);

async function isEmailAuthorized(email: string) {
  const safeEmail = email.trim().toLowerCase();

  if (!safeEmail) return false;

  const { data: organizationMember, error: organizationMemberError } = await supabase
    .from('organization_members')
    .select('id')
    .eq('email', safeEmail)
    .maybeSingle();

  if (organizationMemberError) {
    console.error('Organization member access check error:', organizationMemberError);
  }

  if (organizationMember?.id) {
    return true;
  }

  const { data: userProfile, error: userProfileError } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('email', safeEmail)
    .maybeSingle();

  if (userProfileError) {
    console.error('User profile access check error:', userProfileError);
  }

  return Boolean(userProfile?.email);
}

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const { login, signup, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { trigger } = useWebHaptics();
  const triggerSuccessTap = () => trigger("success");

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    const queryParams = new URLSearchParams(window.location.search);
    const hasRecoveryToken = hashParams.get('type') === 'recovery' || hashParams.has('access_token') || queryParams.get('type') === 'recovery';
    const recoveryError = hashParams.get('error_description') || queryParams.get('error_description');

    if (recoveryError) {
      setError(decodeURIComponent(recoveryError.replace(/\+/g, ' ')));
      return;
    }

    if (hasRecoveryToken) {
      setIsPasswordRecovery(true);
      setIsLogin(true);
      setPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    triggerSuccessTap();

    try {
      const hasAccess = await isEmailAuthorized(email);

      if (!hasAccess) {
        setError('Votre email n’est pas autorisé à accéder à CBPR Quant Pro. Contactez votre organisation.');
        setIsLoading(false);
        return;
      }

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

  const handleResetPassword = async () => {
    setError('');
    setSuccess('');
    setIsResettingPassword(true);
    triggerSuccessTap();

    try {
      await resetPassword(email);
      setSuccess('Email de réinitialisation envoyé. Vérifiez votre boîte mail.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer l’email de réinitialisation.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsLoading(true);
    triggerSuccessTap();

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw new Error(error.message);
      }

      setSuccess('Mot de passe modifié avec succès. Vous pouvez maintenant vous connecter.');
      setIsPasswordRecovery(false);
      setPassword('');
      setConfirmPassword('');
      window.history.replaceState({}, document.title, '/auth');
      await supabase.auth.signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117] flex items-center justify-center px-4 py-12">
      <motion.div 
        className="w-full max-w-md"
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
            {isPasswordRecovery ? 'Nouveau mot de passe' : isLogin ? 'Bienvenue' : 'Créer un compte'}
          </h1>
          <p className="text-[#a3aab8]">
            {isPasswordRecovery ? 'Choisissez un nouveau mot de passe sécurisé' : isLogin ? 'Connectez-vous pour accéder à vos actifs' : 'Rejoignez CBPR Quant'}
          </p>
        </motion.div>

        {/* Formulaire */}
        <motion.div 
          className="bg-[#111827] rounded-3xl p-6 shadow-2xl shadow-black/30 border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <form onSubmit={isPasswordRecovery ? handleUpdatePassword : handleSubmit} className="space-y-4">
            {/* Nom (uniquement pour inscription) */}
            <AnimatePresence>
              {!isLogin && !isPasswordRecovery && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <label className="block text-sm font-medium text-white mb-2">
                    Nom complet
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b7280]" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full pl-12 pr-4 py-3.5 bg-[#262730] border border-white/10 text-white placeholder:text-[#6b7280] rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      required={!isLogin}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            {!isPasswordRecovery && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b7280]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-[#262730] border border-white/10 text-white placeholder:text-[#6b7280] rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>
            )}

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                {isPasswordRecovery ? 'Nouveau mot de passe' : 'Mot de passe'}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b7280]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-[#262730] border border-white/10 text-white placeholder:text-[#6b7280] rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                />
              </div>

              {isLogin && !isPasswordRecovery && (
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isResettingPassword}
                    className="text-sm text-[#60a5fa] font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResettingPassword ? 'Envoi en cours...' : 'Mot de passe oublié ?'}
                  </button>
                </div>
              )}
            </div>

            {isPasswordRecovery && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b7280]" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3.5 bg-[#262730] border border-white/10 text-white placeholder:text-[#6b7280] rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>
            )}

            {/* Message d'erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Message de succès */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 text-green-300 bg-green-500/10 border border-green-500/20 rounded-xl p-3"
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{success}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bouton de soumission */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#262730] border border-white/15 text-white py-3.5 rounded-2xl font-semibold shadow-lg shadow-black/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={!isLoading ? { scale: 1.02, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.45)' } : {}}
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
                  <span>{isPasswordRecovery ? 'Modifier mon mot de passe' : isLogin ? 'Se connecter' : 'Créer mon compte'}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </form>

          {!isPasswordRecovery && (
            <motion.div 
              className="mt-6 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                }}
                className="text-[#60a5fa] font-medium text-sm hover:underline"
              >
                {isLogin ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
              </button>
            </motion.div>
          )}
        </motion.div>

        {/* Disclaimer */}
        <motion.p 
          className="text-xs text-[#a3aab8] text-center mt-6 px-8 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          En vous connectant, vous acceptez nos conditions d'utilisation.
          CBPR Quant ne fournit pas de conseils d'investissement.
        </motion.p>

        {/* Éléments décoratifs */}
        <motion.div
          className="absolute top-20 left-10 opacity-10 pointer-events-none"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <AppLogo
            size={96}
            rounded="rounded-[28px]"
            shadow={false}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
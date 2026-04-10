import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Bell, Crown, Zap, MessageCircle, TrendingUp, Check, X, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { CbprMethode } from '../components/CbprMethode';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function Profile() {
  const navigate = useNavigate();
  const { user, logout, updateSubscription } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<'free' | 'pro' | 'quant'>(user?.subscription || 'free');
  const [pendingPlan, setPendingPlan] = useState<'free' | 'pro' | 'quant' | null>(null);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [openCbprMethod, setOpenCbprMethod] = useState(false);
  const displayedPlan = pendingPlan ?? currentPlan;


  useEffect(() => {
    if (user?.subscription) {
      setCurrentPlan(user.subscription);
      setPendingPlan(null);
    }
  }, [user?.subscription]);

  const handlePlanChange = async (plan: 'free' | 'pro' | 'quant') => {
    if (isUpdatingPlan) return;

    if (plan === 'pro') {
      setPendingPlan('pro');
      setSubscriptionMessage('Redirection vers la page de souscription Pro...');
      window.open(stripeProUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (plan === 'quant') {
      setPendingPlan('quant');
      setSubscriptionMessage('Redirection vers la page de souscription Quant...');
      window.open(stripeQuantUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (plan === currentPlan && pendingPlan === null) return;

    setPendingPlan(plan);
    setCurrentPlan(plan);
    setSubscriptionMessage('');
    setIsUpdatingPlan(true);

    try {
      await updateSubscription(plan);
      setSubscriptionMessage('Votre formule Free est active.');
    } catch (error) {
      console.error('Error updating subscription from profile:', error);
      setPendingPlan(null);
      setCurrentPlan(user?.subscription || 'free');
      setSubscriptionMessage("Impossible de mettre à jour l'abonnement pour le moment.");
    } finally {
      if (plan === 'free') {
        setPendingPlan(null);
      }
      setIsUpdatingPlan(false);
    }
  };

  const hasWhatsappAccess = displayedPlan === 'pro' || displayedPlan === 'quant';
  const whatsappUrl = 'https://chat.whatsapp.com/ERFWl37TBNJJJjuqUwjx15?mode=gi_t';
  const stripeProUrl = 'https://buy.stripe.com/5kQ5kD8gScnSbdAdn4asg05';
  const stripeQuantUrl = 'https://buy.stripe.com/6oUfZhgNo87C5Tgdn4asg03';
  const stripeBillingUrl = 'https://billing.stripe.com/p/login/00w7sL1Su73y5Tgfvcasg00';

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  
  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Retour</span>
          </motion.button>
        </motion.div>
        
        <motion.h1 
          className="text-[28px] font-semibold mb-8 tracking-tight" 
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          Mon profil
        </motion.h1>
        
        {/* Profile Info */}
        <motion.div 
          className="bg-white rounded-3xl p-6 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-center gap-4 mb-6">
            <motion.div 
              className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <User className="w-10 h-10 text-white" />
            </motion.div>
            <div>
              <div className="mb-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
                    displayedPlan === 'quant'
                      ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-sm'
                      : displayedPlan === 'pro'
                        ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Plan {displayedPlan === 'quant' ? 'Quant' : displayedPlan === 'pro' ? 'Pro' : 'Free'}
                </span>
              </div>
              <div className="font-semibold text-gray-900 text-lg tracking-tight">{user?.name || 'Utilisateur'}</div>
              <div className="text-sm text-gray-600">Membre depuis {user?.memberSince || 'mars 2026'}</div>
            </div>
          </div>
          
          <div className="space-y-4">
            <motion.div 
              className="flex items-center gap-3 text-gray-600 bg-gray-50 rounded-2xl p-3"
              whileHover={{ scale: 1.02 }}
            >
              <Mail className="w-5 h-5" />
              <span>{user?.email || 'utilisateur@example.com'}</span>
            </motion.div>
          </div>
        </motion.div>
        
        {/* Subscription Plans */}
        <motion.div 
          className="bg-white rounded-3xl p-6 mb-6 shadow-sm border border-gray-100 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 text-lg tracking-tight mb-2">Abonnement</h2>
            <p className="text-sm text-gray-600">Accédez à plus d'actifs avec nos formules</p>
            {subscriptionMessage && (
              <div className={`mt-3 text-sm font-medium ${subscriptionMessage.startsWith('Impossible') ? 'text-red-600' : 'text-green-600'}`}>
                {subscriptionMessage}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* Free Plan */}
            <motion.div
              className={`relative rounded-2xl p-5 border-2 transition-all ${
                displayedPlan === 'free'
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-gray-200 bg-gray-50/50'
              } ${isUpdatingPlan ? 'opacity-70' : 'cursor-pointer'}`}
              whileHover={isUpdatingPlan ? undefined : { scale: 1.02 }}
              whileTap={isUpdatingPlan ? undefined : { scale: 0.98 }}
              onClick={() => handlePlanChange('free')}
            >
              {displayedPlan === 'free' && (
                <motion.div
                  className="absolute top-4 right-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                </motion.div>
              )}
              
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Free</h3>
                  <p className="text-2xl font-bold text-gray-900">0€<span className="text-sm font-normal text-gray-600">/mois</span></p>
                </div>
              </div>
              
              <div className="space-y-2 ml-13">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700">150 actions disponibles</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  <span className="text-gray-500">Pas d'ETF</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  <span className="text-gray-500">Pas de Forex</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  <span className="text-gray-500">Pas de Crypto</span>
                </div>
              </div>
            </motion.div>

            {/* Pro Plan */}
            <motion.div
              className={`relative rounded-2xl p-5 border-2 transition-all ${
                displayedPlan === 'pro'
                  ? 'border-purple-500 bg-purple-50/50'
                  : 'border-gray-200 bg-gray-50/50'
              } ${isUpdatingPlan ? 'opacity-70' : 'cursor-pointer'}`}
              whileHover={isUpdatingPlan ? undefined : { scale: 1.02 }}
              whileTap={isUpdatingPlan ? undefined : { scale: 0.98 }}
              onClick={() => handlePlanChange('pro')}
            >
              {displayedPlan === 'pro' && (
                <motion.div
                  className="absolute top-4 right-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                </motion.div>
              )}
              
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Pro</h3>
                  <p className="text-2xl font-bold text-gray-900">27,99€<span className="text-sm font-normal text-gray-600">/mois</span></p>
                </div>
              </div>
              
              <div className="space-y-2 ml-13">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700">Toutes les actions</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700">Tous les ETF</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  <span className="text-gray-500">Pas de Forex</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  <span className="text-gray-500">Pas de Crypto</span>
                </div>
              </div>
              
              {displayedPlan !== 'pro' && (
                <motion.button
                  type="button"
                  className="mt-4 w-full bg-purple-500 text-white py-2.5 rounded-xl font-medium"
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 20px -5px rgb(168 85 247 / 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlanChange('pro');
                  }}
                >
                  S'abonner à Pro
                </motion.button>
              )}
            </motion.div>

            {/* Quant Plan */}
            <motion.div
              className={`relative rounded-2xl p-5 border-2 transition-all overflow-hidden ${
                displayedPlan === 'quant'
                  ? 'border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50'
                  : 'border-gray-200 bg-gray-50/50'
              } ${isUpdatingPlan ? 'opacity-70' : 'cursor-pointer'}`}
              whileHover={isUpdatingPlan ? undefined : { scale: 1.02 }}
              whileTap={isUpdatingPlan ? undefined : { scale: 0.98 }}
              onClick={() => handlePlanChange('quant')}
            >
              {/* Premium badge */}
              <motion.div
                className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              >
                MEILLEUR CHOIX
              </motion.div>

              {displayedPlan === 'quant' && (
                <motion.div
                  className="absolute top-4 left-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                </motion.div>
              )}
              
              <div className="flex items-start gap-3 mb-3 mt-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Quant</h3>
                  <p className="text-2xl font-bold text-gray-900">67,99€<span className="text-sm font-normal text-gray-600">/mois</span></p>
                </div>
              </div>
              
              <div className="space-y-2 ml-13">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700 font-medium">Toutes les actions</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700 font-medium">Tous les ETF</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700 font-medium">Tous les Forex</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                  <span className="text-gray-700 font-medium">Toutes les Crypto</span>
                </div>
              </div>
              
              {displayedPlan !== 'quant' && (
                <motion.button
                  type="button"
                  className="mt-4 w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white py-2.5 rounded-xl font-medium shadow-lg"
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 20px -5px rgb(251 146 60 / 0.5)' }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlanChange('quant');
                  }}
                >
                  S'abonner à Quant
                </motion.button>
              )}
            </motion.div>
          </div>
        </motion.div>

          <motion.a
            href={stripeBillingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 w-full bg-gray-900 text-white py-3 rounded-2xl font-medium flex items-center justify-center"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            Gérer mon abonnement
          </motion.a>
          <br />
          <br />

        {/* CBPR Capital Community */}
        <motion.div 
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-6 mb-6 shadow-lg relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          whileHover={{ scale: 1.02, boxShadow: '0 20px 40px -10px rgb(59 130 246 / 0.4)' }}
        >
          {/* Decorative elements */}
          <motion.div
            className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          <div className="relative z-10">
            <div className="flex items-start gap-4 mb-4">
              <motion.div
                className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <MessageCircle className="w-7 h-7 text-white" />
              </motion.div>
              
              <div className="flex-1">
                <h2 className="font-semibold text-white text-lg tracking-tight mb-1">
                  Rejoignez le Chat CBPR Capital
                </h2>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Participez à notre cercle d'investisseurs exclusif et profitez des analyses 
                  en temps réel de nos analystes les plus chevronnés.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4">
              <ul className="space-y-2 text-sm text-blue-50">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Analyses quotidiennes des marchés</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Échanges avec des investisseurs expérimentés</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Alertes sur les opportunités d'achat</span>
                </li>
              </ul>
            </div>

            {hasWhatsappAccess ? (
              <motion.a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-white text-blue-600 py-3.5 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <MessageCircle className="w-5 h-5" />
                Accéder au chat WhatsApp
              </motion.a>
            ) : (
              <div>
                <motion.button
                  type="button"
                  className="w-full bg-white/80 text-blue-400 py-3.5 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2 cursor-not-allowed"
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  disabled
                >
                  <MessageCircle className="w-5 h-5" />
                  Accès réservé aux abonnés Pro et Quant
                </motion.button>
                <p className="text-xs text-blue-100 mt-3 text-center">
                  Passez à Pro ou Quant pour rejoindre le groupe WhatsApp CBPR Capital.
                </p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          className="bg-white rounded-3xl p-6 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg tracking-tight mb-2">
                Comprendre la méthode CBPR
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Découvrez simplement comment CBPR lit le prix, la tendance, les excès et les zones de réaction du marché.
              </p>
            </div>
          </div>

          <motion.button
            type="button"
            className="mt-4 w-full bg-gray-900 text-white py-3 rounded-2xl font-medium"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            onClick={() => setOpenCbprMethod(true)}
          >
            Ouvrir l’explication CBPR
          </motion.button>
        </motion.div>
        {/* Settings */}
        <motion.div 
          className="bg-white rounded-3xl p-6 mb-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <h2 className="font-semibold text-gray-900 mb-5 text-lg tracking-tight">Paramètres</h2>
          
          <div className="space-y-4">
            <motion.div 
              className="flex items-center justify-between bg-gray-50 rounded-2xl p-4"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="text-gray-900 font-medium">Notifications</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <motion.div 
                  className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"
                  whileTap={{ scale: 0.95 }}
                />
              </label>
            </motion.div>
          </div>
        </motion.div>
        
        {/* Disclaimer */}
        <motion.div 
          className="rounded-3xl p-5 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          whileHover={{ scale: 1.02 }}
        >
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="font-semibold">Avertissement :</strong> CBPR Quant ne fournit pas de conseils d'investissement.
            Les informations présentées sont à titre informatif uniquement. Effectuez vos propres
            recherches avant tout investissement.
          </p>
        </motion.div>

        {/* Logout Button */}
        <motion.button
          className="w-full bg-red-500 text-white py-3.5 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2 mt-6 mb-8"
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          Se déconnecter
        </motion.button>
        <CbprMethode isOpen={openCbprMethod} onClose={() => setOpenCbprMethod(false)} />
      </div>
    </PageTransition>
  );
}
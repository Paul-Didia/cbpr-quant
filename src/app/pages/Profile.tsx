import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Bell, MessageCircle, Check, LogOut, MessagesSquare, KeyRound, Trash2, AlertTriangle, Users, Plus, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { CbprMethode } from '../components/CbprMethode';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import mascotProfile from '../assets/mascotte_profile.svg';


export function Profile() {
  const navigate = useNavigate();
  const { user, logout, resetPassword, deleteAccount } = useAuth();
  const [openCbprMethod, setOpenCbprMethod] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPassword, setGroupPassword] = useState('');
  const [groupJoinId, setGroupJoinId] = useState('');
  const [groupJoinPassword, setGroupJoinPassword] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [groupError, setGroupError] = useState('');
  const [isGroupActionLoading, setIsGroupActionLoading] = useState(false);
  const profileInitial = (user?.name?.trim()?.[0] || user?.email?.trim()?.[0] || 'U').toUpperCase();

  
  const whatsappUrl = 'https://buy.stripe.com/eVqbJ1dBcafK1D06YGasg06';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCreateGroup = async () => {
    const trimmedGroupName = groupName.trim();
    const trimmedGroupPassword = groupPassword.trim();

    if (!trimmedGroupName || !trimmedGroupPassword || isGroupActionLoading) return;

    setGroupMessage('');
    setGroupError('');
    setIsGroupActionLoading(true);

    try {
      await apiService.createGroup(trimmedGroupName, trimmedGroupPassword);

      setGroupName('');
      setGroupPassword('');
      setGroupMessage('Groupe créé avec succès. Vous êtes propriétaire du groupe.');
    } catch (error) {
      console.error('Erreur création groupe:', error);
      setGroupError('Impossible de créer le groupe pour le moment.');
    } finally {
      setIsGroupActionLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    const trimmedGroupId = groupJoinId.trim();
    const trimmedGroupPassword = groupJoinPassword.trim();

    if (!trimmedGroupId || !trimmedGroupPassword || isGroupActionLoading) return;

    setGroupMessage('');
    setGroupError('');
    setIsGroupActionLoading(true);

    try {
      await apiService.joinGroup(trimmedGroupId, trimmedGroupPassword);

      setGroupJoinId('');
      setGroupJoinPassword('');
      setGroupMessage('Groupe rejoint avec succès.');
    } catch (error) {
      console.error('Erreur adhésion groupe:', error);
      setGroupError(error instanceof Error ? error.message : 'Impossible de rejoindre le groupe pour le moment.');
    } finally {
      setIsGroupActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email || isResettingPassword) return;

    setAccountMessage('');
    setAccountError('');
    setIsResettingPassword(true);

    try {
      await resetPassword(user.email);
      setAccountMessage('Email de réinitialisation envoyé. Vérifiez votre boîte mail.');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Impossible d’envoyer l’email de réinitialisation.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'SUPPRIMER' || isDeletingAccount) return;

    setAccountMessage('');
    setAccountError('');
    setIsDeletingAccount(true);

    try {
      await deleteAccount();
      navigate('/');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Impossible de supprimer le compte pour le moment.');
      setIsDeletingAccount(false);
    }
  };
  
  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative text-white">
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/60 hover:text-white"
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

        <motion.div
          className="relative h-28 sm:h-32 mb-[-28px] pointer-events-none z-20"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.5 }}
        >
          <img
            src={mascotProfile}
            alt="CBPR Mascotte Profil"
            className="absolute right-2 sm:right-8 bottom-0 h-36 sm:h-44 w-auto object-contain"
            loading="eager"
          />
        </motion.div>
        
        {/* Profile Info */}
        <motion.div 
          className="relative z-10 bg-[#1E2939] rounded-3xl p-6 mb-6 shadow-sm border border-white/5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-center gap-4 mb-6">
            <motion.div 
              className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-md text-white text-3xl font-bold tracking-tight"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              aria-label="Initiale du profil utilisateur"
            >
              {profileInitial}
            </motion.div>
            <div>
              <div className="mb-2">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide bg-blue-500/15 text-blue-200 border border-blue-400/20">
                  Accès CBPR Quant Pro
                </span>
              </div>
              <div className="font-semibold text-white text-lg tracking-tight">{user?.name || 'Utilisateur'}</div>
              <div className="text-sm text-white/60">Membre depuis {user?.memberSince || 'mars 2026'}</div>
            </div>
          </div>
          
          <div className="space-y-4">
            <motion.div 
              className="flex items-center gap-3 text-white/70 bg-white/5 rounded-2xl p-3 border border-white/5"
              whileHover={{ scale: 1.02 }}
            >
              <Mail className="w-5 h-5" />
              <span>{user?.email || 'utilisateur@example.com'}</span>
            </motion.div>
          </div>
        </motion.div>
        
        {/* Desk Groups */}
        <motion.div
          className="bg-[#1E2939] rounded-3xl p-6 mb-6 shadow-sm border border-white/5 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-start gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 flex items-center justify-center border border-blue-500/20">
              <Users className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg tracking-tight">Desk CBPR</h2>
              <p className="text-sm text-white/60 leading-relaxed">
                Créez ou rejoignez un groupe pour travailler sur un Desk partagé.
              </p>
            </div>
          </div>


          {groupMessage && (
            <div className="mb-4 rounded-2xl bg-green-500/10 text-green-300 text-sm font-medium p-4 border border-green-500/20">
              {groupMessage}
            </div>
          )}

          {groupError && (
            <div className="mb-4 rounded-2xl bg-red-500/10 text-red-300 text-sm font-medium p-4 border border-red-500/20">
              {groupError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-blue-300" />
                <h3 className="font-semibold text-white">Créer un groupe</h3>
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Nom du groupe"
                  className="w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm text-white placeholder:text-white/40"
                />
                <input
                  type="password"
                  value={groupPassword}
                  onChange={(event) => setGroupPassword(event.target.value)}
                  placeholder="Mot de passe du groupe"
                  className="w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm text-white placeholder:text-white/40"
                />
                <motion.button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || !groupPassword.trim() || isGroupActionLoading}
                  className="bg-blue-500 text-white px-5 py-3 rounded-2xl font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={!groupName.trim() || !groupPassword.trim() || isGroupActionLoading ? undefined : { scale: 1.02 }}
                  whileTap={!groupName.trim() || !groupPassword.trim() || isGroupActionLoading ? undefined : { scale: 0.98 }}
                >
                  Créer
                </motion.button>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <LogIn className="w-4 h-4 text-blue-300" />
                <h3 className="font-semibold text-white">Rejoindre un groupe</h3>
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={groupJoinId}
                  onChange={(event) => setGroupJoinId(event.target.value)}
                  placeholder="ID du groupe"
                  className="w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm text-white placeholder:text-white/40"
                />
                <input
                  type="password"
                  value={groupJoinPassword}
                  onChange={(event) => setGroupJoinPassword(event.target.value)}
                  placeholder="Mot de passe du groupe"
                  className="w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm text-white placeholder:text-white/40"
                />
                <motion.button
                  type="button"
                  onClick={handleJoinGroup}
                  disabled={!groupJoinId.trim() || !groupJoinPassword.trim() || isGroupActionLoading}
                  className="bg-[#2D4F87] text-white px-5 py-3 rounded-2xl font-semibold shadow-lg shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={!groupJoinId.trim() || !groupJoinPassword.trim() || isGroupActionLoading ? undefined : { scale: 1.02 }}
                  whileTap={!groupJoinId.trim() || !groupJoinPassword.trim() || isGroupActionLoading ? undefined : { scale: 0.98 }}
                >
                  Rejoindre
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
        
        

        {/* Cercle CBPR Capital */}
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
                  Rejoignez le Cercle CBPR Capital
                </h2>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Intégrez notre cercle d’investisseurs CBPR Capital et accédez à une vision marché structurée, pensée pour les investisseurs qui veulent aller plus loin.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4">
              <ul className="space-y-3 text-lg text-blue-50">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Performance annuelle moyenne observée : +24%</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Accès au cercle privé CBPR Capital</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-200" strokeWidth={2.5} />
                  <span>Adhésion annuelle : 120€</span>
                </li>
              </ul>
            </div>

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
              Rejoindre le Cercle CBPR Capital
            </motion.a>
          </div>
        </motion.div>

        {/* Forum CBPR Capital */}
        <motion.div 
          className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-6 mb-6 shadow-lg relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5 }}
          whileHover={{ scale: 1.02, boxShadow: '0 20px 40px -10px rgb(34 197 94 / 0.4)' }}
        >
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
                <MessagesSquare className="w-7 h-7 text-white" />
              </motion.div>

              <div className="flex-1">
                <h2 className="font-semibold text-white text-lg tracking-tight mb-1">
                  Rejoignez le Forum CBPR Capital
                </h2>
                <p className="text-green-100 text-sm leading-relaxed">
                  Discutez avec la communauté CBPR, obtenez les dernières infos sur l’application, partagez vos retours et échangez sur l’économie et les marchés.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4">
              <ul className="space-y-3 text-lg text-green-50">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-200" strokeWidth={2.5} />
                  <span>Actualités produit CBPR Quant</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-200" strokeWidth={2.5} />
                  <span>Feedbacks & suggestions utilisateurs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-200" strokeWidth={2.5} />
                  <span>Discussions économie & marchés</span>
                </li>
              </ul>
            </div>

            <motion.a
              href="https://chat.whatsapp.com/GlZieFF7sw5G9M525TcVyv?mode=gi_t"
              target="_blank"
              rel="noreferrer"
              className="w-full bg-white text-green-600 py-3.5 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <MessagesSquare className="w-5 h-5" />
              Rejoindre le Forum CBPR Capital
            </motion.a>
          </div>
        </motion.div>

        <motion.div
          className="bg-[#1E2939] rounded-3xl p-6 mb-6 shadow-sm border border-white/5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white text-lg tracking-tight mb-2">
                Comprendre la méthode CBPR
              </h2>
              <p className="text-sm text-white/60 leading-relaxed">
                Découvrez simplement comment CBPR lit le prix, la tendance, les excès et les zones de réaction du marché.
              </p>
            </div>
          </div>

          <motion.button
            type="button"
          className="mt-4 w-full bg-[#2D4F87] text-white py-3 rounded-2xl font-medium shadow-lg shadow-black/10"
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
          className="bg-[#1E2939] rounded-3xl p-6 mb-6 shadow-sm border border-white/5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <h2 className="font-semibold text-white mb-5 text-lg tracking-tight">Paramètres</h2>
          
          <div className="space-y-4">
            <motion.div 
              className="flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/5"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-white/60" />
                <span className="text-white font-medium">Notifications</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <motion.div 
                  className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"
                  whileTap={{ scale: 0.95 }}
                />
              </label>
            </motion.div>

            <motion.button
              type="button"
              onClick={handleResetPassword}
              disabled={isResettingPassword || !user?.email}
              className="w-full flex items-center justify-between bg-white/5 rounded-2xl p-4 text-left border border-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
              whileHover={isResettingPassword ? undefined : { scale: 1.02 }}
              whileTap={isResettingPassword ? undefined : { scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-white/60" />
                <span className="text-white font-medium">Réinitialiser mon mot de passe</span>
              </div>
              <span className="text-sm text-blue-500 font-medium">
                {isResettingPassword ? 'Envoi...' : 'Envoyer'}
              </span>
            </motion.button>

            {accountMessage && (
              <div className="rounded-2xl bg-green-50 text-green-700 text-sm font-medium p-4">
                {accountMessage}
              </div>
            )}

            {accountError && (
              <div className="rounded-2xl bg-red-50 text-red-600 text-sm font-medium p-4">
                {accountError}
              </div>
            )}
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div 
          className="bg-[#1E2939] rounded-3xl p-6 mb-6 shadow-sm border border-red-500/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.5 }}
          whileHover={{ boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-lg tracking-tight">Zone sensible</h2>
              <p className="text-sm text-white/60 leading-relaxed">
                La suppression du compte est définitive. Vos favoris et données liées au profil seront supprimés.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="Tapez SUPPRIMER pour confirmer"
              className="w-full px-4 py-3 bg-white/5 border border-red-500/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all text-sm text-white placeholder:text-white/40"
            />

            <motion.button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== 'SUPPRIMER' || isDeletingAccount}
              className="w-full bg-red-500 text-white py-3 rounded-2xl font-semibold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={deleteConfirmation !== 'SUPPRIMER' || isDeletingAccount ? undefined : { scale: 1.01 }}
              whileTap={deleteConfirmation !== 'SUPPRIMER' || isDeletingAccount ? undefined : { scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Trash2 className="w-5 h-5" />
              {isDeletingAccount ? 'Suppression en cours...' : 'Supprimer mon compte'}
            </motion.button>
          </div>
        </motion.div>
        {/* Disclaimer */}
        <motion.div 
          className="rounded-3xl p-5 bg-gradient-to-br from-yellow-500/15 to-orange-500/10 border border-yellow-500/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          whileHover={{ scale: 1.02 }}
        >
          <p className="text-sm text-white/75 leading-relaxed">
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


import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  LogOut,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  apiService,
  type OrganizationDashboard,
  type OrganizationMember,
} from '../services/api';

const ENTERPRISE_STORAGE_KEY = 'cbpr_enterprise_organization_id';
const ENTERPRISE_DASHBOARD_STORAGE_KEY = 'cbpr_enterprise_dashboard';

function getPlanLabel(plan: string) {
  if (plan === 'trader') return 'Trader';
  if (plan === 'fund') return 'Fund';
  return 'Organisation';
}

function getRoleLabel(role: OrganizationMember['role']) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Membre';
}

export function EnterpriseDashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<OrganizationDashboard | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'admin' | 'member'>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const organizationId = useMemo(
    () => localStorage.getItem(ENTERPRISE_STORAGE_KEY) || '',
    [],
  );

  const usageRatio = dashboard?.max_users
    ? Math.min(100, Math.round((dashboard.used_users / dashboard.max_users) * 100))
    : 0;

  const seatsLabel = dashboard?.max_users && dashboard.max_users >= 999999
    ? `${dashboard.used_users} / Illimité`
    : `${dashboard?.used_users || 0} / ${dashboard?.max_users || 0}`;

  useEffect(() => {
    if (!organizationId) {
      navigate('/enterprise-login');
      return;
    }

    const cachedDashboard = localStorage.getItem(ENTERPRISE_DASHBOARD_STORAGE_KEY);

    if (!cachedDashboard) {
      setError('Session entreprise introuvable. Reconnectez-vous.');
      return;
    }

    try {
      setDashboard(JSON.parse(cachedDashboard));
    } catch (error) {
      console.error('Enterprise cached dashboard parse error:', error);
      setError('Session entreprise invalide. Reconnectez-vous.');
    }
  }, [navigate, organizationId]);

  const handleLogout = () => {
    localStorage.removeItem(ENTERPRISE_STORAGE_KEY);
    localStorage.removeItem(ENTERPRISE_DASHBOARD_STORAGE_KEY);
    navigate('/enterprise-login');
  };

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();

    const safeEmail = memberEmail.trim().toLowerCase();

    if (!dashboard || !safeEmail || isAddingMember) return;

    setIsAddingMember(true);
    setError('');
    setMessage('');

    try {
      const newMember = await apiService.addOrganizationMember(
        dashboard.organization.id,
        safeEmail,
        memberRole,
      );

      setDashboard((previousDashboard) => {
        if (!previousDashboard) return previousDashboard;

        const withoutDuplicate = previousDashboard.members.filter(
          (member) => member.id !== newMember.id && member.email !== newMember.email,
        );

        const nextMembers = [...withoutDuplicate, newMember];

        const nextDashboard = {
          ...previousDashboard,
          members: nextMembers,
          used_users: nextMembers.length,
        };

        localStorage.setItem(ENTERPRISE_DASHBOARD_STORAGE_KEY, JSON.stringify(nextDashboard));

        return nextDashboard;
      });

      setMemberEmail('');
      setMemberRole('member');
      setMessage('Membre ajouté à l’organisation.');
    } catch (error) {
      console.error('Enterprise add member error:', error);
      setError('Impossible d’ajouter ce membre. Vérifiez la limite du plan.');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (!dashboard || member.role === 'owner') return;

    setError('');
    setMessage('');

    try {
      await apiService.removeOrganizationMember(dashboard.organization.id, member.id);

      setDashboard((previousDashboard) => {
        if (!previousDashboard) return previousDashboard;

        const nextMembers = previousDashboard.members.filter(
          (currentMember) => currentMember.id !== member.id,
        );

        const nextDashboard = {
          ...previousDashboard,
          members: nextMembers,
          used_users: nextMembers.length,
        };

        localStorage.setItem(ENTERPRISE_DASHBOARD_STORAGE_KEY, JSON.stringify(nextDashboard));

        return nextDashboard;
      });

      setMessage('Membre supprimé de l’organisation.');
    } catch (error) {
      console.error('Enterprise remove member error:', error);
      setError('Impossible de supprimer ce membre.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-400/20">
              <Building2 className="w-6 h-6 text-blue-300" />
            </div>

            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Dashboard Entreprise
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Gestion des accès CBPR Quant Pro.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-sm text-slate-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Quitter
          </button>
        </motion.div>

        {isLoading && (
          <div className="rounded-3xl bg-[#1E2939] border border-white/10 p-8 text-center text-slate-400">
            Chargement du dashboard...
          </div>
        )}

        {!isLoading && error && (
          <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!isLoading && message && (
          <div className="mb-6 rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-300">
            {message}
          </div>
        )}

        {!isLoading && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.div
                className="rounded-3xl bg-[#1E2939] border border-white/10 p-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <div className="flex items-center gap-2 text-blue-300 mb-3">
                  <Building2 className="w-5 h-5" />
                  <span className="font-semibold">Organisation</span>
                </div>
                <div className="text-2xl font-semibold">
                  {dashboard.organization.name}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Créée le {new Date(dashboard.organization.created_at).toLocaleDateString('fr-FR')}
                </p>
              </motion.div>

              <motion.div
                className="rounded-3xl bg-[#1E2939] border border-white/10 p-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center gap-2 text-emerald-300 mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Plan</span>
                </div>
                <div className="text-2xl font-semibold">
                  {getPlanLabel(dashboard.organization.subscription_plan)}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  {dashboard.organization.subscription_active ? 'Abonnement actif' : 'Abonnement inactif'}
                </p>
              </motion.div>

              <motion.div
                className="rounded-3xl bg-[#1E2939] border border-white/10 p-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <div className="flex items-center gap-2 text-violet-300 mb-3">
                  <Users className="w-5 h-5" />
                  <span className="font-semibold">Seats</span>
                </div>
                <div className="text-2xl font-semibold">
                  {seatsLabel}
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${dashboard.max_users >= 999999 ? 100 : usageRatio}%` }}
                  />
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <motion.div
                className="rounded-3xl bg-[#1E2939] border border-white/10 p-6 lg:col-span-1"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <UserPlus className="w-5 h-5 text-blue-300" />
                  <h2 className="text-lg font-semibold tracking-tight">
                    Ajouter un membre
                  </h2>
                </div>

                <form onSubmit={handleAddMember} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={(event) => setMemberEmail(event.target.value)}
                        placeholder="analyst@fund.com"
                        className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-300 mb-2">
                      Rôle
                    </label>
                    <select
                      value={memberRole}
                      onChange={(event) => setMemberRole(event.target.value as 'admin' | 'member')}
                      className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="member">Membre</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingMember || !memberEmail.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 transition-colors rounded-2xl text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserPlus className="w-4 h-4" />
                    {isAddingMember ? 'Ajout...' : 'Ajouter'}
                  </button>
                </form>
              </motion.div>

              <motion.div
                className="rounded-3xl bg-[#1E2939] border border-white/10 p-6 lg:col-span-2"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-300" />
                    <h2 className="text-lg font-semibold tracking-tight">
                      Membres autorisés
                    </h2>
                  </div>

                  <span className="text-sm text-slate-500">
                    {seatsLabel}
                  </span>
                </div>

                <div className="space-y-3">
                  {dashboard.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] border border-white/5 p-4"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">
                          {member.email}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                          <Shield className="w-3 h-3" />
                          {getRoleLabel(member.role)} · ajouté le {new Date(member.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleRemoveMember(member)}
                        disabled={member.role === 'owner'}
                        className="p-2 rounded-full hover:bg-red-500/10 text-slate-500 hover:text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Supprimer le membre"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {dashboard.members.length === 0 && (
                    <div className="text-center py-10 text-sm text-slate-500">
                      Aucun membre autorisé pour le moment.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
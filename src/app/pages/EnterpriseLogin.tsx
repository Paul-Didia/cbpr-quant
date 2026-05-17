

import { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Building2, Lock, ArrowRight } from 'lucide-react';
import { apiService } from '../services/api';

const ENTERPRISE_STORAGE_KEY = 'cbpr_enterprise_organization_id';
const ENTERPRISE_DASHBOARD_STORAGE_KEY = 'cbpr_enterprise_dashboard';

export function EnterpriseLogin() {
  const navigate = useNavigate();

  const [organizationName, setOrganizationName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    const safeName = organizationName.trim();
    const safePassword = password.trim();

    if (!safeName || !safePassword) {
      setError('Nom organisation et mot de passe requis.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const dashboard = await apiService.enterpriseLogin(safeName, safePassword);

      localStorage.setItem(
        ENTERPRISE_STORAGE_KEY,
        dashboard.organization.id,
      );
      localStorage.setItem(
        ENTERPRISE_DASHBOARD_STORAGE_KEY,
        JSON.stringify(dashboard),
      );

      navigate('/enterprise-dashboard');
    } catch (error) {
      console.error('Enterprise login error:', error);
      setError('Connexion entreprise impossible.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center px-4 py-10">
      <motion.div
        className="w-full max-w-md bg-[#1E2939] border border-white/10 rounded-3xl p-8 shadow-2xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-400/20">
            <Building2 className="w-6 h-6 text-blue-300" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              CBPR Quant Pro
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Accès organisation entreprise
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Organisation
            </label>

            <input
              type="text"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="CBPR Capital"
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Mot de passe entreprise
            </label>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 transition-colors rounded-2xl text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              'Connexion...'
            ) : (
              <>
                Accéder au dashboard
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
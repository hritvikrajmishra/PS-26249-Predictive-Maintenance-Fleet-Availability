import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ShieldAlert, User, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/api';

export const LoginPage: React.FC = () => {
  const { login, switchDemoRole } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('commander');
  const [password, setPassword] = useState('commander123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    setError(null);
    setLoading(true);
    try {
      await switchDemoRole(role);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white font-mono">
      {/* Top Banner */}
      <div className="max-w-md w-full mb-6 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center space-x-2 text-xs text-amber-300">
        <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
        <span>[SYNTHETIC DATA ONLY] — Simulated Decision-Support Platform</span>
      </div>

      <div className="max-w-md w-full bg-[#0e1629] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/40 items-center justify-center text-blue-400 mb-1">
            <Activity className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">
            AeroPulse Cockpit
          </h1>
          <p className="text-xs text-slate-400">
            Integrated Predictive Maintenance & Fleet Availability (PS 26249)
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-600/40 rounded-lg text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="commander / planner / technician"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition shadow-lg shadow-blue-900/30"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Logins */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider text-center">
            Quick 1-Click Demo Profiles
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => handleQuickLogin('commander')}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-cyan-300 font-semibold text-center transition"
            >
              Commander
            </button>
            <button
              onClick={() => handleQuickLogin('planner')}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-blue-300 font-semibold text-center transition"
            >
              Planner
            </button>
            <button
              onClick={() => handleQuickLogin('technician')}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-emerald-300 font-semibold text-center transition"
            >
              Technician
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

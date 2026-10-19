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
    <div className="min-h-screen bg-[#F6F6F3] flex flex-col justify-center items-center p-4 selection:bg-[#2F5D8A] selection:text-white font-sans text-[#1A1A1A]">
      {/* Top Banner */}
      <div className="max-w-md w-full mb-4 p-2.5 rounded border border-[#F2D7B3] bg-[#FEF7ED] flex items-center space-x-2 text-xs text-[#8A5314] font-mono">
        <ShieldAlert className="w-4 h-4 text-[#8A5314] flex-shrink-0" />
        <span>[SYNTHETIC DATA ONLY] — Simulated Decision-Support Platform</span>
      </div>

      <div className="max-w-md w-full bg-white border border-[#E3E3DE] rounded-md p-8 shadow-[0_4px_16px_rgba(0,0,0,0.06)] space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-11 w-11 rounded border border-[#E3E3DE] bg-[#F6F6F3] items-center justify-center text-[#2F5D8A] mb-1">
            <Activity className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A] uppercase font-mono">
            AeroPulse Cockpit
          </h1>
          <p className="text-xs text-[#5C5C57]">
            Integrated Predictive Maintenance & Fleet Availability (PS 26249)
          </p>
        </div>

        {error && (
          <div className="p-3 bg-[#FDF2F2] border border-[#F5C2C0] rounded text-xs text-[#B3402F] font-mono">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-[#5C5C57] font-semibold mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-[#8C8C85] absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="commander / planner / technician"
                className="w-full bg-white border border-[#D5D5CF] rounded pl-9 pr-3 py-2 text-[#1A1A1A] placeholder-[#8C8C85] focus:outline-none focus:border-[#2F5D8A] focus:ring-1 focus:ring-[#2F5D8A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#5C5C57] font-semibold mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8C8C85] absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-[#D5D5CF] rounded pl-9 pr-3 py-2 text-[#1A1A1A] placeholder-[#8C8C85] focus:outline-none focus:border-[#2F5D8A] focus:ring-1 focus:ring-[#2F5D8A]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#2F5D8A] hover:bg-[#264A6E] disabled:opacity-50 text-white rounded font-semibold flex items-center justify-center space-x-1.5 transition shadow-sm"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Logins */}
        <div className="pt-4 border-t border-[#E3E3DE] space-y-2">
          <div className="text-[11px] font-semibold text-[#5C5C57] uppercase tracking-wider text-center">
            Quick 1-Click Demo Profiles
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <button
              onClick={() => handleQuickLogin('commander')}
              className="py-1.5 px-2 bg-[#F6F6F3] hover:bg-[#EAEAE7] border border-[#D5D5CF] rounded text-[#1A1A1A] font-semibold text-center transition"
            >
              Commander
            </button>
            <button
              onClick={() => handleQuickLogin('planner')}
              className="py-1.5 px-2 bg-[#F6F6F3] hover:bg-[#EAEAE7] border border-[#D5D5CF] rounded text-[#1A1A1A] font-semibold text-center transition"
            >
              Planner
            </button>
            <button
              onClick={() => handleQuickLogin('technician')}
              className="py-1.5 px-2 bg-[#F6F6F3] hover:bg-[#EAEAE7] border border-[#D5D5CF] rounded text-[#1A1A1A] font-semibold text-center transition"
            >
              Technician
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, User, Lock, ArrowRight, Sparkles, Shield, Wrench, BarChart3, ChevronLeft } from 'lucide-react';
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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFE] text-[#3B1D5E] flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Subtle curved background lines */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <path d="M-100,200 C300,50 600,350 1200,100 C1500,-50 1800,200 2100,50" fill="none" stroke="#C9A2F5" strokeWidth="1.5" />
          <path d="M-50,450 C400,250 800,600 1300,300 C1700,100 1900,450 2200,250" fill="none" stroke="#1DE9C0" strokeWidth="1" />
        </svg>
      </div>

      {/* Back to overview link */}
      <div className="relative z-10 max-w-md w-full mb-4 flex items-center justify-between">
        <Link
          to="/landing"
          className="inline-flex items-center gap-1 text-xs text-[#6B5B84] hover:text-[#3B1D5E] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>
        <span className="text-[10px] text-[#8F7FA8] tracking-wider uppercase font-semibold">
          AEROPULSE PLATFORM
        </span>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 max-w-md w-full bg-white border border-[#E6E2F0] rounded-[20px] p-7 shadow-ap-floating space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-[12px] bg-[#E0F8FA] border border-[#1DE9C0]/50 items-center justify-center text-[#0D6553] shadow-sm mb-1">
            <Activity className="w-6 h-6 text-[#0D6553]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#3B1D5E]">
            AeroPulse Cockpit
          </h1>
          <p className="text-xs text-[#6B5B84]">
            Integrated Predictive Maintenance & Fleet Availability Platform
          </p>
        </div>

        {error && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-[10px] text-xs text-[#DC2626]">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[#6B5B84] mb-1.5 uppercase tracking-wider text-[11px] font-medium">
              Username / Call Sign
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#8F7FA8] absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="commander / planner / technician"
                className="w-full bg-[#F4F2FB] border border-[#E6E2F0] rounded-[10px] pl-9 pr-3 py-2.5 text-[#3B1D5E] placeholder-[#8F7FA8] focus:outline-none focus:border-[#1DE9C0] focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#6B5B84] mb-1.5 uppercase tracking-wider text-[11px] font-medium">
              Password / Access Key
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8F7FA8] absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F4F2FB] border border-[#E6E2F0] rounded-[10px] pl-9 pr-3 py-2.5 text-[#3B1D5E] placeholder-[#8F7FA8] focus:outline-none focus:border-[#1DE9C0] focus:bg-white transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#1DE9C0] hover:bg-[#15d1ac] text-[#1E1035] font-bold rounded-[10px] flex items-center justify-center space-x-2 transition shadow-ap-mint disabled:opacity-50 mt-2"
          >
            <span>{loading ? 'Authenticating...' : 'Enter Command Center'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Logins */}
        <div className="pt-5 border-t border-[#E6E2F0] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#0D6553] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> 1-Click Role Access
            </span>
            <span className="text-[10px] text-[#8F7FA8]">Instant Session</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => handleQuickLogin('commander')}
              disabled={loading}
              className="py-2.5 px-2 bg-[#F4F2FB] hover:bg-white border border-[#E6E2F0] hover:border-[#1DE9C0] rounded-[10px] text-[#3B1D5E] font-medium flex flex-col items-center justify-center gap-1 transition shadow-sm group"
            >
              <Shield className="w-4 h-4 text-[#0D6553] group-hover:scale-110 transition-transform" />
              <span className="text-[11px]">Commander</span>
              <span className="text-[9px] text-[#8F7FA8]">Full Fleet Ops</span>
            </button>

            <button
              onClick={() => handleQuickLogin('planner')}
              disabled={loading}
              className="py-2.5 px-2 bg-[#F4F2FB] hover:bg-white border border-[#E6E2F0] hover:border-[#1DE9C0] rounded-[10px] text-[#3B1D5E] font-medium flex flex-col items-center justify-center gap-1 transition shadow-sm group"
            >
              <BarChart3 className="w-4 h-4 text-[#0D6553] group-hover:scale-110 transition-transform" />
              <span className="text-[11px]">Planner</span>
              <span className="text-[9px] text-[#8F7FA8]">Bays & Sim</span>
            </button>

            <button
              onClick={() => handleQuickLogin('technician')}
              disabled={loading}
              className="py-2.5 px-2 bg-[#F4F2FB] hover:bg-white border border-[#E6E2F0] hover:border-[#1DE9C0] rounded-[10px] text-[#3B1D5E] font-medium flex flex-col items-center justify-center gap-1 transition shadow-sm group"
            >
              <Wrench className="w-4 h-4 text-[#0D6553] group-hover:scale-110 transition-transform" />
              <span className="text-[11px]">Technician</span>
              <span className="text-[9px] text-[#8F7FA8]">Work Orders</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center pt-1 text-[11px] text-[#8F7FA8]">
          AeroPulse Platform • Intelligent Fleet Availability
        </div>
      </div>
    </div>
  );
};

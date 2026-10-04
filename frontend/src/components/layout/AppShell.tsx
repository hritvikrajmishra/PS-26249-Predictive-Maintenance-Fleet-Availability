import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Plane,
  Cpu,
  AlertTriangle,
  CalendarDays,
  Package,
  Sliders,
  LogOut,
  Bell,
  CheckCircle2,
  X,
  Menu,
} from 'lucide-react';
import { SyntheticNotice } from './SyntheticNotice';
import { TimeReplayControl } from '../common/TimeReplayControl';
import { useAuth } from '../../hooks/useAuth';
import { useAlerts, useAckAlert } from '../../hooks/useEngineQueries';
import { useFleetSummary } from '../../hooks/useAvailabilityQueries';
import type { UserRole } from '../../types/api';

export const AppShell: React.FC = () => {
  const { user, role, logout, switchDemoRole, asOfDate } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const { data: alertsData } = useAlerts({ acknowledged: false, page_size: 10 });
  const { data: summary } = useFleetSummary(asOfDate);
  const ackMutation = useAckAlert();

  const unackAlerts = alertsData?.items || [];
  const p1Count = summary?.open_p1 || 0;
  const p2Count = summary?.open_p2 || 0;

  const handleRoleChange = async (newRole: UserRole) => {
    await switchDemoRole(newRole);
  };

  const navItems = [
    { to: '/dashboard', label: 'Fleet Dashboard', icon: <Activity className="w-4 h-4" /> },
    { to: '/aircraft', label: 'Aircraft Detail & Twin', icon: <Plane className="w-4 h-4" /> },
    { to: '/components', label: 'Component Health', icon: <Cpu className="w-4 h-4" /> },
    {
      to: '/advisories',
      label: 'Predictive Queue',
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: p1Count + p2Count > 0 ? `${p1Count + p2Count}` : undefined,
      badgeColor: p1Count > 0 ? 'bg-rose-600' : 'bg-amber-600',
    },
    { to: '/planning', label: 'Planning & Work Orders', icon: <CalendarDays className="w-4 h-4" /> },
    { to: '/spares', label: 'Spares Inventory', icon: <Package className="w-4 h-4" /> },
    { to: '/scenarios', label: 'Scenario Simulator', icon: <Sliders className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Mandatory Top Notice: Synthetic Data Only */}
      <SyntheticNotice />

      {/* 2. Top Header Navigation Bar */}
      <header className="w-full bg-[#0a0f1d]/90 border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer select-none"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider font-mono text-white flex items-center gap-1.5">
                <span>AeroPulse</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-300 border border-blue-600/40 font-mono">
                  PS-26249
                </span>
              </div>
              <div className="text-[10px] text-slate-400 hidden sm:block font-mono">
                Predictive Maintenance & Fleet Availability Platform
              </div>
            </div>
          </div>
        </div>

        {/* Global Controls: As-Of Time-Replay Bar & Alert Bell & User Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-xs font-mono">
          <TimeReplayControl />

          {/* Active Alerts Bell */}
          <div className="relative">
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 relative"
              title="Active platform alerts"
            >
              <Bell className="w-4 h-4" />
              {unackAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold animate-pulse">
                  {unackAlerts.length}
                </span>
              )}
            </button>

            {/* Alerts Dropdown Modal */}
            {alertsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0e1629] border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-200">
                    Active Operational Alerts ({unackAlerts.length})
                  </span>
                  <button onClick={() => setAlertsOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                  {unackAlerts.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-500">No active alerts pending.</div>
                  ) : (
                    unackAlerts.map((a) => (
                      <div
                        key={a.alert_id}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              a.severity === 'critical'
                                ? 'bg-rose-950 text-rose-300 border border-rose-600/40'
                                : 'bg-amber-950 text-amber-300 border border-amber-600/40'
                            }`}
                          >
                            {a.severity} • {a.type}
                          </span>
                          <button
                            onClick={() => ackMutation.mutate({ id: a.alert_id, ack: true })}
                            className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Ack
                          </button>
                        </div>
                        <p className="text-slate-200 text-[11px] leading-tight">{a.message}</p>
                        <div className="text-[10px] text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Role Switcher & User Profile */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
            <span className="hidden md:inline text-[11px] text-slate-400">Role:</span>
            <select
              value={role || 'commander'}
              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              className="bg-slate-900 border border-slate-700 text-cyan-300 font-semibold text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer uppercase font-mono"
            >
              <option value="commander">Commander</option>
              <option value="planner">Planner</option>
              <option value="technician">Technician</option>
            </select>

            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded transition"
              title={`Sign out (${user?.username || 'demo'})`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Main Workspace Layout: Sidebar + Page Outlet */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar Navigation */}
        <aside
          className={`w-full md:w-60 bg-[#080d1a] border-r border-slate-800/80 flex flex-col justify-between py-4 px-3 flex-shrink-0 ${
            mobileMenuOpen ? 'block' : 'hidden md:flex'
          }`}
        >
          <div className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Mission Modules
            </div>

            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-white border border-blue-500/40 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`
                }
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-blue-400">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full text-white ${item.badgeColor || 'bg-blue-600'}`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Sidebar Footer Info */}
          <div className="pt-4 border-t border-slate-800/80 px-3 text-[11px] font-mono text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Fleet Airframes:</span>
              <span className="text-slate-300 font-bold">{summary?.total_aircraft ?? 40}</span>
            </div>
            <div className="flex justify-between">
              <span>Serviceable:</span>
              <span className="text-emerald-400 font-bold">{summary?.serviceable_count ?? '—'}</span>
            </div>
            <div className="text-[10px] text-slate-600 pt-1">Environment: Native Localhost</div>
          </div>
        </aside>

        {/* Content Outlet */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#070b14]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

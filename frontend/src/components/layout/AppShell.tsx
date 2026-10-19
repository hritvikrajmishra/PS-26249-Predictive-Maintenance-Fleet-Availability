import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Bell,
  Check,
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
    { to: '/dashboard', label: 'Fleet Dashboard' },
    { to: '/aircraft', label: 'Aircraft Detail & Twin' },
    { to: '/components', label: 'Component Health' },
    {
      to: '/advisories',
      label: 'Predictive Queue',
      badge: p1Count + p2Count > 0 ? `${p1Count + p2Count}` : undefined,
    },
    { to: '/planning', label: 'Planning & Work Orders' },
    { to: '/spares', label: 'Spares Inventory' },
    { to: '/scenarios', label: 'Scenario Simulator' },
  ];

  return (
    <div className="min-h-screen bg-[#F6F6F3] text-[#1A1A1A] flex flex-col font-sans">
      {/* 1. Mandatory Top Notice: Synthetic Data Only */}
      <SyntheticNotice />

      {/* 2. Top Header Navigation Bar */}
      <header className="w-full bg-white border-b border-[#E3E3DE] px-4 py-2 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded border border-[#E3E3DE] text-[#5C5C57] hover:bg-[#F6F6F3]"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer select-none"
          >
            <div className="h-7 w-7 rounded bg-[#2F5D8A] text-white flex items-center justify-center font-mono font-semibold text-xs">
              AP
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-[#1A1A1A] tracking-tight">
                AeroPulse
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F0F0EC] text-[#5C5C57] border border-[#E3E3DE]">
                PS-26249
              </span>
            </div>
          </div>
        </div>

        {/* Global Controls: As-Of Time-Replay Bar & Alerts & User Role */}
        <div className="flex items-center space-x-2.5 text-xs font-mono">
          <TimeReplayControl />

          {/* Active Alerts Button */}
          <div className="relative">
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="p-1.5 rounded border border-[#E3E3DE] bg-white text-[#5C5C57] hover:bg-[#F6F6F3] hover:text-[#1A1A1A] relative flex items-center gap-1.5"
              title="Active platform alerts"
            >
              <Bell className="w-3.5 h-3.5 text-[#5C5C57]" />
              {unackAlerts.length > 0 && (
                <span className="text-[11px] font-mono font-semibold text-[#B3402F]">
                  {unackAlerts.length}
                </span>
              )}
            </button>

            {/* Alerts Dropdown Modal */}
            {alertsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#E3E3DE] rounded shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-3.5 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
                  <span className="font-semibold text-xs text-[#1A1A1A]">
                    Active Operational Alerts ({unackAlerts.length})
                  </span>
                  <button
                    onClick={() => setAlertsOpen(false)}
                    className="text-[#5C5C57] hover:text-[#1A1A1A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                  {unackAlerts.length === 0 ? (
                    <div className="text-center py-4 text-xs text-[#5C5C57]">No active alerts pending.</div>
                  ) : (
                    unackAlerts.map((a) => {
                      const isCritical = a.severity === 'critical';
                      return (
                        <div
                          key={a.alert_id}
                          className="p-2.5 rounded bg-[#FAFAF8] border border-[#E3E3DE] text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] font-mono">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isCritical ? 'bg-[#B3402F]' : 'bg-[#A66A00]'
                                }`}
                              />
                              <span className="font-semibold text-[#1A1A1A] uppercase">
                                {a.severity} • {a.type}
                              </span>
                            </span>
                            <button
                              onClick={() => ackMutation.mutate({ id: a.alert_id, ack: true })}
                              className="text-[11px] text-[#2F5D8A] hover:underline flex items-center gap-0.5 font-mono"
                            >
                              <Check className="w-3 h-3" /> Ack
                            </button>
                          </div>
                          <p className="text-[#1A1A1A] text-xs leading-snug">{a.message}</p>
                          <div className="text-[11px] text-[#5C5C57] font-mono">
                            {new Date(a.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Role Switcher & User Signout */}
          <div className="flex items-center space-x-2 pl-2 border-l border-[#E3E3DE]">
            <span className="hidden md:inline text-xs font-sans text-[#5C5C57]">Role:</span>
            <select
              value={role || 'commander'}
              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              className="bg-white border border-[#E3E3DE] text-[#1A1A1A] text-xs rounded px-2 py-1 font-sans focus:outline-none focus:border-[#2F5D8A] cursor-pointer"
            >
              <option value="commander">Commander</option>
              <option value="planner">Planner</option>
              <option value="technician">Technician</option>
            </select>

            <button
              onClick={logout}
              className="p-1.5 text-[#5C5C57] hover:text-[#B3402F] hover:bg-[#F6F6F3] rounded transition"
              title={`Sign out (${user?.username || 'demo'})`}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Main Workspace Layout: Flat Gray Sidebar + Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar Navigation */}
        <aside
          className={`w-full md:w-56 bg-[#EFEFEB] border-r border-[#E3E3DE] flex flex-col justify-between py-3 flex-shrink-0 ${
            mobileMenuOpen ? 'block' : 'hidden md:flex'
          }`}
        >
          <div className="space-y-0.5 pt-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-2 text-xs font-sans transition-colors border-l-[3px] ${
                    isActive
                      ? 'border-[#2F5D8A] bg-white text-[#1A1A1A] font-semibold'
                      : 'border-transparent text-[#5C5C57] hover:bg-[#E7E7E3] hover:text-[#1A1A1A]'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#FDF2F0] text-[#B3402F] border border-[#F5C2BC] font-semibold">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Sidebar Footer Info */}
          <div className="pt-3 border-t border-[#E3E3DE] px-4 text-xs font-mono text-[#5C5C57] space-y-1">
            <div className="flex justify-between">
              <span>Fleet Airframes:</span>
              <span className="text-[#1A1A1A] font-semibold">{summary?.total_aircraft ?? 40}</span>
            </div>
            <div className="flex justify-between">
              <span>Serviceable:</span>
              <span className="text-[#2E7D4F] font-semibold">{summary?.serviceable_count ?? '—'}</span>
            </div>
            <div className="text-[11px] text-[#8A8A84] pt-1">Operations Console</div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#F6F6F3]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

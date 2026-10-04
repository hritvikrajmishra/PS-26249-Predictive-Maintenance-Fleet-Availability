import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  change?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate';
  loading?: boolean;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  change,
  icon,
  accent = 'blue',
  loading = false,
  onClick,
}) => {
  const accentBorders = {
    blue: 'hover:border-blue-500/50 border-slate-800',
    emerald: 'hover:border-emerald-500/50 border-slate-800',
    amber: 'hover:border-amber-500/50 border-slate-800',
    rose: 'hover:border-rose-500/50 border-slate-800',
    cyan: 'hover:border-cyan-500/50 border-slate-800',
    slate: 'hover:border-slate-600 border-slate-800',
  };

  const accentIcons = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    slate: 'bg-slate-700/20 text-slate-300 border-slate-600/30',
  };

  if (loading) {
    return (
      <div className="bg-[#0e1526]/80 border border-slate-800/80 rounded-xl p-5 shadow-lg animate-pulse space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-3.5 bg-slate-800 rounded w-24" />
          <div className="h-8 w-8 bg-slate-800 rounded-lg" />
        </div>
        <div className="h-7 bg-slate-800 rounded w-28" />
        <div className="h-3 bg-slate-800/60 rounded w-36" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-[#0e1526]/90 border ${accentBorders[accent]} rounded-xl p-5 shadow-lg transition-all duration-200 relative overflow-hidden backdrop-blur-sm ${
        onClick ? 'cursor-pointer hover:shadow-cyan-900/10 hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
          {title}
        </span>
        {icon && (
          <div className={`p-2 rounded-lg border flex items-center justify-center ${accentIcons[accent]}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline space-x-1.5 mt-1">
        <span className="text-2xl lg:text-3xl font-bold font-mono text-white tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400 font-mono font-medium">{unit}</span>}
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/60 text-xs">
        {subtitle && <span className="text-slate-400 truncate">{subtitle}</span>}
        {change && (
          <span
            className={`font-mono font-medium text-[11px] ${
              change.isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {change.isPositive ? '▲' : '▼'} {change.value} {change.label && `(${change.label})`}
          </span>
        )}
      </div>
    </div>
  );
};

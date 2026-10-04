import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';

  if (norm.includes('available') || norm === 'serviceable' || norm === 'ok' || norm === 'completed' || norm === 'accepted') {
    colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
  } else if (norm.includes('scheduled') || norm === 'watch' || norm === 'in_stock') {
    colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-500/40';
  } else if (
    norm.includes('unscheduled') ||
    norm.includes('repair') ||
    norm === 'high' ||
    norm === 'p2' ||
    norm === 'low_stock' ||
    norm === 'degraded' ||
    norm === 'at risk'
  ) {
    colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-500/40';
  } else if (
    norm.includes('spares') ||
    norm.includes('workshop') ||
    norm.includes('agency') ||
    norm === 'critical' ||
    norm === 'p1' ||
    norm === 'out_of_stock' ||
    norm === 'short' ||
    norm === 'failed'
  ) {
    colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-500/40';
  } else if (norm === 'p3') {
    colorClasses = 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40';
  } else if (norm === 'p4' || norm === 'dismissed' || norm === 'low') {
    colorClasses = 'bg-slate-800/80 text-slate-400 border-slate-700';
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px]'
      : size === 'lg'
      ? 'px-3 py-1 text-sm font-semibold'
      : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium font-mono rounded border uppercase tracking-wider ${sizeClasses} ${colorClasses} ${className}`}
    >
      {status}
    </span>
  );
};

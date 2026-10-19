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
  loading = false,
  onClick,
}) => {
  if (loading) {
    return (
      <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-2">
        <div className="h-3 bg-[#EAEAE7] rounded w-24 animate-pulse" />
        <div className="h-7 bg-[#EAEAE7] rounded w-28 animate-pulse" />
        <div className="h-3 bg-[#EAEAE7] rounded w-36 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#E3E3DE] rounded p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:border-[#2F5D8A] hover:bg-[#FAFAF8]' : ''
      }`}
    >
      <div className="text-[11px] font-sans text-[#5C5C57] font-semibold truncate">
        {title}
      </div>

      <div className="flex items-baseline space-x-1 mt-1.5">
        <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs text-[#5C5C57]">{unit}</span>}
      </div>

      {(subtitle || change) && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#ECECE8] text-xs">
          {subtitle && <span className="text-[#5C5C57] text-[11px] truncate">{subtitle}</span>}
          {change && (
            <span
              className={`font-mono text-[11px] font-medium ml-auto ${
                change.isPositive ? 'text-[#2E7D4F]' : 'text-[#B3402F]'
              }`}
            >
              {change.isPositive ? '↑' : '↓'} {change.value} {change.label && `(${change.label})`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  let dotColor = 'bg-[#7A7A75]';
  let textColor = 'text-[#5C5C57]';
  let bgColor = 'bg-[#F1F1ED]';
  let borderColor = 'border-[#D4D4CE]';

  if (
    norm.includes('available') ||
    norm === 'serviceable' ||
    norm === 'ok' ||
    norm === 'completed' ||
    norm === 'accepted' ||
    norm === 'healthy' ||
    norm === 'nominal'
  ) {
    dotColor = 'bg-[#2E7D4F]';
    textColor = 'text-[#2E7D4F]';
    bgColor = 'bg-[#EDF6F0]';
    borderColor = 'border-[#BCE1C7]';
  } else if (
    norm.includes('watch') ||
    norm.includes('scheduled') ||
    norm === 'in_stock' ||
    norm === 'p2' ||
    norm === 'high' ||
    norm === 'low_stock' ||
    norm === 'degraded' ||
    norm === 'at risk' ||
    norm === 'at_risk'
  ) {
    dotColor = 'bg-[#A66A00]';
    textColor = 'text-[#A66A00]';
    bgColor = 'bg-[#FEF7EC]';
    borderColor = 'border-[#FAD9A6]';
  } else if (
    norm.includes('unscheduled') ||
    norm.includes('repair') ||
    norm.includes('critical') ||
    norm === 'p1' ||
    norm === 'out_of_stock' ||
    norm === 'short' ||
    norm === 'failed' ||
    norm.includes('spares') ||
    norm.includes('workshop')
  ) {
    dotColor = 'bg-[#B3402F]';
    textColor = 'text-[#B3402F]';
    bgColor = 'bg-[#FDF2F0]';
    borderColor = 'border-[#F5C2BC]';
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px]'
      : size === 'lg'
      ? 'px-2.5 py-1 text-xs font-semibold'
      : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans font-medium rounded border ${sizeClasses} ${bgColor} ${borderColor} ${textColor} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="truncate">{status}</span>
    </span>
  );
};

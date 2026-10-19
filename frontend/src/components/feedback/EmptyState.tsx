import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Records Found',
  message = 'There is currently no telemetry, advisory, or log data matching the selected criteria.',
  icon,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white border border-[#E3E3DE] rounded my-3">
      <div className="p-2.5 bg-[#FAFAF8] text-[#5C5C57] rounded-full mb-2.5 border border-[#E3E3DE]">
        {icon || <Inbox className="w-5 h-5 text-[#5C5C57]" />}
      </div>
      <h3 className="text-xs font-semibold text-[#1A1A1A] uppercase tracking-wider font-mono">{title}</h3>
      <p className="text-xs text-[#5C5C57] mt-1 max-w-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-mono font-medium transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

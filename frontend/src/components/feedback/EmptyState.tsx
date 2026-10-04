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
    <div className="flex flex-col items-center justify-center p-8 text-center bg-[#0a0f1d]/50 border border-dashed border-slate-800 rounded-xl my-4">
      <div className="p-3 bg-slate-800/40 text-slate-400 rounded-full mb-3 border border-slate-700/50">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">{title}</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono font-medium transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

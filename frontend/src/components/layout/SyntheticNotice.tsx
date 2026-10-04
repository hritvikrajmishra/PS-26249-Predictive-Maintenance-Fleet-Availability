import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const SyntheticNotice: React.FC = () => {
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/25 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-amber-300 select-none z-50">
      <div className="flex items-center space-x-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
        <span className="font-semibold uppercase tracking-wider">
          [SYNTHETIC DATA ONLY] — Defence Maintenance Decision-Support Simulation
        </span>
      </div>
      <div className="hidden sm:flex items-center space-x-4 text-amber-400/80 text-[11px]">
        <span>PS 26249</span>
        <span>•</span>
        <span>Generic Fleet Telemetry</span>
        <span>•</span>
        <span>Zero Real Aircraft/Operational Data</span>
      </div>
    </div>
  );
};

import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const SyntheticNotice: React.FC = () => {
  return (
    <div className="w-full bg-[#FEF7ED] border-b border-[#F2D7B3] px-4 py-1.5 flex items-center justify-between text-xs font-mono text-[#8C5300] select-none z-50">
      <div className="flex items-center space-x-2">
        <ShieldAlert className="w-3.5 h-3.5 text-[#A66A00] flex-shrink-0" />
        <span className="font-semibold uppercase tracking-wider text-[11px]">
          [SYNTHETIC DATA ONLY] — Defence Maintenance Decision-Support Simulation
        </span>
      </div>
      <div className="hidden sm:flex items-center space-x-3 text-[#A66A00]/90 text-[11px]">
        <span>PS 26249</span>
        <span className="text-[#C49766]">•</span>
        <span>Generic Fleet Telemetry</span>
        <span className="text-[#C49766]">•</span>
        <span>Zero Real Aircraft/Operational Data</span>
      </div>
    </div>
  );
};

import React from 'react';

export const SyntheticNotice: React.FC = () => {
  return (
    <div className="w-full bg-[#F4F4F1] border-b border-[#E3E3DE] px-4 py-1 flex items-center justify-between text-[11px] font-sans text-[#7A7A75] select-none z-50">
      <div className="flex items-center space-x-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A66A00] shrink-0" />
        <span>Synthetic telemetry demonstration — decision support only, no operational or real aircraft data.</span>
      </div>
      <div className="hidden md:flex items-center space-x-2 text-[10px] font-mono text-[#8A8A84]">
        <span>PS-26249</span>
      </div>
    </div>
  );
};

import React from 'react';

export interface SystemStatusInfo {
  name: string;
  healthIndex: number;
  status: string;
  driverComponent?: string;
}

interface SvgSchematicProps {
  systems: SystemStatusInfo[];
  selectedSystem?: string | null;
  onSelectSystem?: (systemName: string) => void;
}

export const SvgSchematic: React.FC<SvgSchematicProps> = ({
  systems,
  selectedSystem,
  onSelectSystem,
}) => {
  const getSystemColor = (name: string) => {
    const s = systems.find((sys) => sys.name.toLowerCase().includes(name.toLowerCase()));
    if (!s) return { fill: '#1e293b', stroke: '#475569', hi: 100 };
    if (s.healthIndex >= 75) return { fill: 'rgba(16, 185, 129, 0.25)', stroke: '#10b981', hi: s.healthIndex };
    if (s.healthIndex >= 50) return { fill: 'rgba(245, 158, 11, 0.35)', stroke: '#f59e0b', hi: s.healthIndex };
    return { fill: 'rgba(244, 63, 94, 0.45)', stroke: '#f43f5e', hi: s.healthIndex };
  };

  const systemsMap = [
    { key: 'Avionics', label: 'Avionics', x: 260, y: 55, r: 24 },
    { key: 'Propulsion', label: 'Propulsion', x: 190, y: 220, r: 28 },
    { key: 'Hydraulics', label: 'Hydraulics', x: 330, y: 220, r: 28 },
    { key: 'Fuel', label: 'Fuel System', x: 120, y: 250, r: 24 },
    { key: 'Environmental', label: 'ECS (Cooling)', x: 260, y: 160, r: 24 },
    { key: 'Electrical', label: 'Electrical', x: 260, y: 280, r: 24 },
    { key: 'Landing gear', label: 'Landing Gear', x: 260, y: 350, r: 24 },
  ];

  return (
    <div className="w-full flex flex-col items-center bg-[#0a0f1d] border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
      <div className="w-full flex items-center justify-between mb-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-slate-200">
            Subsystem Health Telemetry Schematic
          </h4>
          <p className="text-[11px] text-slate-400">
            Interactive multi-system topological airframe overlay
          </p>
        </div>
        <div className="flex items-center space-x-3 text-[10px] font-mono">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1" /> Nominal
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1" /> Degraded
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1" /> Critical
          </span>
        </div>
      </div>

      <div className="relative w-full max-w-[520px] aspect-[520/420]">
        <svg viewBox="0 0 520 420" className="w-full h-full select-none">
          {/* Subtle Grid Background */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#172033" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="520" height="420" fill="url(#grid)" />

          {/* Aircraft Silhouette Outline (Generic Delta-Wing Fighter/Trainer Jet) */}
          <path
            d="M 260 25
               C 264 45, 270 90, 272 130
               L 395 240
               L 405 255
               L 330 260
               L 282 250
               L 285 360
               L 325 385
               L 320 395
               L 260 388
               L 200 395
               L 195 385
               L 235 360
               L 238 250
               L 190 260
               L 115 255
               L 125 240
               L 248 130
               C 250 90, 256 45, 260 25 Z"
            fill="#0f172a"
            stroke="#334155"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Internal Structure Lines */}
          <line x1="260" y1="35" x2="260" y2="385" stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="190" y1="220" x2="330" y2="220" stroke="#1e293b" strokeDasharray="2 2" />

          {/* Subsystem Interactive Nodes */}
          {systemsMap.map((node) => {
            const style = getSystemColor(node.key);
            const isSelected = selectedSystem && selectedSystem.toLowerCase().includes(node.key.toLowerCase());

            return (
              <g
                key={node.key}
                onClick={() => onSelectSystem && onSelectSystem(node.label)}
                className="cursor-pointer group"
              >
                {/* Node Target Circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? node.r + 4 : node.r}
                  fill={style.fill}
                  stroke={isSelected ? '#38bdf8' : style.stroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  className="transition-all duration-200 group-hover:stroke-blue-400"
                />

                {/* Pulsing indicator if degraded/critical */}
                {style.hi < 75 && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 6}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth="1"
                    opacity="0.6"
                    className="animate-ping"
                  />
                )}

                {/* Score in circle */}
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {Math.round(style.hi)}
                </text>

                {/* System label */}
                <text
                  x={node.x}
                  y={node.y + node.r + 14}
                  textAnchor="middle"
                  fill={isSelected ? '#38bdf8' : '#cbd5e1'}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  className="group-hover:fill-blue-300"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

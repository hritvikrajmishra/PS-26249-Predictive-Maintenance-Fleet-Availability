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
  hoveredSystem?: string | null;
  onHoverSystem?: (systemName: string | null) => void;
}

export const SvgSchematic: React.FC<SvgSchematicProps> = ({
  systems,
  selectedSystem,
  onSelectSystem,
  hoveredSystem,
  onHoverSystem,
}) => {
  const getSystemColor = (name: string) => {
    const s = systems.find((sys) => sys.name.toLowerCase().includes(name.toLowerCase()));
    if (!s) return { fill: '#F1F1ED', stroke: '#7A7A75', text: '#5C5C57', hi: 100 };
    if (s.healthIndex >= 75) return { fill: '#EDF6F0', stroke: '#2E7D4F', text: '#2E7D4F', hi: s.healthIndex };
    if (s.healthIndex >= 50) return { fill: '#FEF7EC', stroke: '#A66A00', text: '#A66A00', hi: s.healthIndex };
    return { fill: '#FDF2F0', stroke: '#B3402F', text: '#B3402F', hi: s.healthIndex };
  };

  const systemsMap = [
    { key: 'Avionics', label: 'Avionics', x: 260, y: 55, r: 22 },
    { key: 'Environmental', label: 'ECS (Cooling)', x: 260, y: 145, r: 22 },
    { key: 'Propulsion', label: 'Propulsion', x: 150, y: 215, r: 24 },
    { key: 'Hydraulics', label: 'Hydraulics', x: 370, y: 215, r: 24 },
    { key: 'Electrical', label: 'Electrical', x: 260, y: 245, r: 22 },
    { key: 'Fuel', label: 'Fuel system', x: 105, y: 300, r: 22 },
    { key: 'Landing gear', label: 'Landing gear', x: 260, y: 345, r: 22 },
  ];

  return (
    <div className="w-full flex flex-col items-center bg-white border border-[#E3E3DE] rounded p-4 relative overflow-hidden">
      <div className="w-full flex items-center justify-between mb-2 pb-2 border-b border-[#ECECE8]">
        <div>
          <h4 className="text-xs font-semibold font-sans text-[#1A1A1A]">
            Subsystem telemetry schematic
          </h4>
          <p className="text-[11px] font-sans text-[#5C5C57]">
            Airframe topological subsystem status overlay
          </p>
        </div>
        <div className="flex items-center space-x-3 text-[11px] font-sans text-[#5C5C57]">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#2E7D4F] mr-1" /> Healthy
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#A66A00] mr-1" /> Degraded
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#B3402F] mr-1" /> Critical
          </span>
        </div>
      </div>

      <div className="relative w-full max-w-[520px] aspect-[520/420]">
        <svg viewBox="0 0 520 420" className="w-full h-full select-none">
          {/* Subtle Grid Background */}
          <defs>
            <pattern id="light-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#F0F0EB" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="520" height="420" fill="url(#light-grid)" />

          {/* Aircraft Silhouette Outline (Clean light blueprint style) */}
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
            fill="#F4F4F1"
            stroke="#D3D3CD"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Internal Structure Lines */}
          <line x1="260" y1="35" x2="260" y2="385" stroke="#E3E3DE" strokeDasharray="3 3" />
          <line x1="150" y1="215" x2="370" y2="215" stroke="#E3E3DE" strokeDasharray="2 2" />

          {/* Subsystem Interactive Nodes */}
          {systemsMap.map((node) => {
            const style = getSystemColor(node.key);
            const isSelected = Boolean(
              selectedSystem && selectedSystem.toLowerCase().includes(node.key.toLowerCase())
            );
            const isHovered = Boolean(
              hoveredSystem && hoveredSystem.toLowerCase().includes(node.key.toLowerCase())
            );
            const isActive = isSelected || isHovered;

            return (
              <g
                key={node.key}
                onClick={() => onSelectSystem && onSelectSystem(node.label)}
                onMouseEnter={() => onHoverSystem && onHoverSystem(node.label)}
                onMouseLeave={() => onHoverSystem && onHoverSystem(null)}
                className="cursor-pointer group"
              >
                {/* Highlight Halo when selected or hovered */}
                {isActive && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 5}
                    fill="none"
                    stroke="#2F5D8A"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                    opacity="0.8"
                  />
                )}

                {/* Node Target Circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isActive ? node.r + 2 : node.r}
                  fill={style.fill}
                  stroke={isActive ? '#2F5D8A' : style.stroke}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  className="transition-all duration-150"
                />

                {/* Score in circle */}
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill={isActive ? '#2F5D8A' : style.text}
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="'IBM Plex Mono', monospace"
                  className="tabular-nums select-none"
                >
                  {Math.round(style.hi)}
                </text>

                {/* System label - minimum 12px font */}
                <text
                  x={node.x}
                  y={node.y + node.r + 14}
                  textAnchor="middle"
                  fill={isActive ? '#2F5D8A' : '#1A1A1A'}
                  fontSize="12"
                  fontFamily="'IBM Plex Sans', sans-serif"
                  fontWeight={isActive ? '600' : '500'}
                  className="select-none"
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

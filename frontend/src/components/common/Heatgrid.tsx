import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LoadingSkeleton } from '../feedback/LoadingSkeleton';

export interface HeatgridCell {
  aircraftId: string;
  tailCode: string;
  systemId: string;
  systemName: string;
  healthIndex: number;
  status: string;
  driverComponent?: string;
}

interface HeatgridProps {
  cells: HeatgridCell[];
  onCellClick?: (aircraftId: string, systemId?: string) => void;
  loading?: boolean;
}

const SYSTEMS_ORDER = [
  'Propulsion',
  'Hydraulics',
  'Electrical',
  'Landing gear',
  'Avionics',
  'Fuel',
  'Environmental (ECS)',
];

export const Heatgrid: React.FC<HeatgridProps> = ({ cells, onCellClick, loading = false }) => {
  const [filterQuery, setFilterQuery] = useState('');

  // Extract unique systems and aircraft
  const { systems, aircraftList, matrix } = useMemo(() => {
    const sysSet = new Set<string>();
    const acMap = new Map<string, string>(); // id -> tail
    const cellMap = new Map<string, HeatgridCell>(); // `${ac}_${sys}` -> cell

    cells.forEach((c) => {
      sysSet.add(c.systemName);
      acMap.set(c.aircraftId, c.tailCode);
      cellMap.set(`${c.aircraftId}_${c.systemName}`, c);
    });

    // Sort systems according to standard order if present
    const sortedSystems = Array.from(sysSet).sort((a, b) => {
      const idxA = SYSTEMS_ORDER.indexOf(a);
      const idxB = SYSTEMS_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const sortedAircraft = Array.from(acMap.entries())
      .map(([id, tail]) => ({ id, tail }))
      .sort((a, b) => a.tail.localeCompare(b.tail));

    return {
      systems: sortedSystems,
      aircraftList: sortedAircraft,
      matrix: cellMap,
    };
  }, [cells]);

  const filteredAircraft = useMemo(() => {
    if (!filterQuery) return aircraftList;
    const q = filterQuery.toLowerCase();
    return aircraftList.filter((ac) => ac.tail.toLowerCase().includes(q) || ac.id.toLowerCase().includes(q));
  }, [aircraftList, filterQuery]);

  if (loading) {
    return <LoadingSkeleton rows={8} />;
  }

  const getCellColor = (hi: number | undefined) => {
    if (hi === undefined) return 'bg-[#FAFAF8] border-[#E3E3DE] text-[#8A8A84]';
    if (hi >= 75) return 'bg-[#EDF6F0] border-[#C8E6D3] text-[#2E7D4F] hover:bg-[#DFEFE5]';
    if (hi >= 50) return 'bg-[#FEF7ED] border-[#F8DCB5] text-[#A66A00] hover:bg-[#F9ECD8]';
    return 'bg-[#FDF2F0] border-[#F5C2BC] text-[#B3402F] hover:bg-[#F9DDDA] font-semibold';
  };

  return (
    <div className="w-full flex flex-col space-y-3 bg-white border border-[#E3E3DE] rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ECECE8] pb-3">
        <div>
          <h3 className="text-xs font-semibold text-[#1A1A1A]">
            Aircraft × system health matrix
          </h3>
          <p className="text-[11px] text-[#5C5C57]">
            Click any cell to inspect subsystem telemetry and driver components
          </p>
        </div>

        {/* Legend & Filter */}
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center space-x-2.5 text-[11px] font-sans text-[#5C5C57]">
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#2E7D4F] inline-block mr-1" /> ≥75 (Healthy)
            </span>
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#A66A00] inline-block mr-1" /> 50–74 (Degraded)
            </span>
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#B3402F] inline-block mr-1" /> &lt;50 (Critical)
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#5C5C57] absolute left-2 top-1.5" />
            <input
              type="text"
              placeholder="Filter tail..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-[#FAFAF8] border border-[#E3E3DE] text-[#1A1A1A] text-xs font-mono rounded pl-6 pr-2 py-0.5 w-28 focus:outline-none focus:border-[#2F5D8A]"
            />
          </div>
        </div>
      </div>

      {/* Heatgrid Matrix Table */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
        <table className="w-full border-collapse text-left text-xs font-sans">
          <thead className="sticky top-0 bg-[#FAFAF8] z-10">
            <tr className="border-b border-[#E3E3DE] text-[11px] uppercase tracking-wider text-[#5C5C57] select-none font-sans">
              <th className="py-2 px-3 font-semibold w-24">Airframe</th>
              {systems.map((sys) => (
                <th key={sys} className="py-2 px-2 text-center font-medium truncate max-w-[100px]" title={sys}>
                  {sys.replace('Environmental (ECS)', 'ECS').replace('Landing gear', 'Landing Gear')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECECE8]">
            {filteredAircraft.map((ac) => (
              <tr key={ac.id} className="hover:bg-[#FAFAF8] transition-colors">
                <td
                  onClick={() => onCellClick && onCellClick(ac.id)}
                  className="py-1.5 px-3 font-semibold text-[#1A1A1A] hover:text-[#2F5D8A] cursor-pointer select-none"
                  title={`Inspect ${ac.tail}`}
                >
                  {ac.tail}
                </td>
                {systems.map((sys) => {
                  const cell = matrix.get(`${ac.id}_${sys}`);
                  const hi = cell ? Math.round(cell.healthIndex) : undefined;
                  return (
                    <td key={sys} className="py-1 px-1 text-center">
                      <button
                        onClick={() => onCellClick && onCellClick(ac.id, cell?.systemId)}
                        title={
                          cell
                            ? `${ac.tail} • ${sys}: Health Index ${hi} (${cell.status})${
                                cell.driverComponent ? `\nDriver: ${cell.driverComponent}` : ''
                              }`
                            : `${ac.tail} • ${sys}: No data`
                        }
                        className={`w-full py-0.5 rounded border text-[11px] font-mono font-medium transition-colors ${getCellColor(
                          hi
                        )}`}
                      >
                        {hi !== undefined ? hi : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

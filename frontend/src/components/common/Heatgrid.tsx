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
    if (hi === undefined) return 'bg-slate-800/40 border-slate-800 text-slate-600';
    if (hi >= 75) return 'bg-emerald-950/70 hover:bg-emerald-800/80 border-emerald-500/40 text-emerald-300';
    if (hi >= 50) return 'bg-amber-950/80 hover:bg-amber-700/80 border-amber-500/60 text-amber-300 animate-pulse';
    return 'bg-rose-950/90 hover:bg-rose-700/90 border-rose-500/80 text-rose-200 animate-pulse';
  };

  return (
    <div className="w-full flex flex-col space-y-3 bg-[#0c1220]/80 border border-slate-800 rounded-xl p-4 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
            Aircraft × System Health Heat-Grid
          </h3>
          <p className="text-[11px] text-slate-400">
            Click any cell to inspect airframe telemetry and subsystem components
          </p>
        </div>

        {/* Legend & Filter */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 inline-block mr-1" /> ≥75 (Nominal)
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80 inline-block mr-1" /> 50–74 (Degraded)
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/90 inline-block mr-1" /> &lt;50 (Critical)
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filter tail..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs font-mono rounded pl-7 pr-2 py-1 w-28 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Heatgrid Matrix */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
        <table className="w-full border-collapse text-left text-xs font-mono">
          <thead className="sticky top-0 bg-[#090e1a] z-10">
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 select-none">
              <th className="py-2 px-3 font-semibold w-24">Airframe</th>
              {systems.map((sys) => (
                <th key={sys} className="py-2 px-2 text-center font-medium truncate max-w-[100px]" title={sys}>
                  {sys.replace('Environmental (ECS)', 'ECS').replace('Landing gear', 'Landing Gear')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filteredAircraft.map((ac) => (
              <tr key={ac.id} className="hover:bg-slate-800/30 transition-colors">
                <td
                  onClick={() => onCellClick && onCellClick(ac.id)}
                  className="py-1.5 px-3 font-semibold text-slate-300 hover:text-blue-400 cursor-pointer select-none"
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
                        className={`w-full py-1 rounded border text-[11px] font-semibold transition-all duration-150 ${getCellColor(
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

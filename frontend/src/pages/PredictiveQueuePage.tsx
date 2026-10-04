import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  ArrowRight,
  ShieldAlert,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Package,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { EmptyState } from '../components/feedback/EmptyState';
import { useAuth } from '../hooks/useAuth';
import {
  useAdvisories,
  useUpdateAdvisory,
  useRunEngine,
  usePredictions,
} from '../hooks/useEngineQueries';
import { useSystems, useAircraftList } from '../hooks/useFleetQueries';
import type { EngineRunSummaryOut } from '../types/api';

export const PredictiveQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { role, asOfDate } = useAuth();
  const canAction = role === 'commander' || role === 'planner';

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('proposed');
  const [spareFilter, setSpareFilter] = useState<string>('all');
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [aircraftFilter, setAircraftFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal states
  const [dismissTarget, setDismissTarget] = useState<{ id?: string; bulk?: boolean } | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');
  const [engineModalOpen, setEngineModalOpen] = useState<boolean>(false);
  const [engineAsOf, setEngineAsOf] = useState<string>(asOfDate || '');
  const [engineAircraft, setEngineAircraft] = useState<string>('');
  const [engineResult, setEngineResult] = useState<EngineRunSummaryOut | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Queries & Mutations
  const { data: advisoriesData, isLoading: loadingAdvisories, refetch } = useAdvisories({
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    spare_status: spareFilter !== 'all' ? spareFilter : undefined,
    aircraft_id: aircraftFilter !== 'all' ? aircraftFilter : undefined,
    page: currentPage,
    page_size: pageSize,
  });

  const { data: predictionsData } = usePredictions({ page_size: 200 });
  const { data: systemsData } = useSystems();
  const { data: aircraftData } = useAircraftList({ page_size: 100 });

  const updateMutation = useUpdateAdvisory();
  const runEngineMutation = useRunEngine();

  // Prediction lookup map for fast RUL / risk display
  const predictionsMap = useMemo(() => {
    const map = new Map<string, { risk_14d: number; rul_p50: number }>();
    predictionsData?.items.forEach((p) => {
      map.set(p.component_id, { risk_14d: p.risk_14d, rul_p50: p.rul_p50 });
    });
    return map;
  }, [predictionsData]);

  // Client-side search and system filter
  const items = useMemo(() => {
    if (!advisoriesData?.items) return [];
    let list = advisoriesData.items;

    if (systemFilter !== 'all') {
      list = list.filter((a) => a.system_name?.toLowerCase().includes(systemFilter.toLowerCase()));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.component_name?.toLowerCase().includes(q) ||
          a.component_id.toLowerCase().includes(q) ||
          a.tail_code?.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q)
      );
    }

    return list;
  }, [advisoriesData, systemFilter, searchQuery]);

  // Checkbox multi-select helpers
  const allCurrentSelected = items.length > 0 && items.every((item) => selectedIds.has(item.advisory_id));

  const toggleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      items.forEach((item) => next.add(item.advisory_id));
      setSelectedIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Actions
  const handleSingleAccept = async (id: string) => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({ id, payload: { status: 'accepted' } });
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Accept failed');
    }
  };

  const handleBulkAccept = async () => {
    setActionError(null);
    try {
      for (const id of Array.from(selectedIds)) {
        await updateMutation.mutateAsync({ id, payload: { status: 'accepted' } });
      }
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Bulk accept failed');
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) return;
    setActionError(null);

    try {
      if (dismissTarget?.bulk) {
        for (const id of Array.from(selectedIds)) {
          await updateMutation.mutateAsync({
            id,
            payload: { status: 'dismissed', reason: dismissReason.trim() },
          });
        }
        setSelectedIds(new Set());
      } else if (dismissTarget?.id) {
        await updateMutation.mutateAsync({
          id: dismissTarget.id,
          payload: { status: 'dismissed', reason: dismissReason.trim() },
        });
      }
      setDismissTarget(null);
      setDismissReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Dismissal failed');
    }
  };

  const handleRunEngineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEngineResult(null);
    setActionError(null);

    try {
      const res = await runEngineMutation.mutateAsync({
        as_of_date: engineAsOf || undefined,
        aircraft_id: engineAircraft || undefined,
      });
      setEngineResult(res);
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Scoring engine run failed');
    }
  };

  // Summary counts
  const p1Count = useMemo(() => items.filter((a) => a.priority === 'P1').length, [items]);
  const p2Count = useMemo(() => items.filter((a) => a.priority === 'P2').length, [items]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-rose-600/20 border border-rose-500/40 rounded-xl text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
                Predictive Maintenance Queue
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Priority-ranked risk worklist generated from ML inference, failure rules, and spares stock
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={loadingAdvisories}
            className="p-2 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono transition"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAdvisories ? 'animate-spin' : ''}`} />
          </button>

          {canAction && (
            <button
              onClick={() => {
                setEngineResult(null);
                setEngineModalOpen(true);
              }}
              className="py-1.5 px-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg text-xs font-mono font-semibold flex items-center space-x-1.5 transition shadow-lg shadow-blue-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Trigger Scoring Engine</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-xs font-mono text-rose-200">
          {actionError}
        </div>
      )}

      {/* 2. Queue Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="p-3 bg-slate-900/80 border border-rose-900/40 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-rose-400 uppercase font-bold">P1 Critical Queue</div>
            <div className="text-2xl font-bold text-white mt-0.5">{p1Count}</div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
        </div>

        <div className="p-3 bg-slate-900/80 border border-amber-900/40 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-amber-400 uppercase font-bold">P2 High Queue</div>
            <div className="text-2xl font-bold text-white mt-0.5">{p2Count}</div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Selected Items</div>
            <div className="text-2xl font-bold text-cyan-300 mt-0.5">{selectedIds.size}</div>
          </div>
          <CheckSquare className="w-5 h-5 text-cyan-400" />
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Total In Filter</div>
            <div className="text-2xl font-bold text-slate-200 mt-0.5">{advisoriesData?.total ?? 0}</div>
          </div>
          <Package className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* 3. Filters & Search Strip */}
      <div className="p-4 bg-[#0c1220]/80 border border-slate-800 rounded-xl space-y-3 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1">
              <span className="text-slate-400 text-[11px]">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Priorities</option>
                <option value="P1" className="bg-slate-900 text-white">P1 — Critical Grounding</option>
                <option value="P2" className="bg-slate-900 text-white">P2 — High Urgency</option>
                <option value="P3" className="bg-slate-900 text-white">P3 — Watch Window</option>
                <option value="P4" className="bg-slate-900 text-white">P4 — Routine Deferred</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1">
              <span className="text-slate-400 text-[11px]">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Statuses</option>
                <option value="proposed" className="bg-slate-900 text-white">Proposed (Action Needed)</option>
                <option value="accepted" className="bg-slate-900 text-white">Accepted</option>
                <option value="scheduled" className="bg-slate-900 text-white">Scheduled</option>
                <option value="completed" className="bg-slate-900 text-white">Completed</option>
                <option value="dismissed" className="bg-slate-900 text-white">Dismissed</option>
              </select>
            </div>

            {/* Functional System Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1">
              <span className="text-slate-400 text-[11px]">System:</span>
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Systems</option>
                {systemsData?.map((s) => (
                  <option key={s.system_id} value={s.name} className="bg-slate-900 text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Spare Status Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1">
              <span className="text-slate-400 text-[11px]">Spare:</span>
              <select
                value={spareFilter}
                onChange={(e) => {
                  setSpareFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Stock</option>
                <option value="in_stock" className="bg-slate-900 text-white">In Stock</option>
                <option value="low_stock" className="bg-slate-900 text-white">Low Stock</option>
                <option value="out_of_stock" className="bg-slate-900 text-white">Out of Stock</option>
              </select>
            </div>

            {/* Airframe Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1">
              <span className="text-slate-400 text-[11px]">Airframe:</span>
              <select
                value={aircraftFilter}
                onChange={(e) => {
                  setAircraftFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Fleet</option>
                {aircraftData?.items.map((ac) => (
                  <option key={ac.aircraft_id} value={ac.aircraft_id} className="bg-slate-900 text-white">
                    {ac.tail_code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search component, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-white text-xs font-mono rounded-lg pl-8 pr-3 py-1.5 w-60 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Bulk Action Bar (when selected) */}
        {selectedIds.size > 0 && canAction && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-cyan-300 font-semibold">
              {selectedIds.size} advisories selected for bulk operation
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkAccept}
                disabled={updateMutation.isPending}
                className="py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold flex items-center gap-1 transition"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Accept Selected ({selectedIds.size})
              </button>
              <button
                onClick={() => setDismissTarget({ bulk: true })}
                disabled={updateMutation.isPending}
                className="py-1 px-3 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 rounded font-semibold flex items-center gap-1 transition"
              >
                <XCircle className="w-3.5 h-3.5" /> Dismiss Selected ({selectedIds.size})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Advisories Data Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0c1220]/80 shadow-md">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-[#090e1a]/90 text-slate-400 font-mono uppercase text-[11px] tracking-wider select-none">
              <th className="py-3 px-3 w-10 text-center">
                <button
                  onClick={toggleSelectAll}
                  className="text-slate-400 hover:text-white transition"
                  title="Toggle Select All"
                >
                  {allCurrentSelected ? (
                    <CheckSquare className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3 text-center">Priority</th>
              <th className="py-3 px-4">Airframe</th>
              <th className="py-3 px-4">Component & System</th>
              <th className="py-3 px-4">Recommended Action</th>
              <th className="py-3 px-3 text-right">Risk (14d)</th>
              <th className="py-3 px-3 text-right">RUL (P50)</th>
              <th className="py-3 px-3 text-center">Spare</th>
              <th className="py-3 px-3 text-right">Downtime</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
            {loadingAdvisories ? (
              <tr>
                <td colSpan={11} className="py-8">
                  <LoadingSkeleton rows={6} />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12">
                  <EmptyState
                    title="No Advisories Found"
                    message="No predictive maintenance advisories match the current filter criteria."
                  />
                </td>
              </tr>
            ) : (
              items.map((advisory) => {
                const isSelected = selectedIds.has(advisory.advisory_id);
                const pred = predictionsMap.get(advisory.component_id);
                const riskVal = pred?.risk_14d;
                const rulVal = pred?.rul_p50;

                return (
                  <tr
                    key={advisory.advisory_id}
                    className={`transition-colors duration-150 ${
                      isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => toggleSelectOne(advisory.advisory_id)}
                        className="text-slate-400 hover:text-white transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-3 text-center">
                      <StatusBadge status={advisory.priority} size="sm" />
                    </td>

                    {/* Airframe */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/aircraft?id=${advisory.aircraft_id}`)}
                        className="font-bold text-white hover:text-blue-400 transition"
                      >
                        {advisory.tail_code || advisory.aircraft_id}
                      </button>
                    </td>

                    {/* Component */}
                    <td className="py-3 px-4">
                      <div>
                        <button
                          onClick={() => navigate(`/components/${advisory.component_id}`)}
                          className="font-semibold text-slate-200 hover:text-cyan-300 transition text-left"
                        >
                          {advisory.component_name || advisory.component_id}
                        </button>
                        <div className="text-[10px] text-slate-400">{advisory.system_name}</div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4">
                      <span className="text-amber-300 font-medium flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                        {advisory.action}
                      </span>
                    </td>

                    {/* Risk */}
                    <td className="py-3 px-3 text-right font-bold">
                      <span
                        className={
                          (riskVal ?? 0) >= 0.5
                            ? 'text-rose-400'
                            : (riskVal ?? 0) >= 0.2
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }
                      >
                        {riskVal !== undefined ? `${(riskVal * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>

                    {/* RUL */}
                    <td className="py-3 px-3 text-right font-bold">
                      <span
                        className={
                          (rulVal ?? 99) <= 14
                            ? 'text-rose-400'
                            : (rulVal ?? 99) <= 30
                            ? 'text-amber-400'
                            : 'text-slate-300'
                        }
                      >
                        {rulVal !== undefined ? `${Math.round(rulVal)}d` : '—'}
                      </span>
                    </td>

                    {/* Spare */}
                    <td className="py-3 px-3 text-center">
                      <StatusBadge status={advisory.spare_status || 'in_stock'} size="sm" />
                    </td>

                    {/* Expected Downtime */}
                    <td className="py-3 px-3 text-right text-slate-300">
                      {advisory.expected_downtime_days ? `${advisory.expected_downtime_days}d` : '—'}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      <StatusBadge status={advisory.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {canAction && advisory.status === 'proposed' && (
                          <>
                            <button
                              onClick={() => handleSingleAccept(advisory.advisory_id)}
                              disabled={updateMutation.isPending}
                              className="p-1 px-2 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded border border-emerald-500/40 text-[10px] font-semibold transition"
                              title="Accept Advisory"
                            >
                              Accept
                            </button>

                            <button
                              onClick={() =>
                                navigate(
                                  `/planning?aircraft=${advisory.aircraft_id}&component=${advisory.component_id}&advisory=${advisory.advisory_id}`
                                )
                              }
                              className="p-1 px-2 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded border border-blue-500/40 text-[10px] font-semibold transition"
                              title="Schedule Work Order"
                            >
                              Schedule
                            </button>

                            <button
                              onClick={() => setDismissTarget({ id: advisory.advisory_id })}
                              className="p-1 px-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 rounded text-[10px] transition"
                              title="Dismiss with reason"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => navigate(`/components/${advisory.component_id}`)}
                          className="p-1 px-1.5 text-slate-400 hover:text-cyan-300 transition"
                          title="View Telemetry Evidence"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Pagination Footer */}
      {advisoriesData && advisoriesData.total_pages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs font-mono text-slate-400">
          <div>
            Page <span className="font-semibold text-white">{advisoriesData.page}</span> of{' '}
            <span className="font-semibold text-white">{advisoriesData.total_pages}</span> ({advisoriesData.total}{' '}
            advisories)
          </div>
          <div className="flex space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= advisoriesData.total_pages}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Dismissal Audit Reason Modal */}
      {dismissTarget && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleDismissSubmit}
            className="bg-[#0e1629] border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 font-mono text-xs"
          >
            <div className="flex items-center space-x-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-semibold text-sm uppercase text-white">
                Mandatory Override & Dismissal Justification
              </h3>
            </div>
            <p className="text-slate-300">
              {dismissTarget.bulk
                ? `You are dismissing ${selectedIds.size} selected advisories. An audit justification is required by defense compliance rules:`
                : `You are dismissing advisory #${dismissTarget.id}. Enter an engineering justification:`}
            </p>
            <textarea
              required
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Visual inspection performed; component confirmed nominal with zero play; sensor drift documented."
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDismissTarget(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!dismissReason.trim() || updateMutation.isPending}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-semibold"
              >
                Confirm Dismissal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Batch Scoring Engine Trigger Modal */}
      {engineModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0e1629] border border-slate-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Play className="w-5 h-5 fill-current" />
                <h3 className="font-bold text-sm uppercase text-white">
                  Execute Predictive Maintenance Scoring Engine
                </h3>
              </div>
              <button
                onClick={() => setEngineModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed">
              Triggers the batch scoring engine (`POST /api/v1/engine/run`) to evaluate rolling flight telemetry,
              infer failure risk and RUL models, synthesize prioritization rules, and generate updated advisories.
            </p>

            <form onSubmit={handleRunEngineSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-400 mb-1">Cutoff Reference Date (as_of_date)</label>
                <input
                  type="date"
                  value={engineAsOf}
                  onChange={(e) => setEngineAsOf(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Leave blank to score against latest flight telemetry date.
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Target Airframe (Optional)</label>
                <select
                  value={engineAircraft}
                  onChange={(e) => setEngineAircraft(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="">Full Fleet (All 40 Airframes)</option>
                  {aircraftData?.items.map((ac) => (
                    <option key={ac.aircraft_id} value={ac.aircraft_id}>
                      {ac.tail_code} ({ac.type_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Execution Summary Report */}
              {engineResult && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg space-y-1.5 text-[11px] text-emerald-300">
                  <div className="font-bold flex items-center gap-1.5 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Engine Run Complete ({engineResult.duration_seconds.toFixed(2)}s)
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-slate-300">
                    <div>Components Scored: <strong className="text-white">{engineResult.components_scored}</strong></div>
                    <div>Predictions Logged: <strong className="text-white">{engineResult.predictions_recorded}</strong></div>
                    <div>Advisories Raised: <strong className="text-white">{engineResult.advisories_generated}</strong></div>
                    <div>P1 / P2 Critical: <strong className="text-rose-400">{engineResult.p1_count} / {engineResult.p2_count}</strong></div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEngineModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={runEngineMutation.isPending}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-semibold flex items-center gap-1.5"
                >
                  {runEngineMutation.isPending ? 'Scoring Fleet...' : 'Run Scoring Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Check,
  X,
  ArrowRight,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Queries & Mutations
  const { data: advisoriesData, isLoading: loadingAdvisories, refetch } = useAdvisories({
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    spare_status: spareFilter !== 'all' ? spareFilter : undefined,
    aircraft_id: aircraftFilter !== 'all' ? aircraftFilter : undefined,
    as_of_date: asOfDate || undefined,
    page: currentPage,
    page_size: pageSize,
  });

  const { data: predictionsData } = usePredictions({ page_size: 200, as_of_date: asOfDate || undefined });
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
    setActionSuccess(null);
    setProcessingId(id);
    try {
      await updateMutation.mutateAsync({ id, payload: { status: 'accepted' } });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setActionSuccess(`Advisory ${id} accepted. Maintenance action initiated.`);
      await refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Accept failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkAccept = async () => {
    setActionError(null);
    setActionSuccess(null);
    const count = selectedIds.size;
    try {
      for (const id of Array.from(selectedIds)) {
        await updateMutation.mutateAsync({ id, payload: { status: 'accepted' } });
      }
      setSelectedIds(new Set());
      setActionSuccess(`${count} advisory${count > 1 ? 'ies' : ''} accepted successfully.`);
      await refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Bulk accept failed');
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      if (dismissTarget?.bulk) {
        const count = selectedIds.size;
        for (const id of Array.from(selectedIds)) {
          await updateMutation.mutateAsync({
            id,
            payload: { status: 'dismissed', reason: dismissReason.trim() },
          });
        }
        setSelectedIds(new Set());
        setActionSuccess(`${count} advisory${count > 1 ? 'ies' : ''} dismissed.`);
      } else if (dismissTarget?.id) {
        await updateMutation.mutateAsync({
          id: dismissTarget.id,
          payload: { status: 'dismissed', reason: dismissReason.trim() },
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(dismissTarget.id!);
          return next;
        });
        setActionSuccess(`Advisory ${dismissTarget.id} dismissed.`);
      }
      setDismissTarget(null);
      setDismissReason('');
      await refetch();
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] tracking-tight">
            Predictive maintenance queue
          </h1>
          <p className="text-xs text-[#5C5C57] mt-0.5">
            Priority-ranked risk worklist generated from ML inference, failure rules, and spares stock
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={loadingAdvisories}
            className="p-1.5 bg-white border border-[#E3E3DE] hover:bg-[#F6F6F3] text-[#5C5C57] rounded text-xs font-mono transition"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAdvisories ? 'animate-spin' : ''}`} />
          </button>

          {canAction && (
            <button
              onClick={() => {
                setEngineResult(null);
                setEngineModalOpen(true);
              }}
              className="py-1 px-3 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-mono font-medium flex items-center space-x-1.5 transition"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Trigger Scoring Engine</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-[#FDF2F0] border border-[#F5C2BC] rounded text-xs font-mono text-[#B3402F]">
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-[#EDF6F0] border border-[#BCE1C7] rounded text-xs font-mono text-[#2E7D4F] flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-[#2E7D4F] hover:text-[#256640] ml-2 font-bold"
            title="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Compact Queue Status Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE] text-xs font-mono">
        <div className="p-3.5">
          <div className="text-[11px] text-[#B3402F] uppercase font-semibold">P1 Critical Queue</div>
          <div className="text-xl font-semibold text-[#1A1A1A] mt-0.5 tabular-nums">{p1Count}</div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-[#A66A00] uppercase font-semibold">P2 High Queue</div>
          <div className="text-xl font-semibold text-[#1A1A1A] mt-0.5 tabular-nums">{p2Count}</div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-[#5C5C57] uppercase font-semibold">Selected Items</div>
          <div className="text-xl font-semibold text-[#2F5D8A] mt-0.5 tabular-nums">{selectedIds.size}</div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-[#5C5C57] uppercase font-semibold">Total Filtered</div>
          <div className="text-xl font-semibold text-[#1A1A1A] mt-0.5 tabular-nums">{advisoriesData?.total ?? 0}</div>
        </div>
      </div>

      {/* 3. Filters & Search Strip */}
      <div className="p-3.5 bg-white border border-[#E3E3DE] rounded space-y-3 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Filter */}
            <div className="flex items-center space-x-1.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-1">
              <span className="text-[#5C5C57] text-[11px]">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
              >
                <option value="all">All Priorities</option>
                <option value="P1">P1 — Critical Grounding</option>
                <option value="P2">P2 — High Urgency</option>
                <option value="P3">P3 — Watch Window</option>
                <option value="P4">P4 — Routine Deferred</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-1">
              <span className="text-[#5C5C57] text-[11px]">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
              >
                <option value="all">All Statuses</option>
                <option value="proposed">Proposed (Action Needed)</option>
                <option value="accepted">Accepted</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            {/* Functional System Filter */}
            <div className="flex items-center space-x-1.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-1">
              <span className="text-[#5C5C57] text-[11px]">System:</span>
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
              >
                <option value="all">All Systems</option>
                {systemsData?.map((s) => (
                  <option key={s.system_id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Spare Status Filter */}
            <div className="flex items-center space-x-1.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-1">
              <span className="text-[#5C5C57] text-[11px]">Spare:</span>
              <select
                value={spareFilter}
                onChange={(e) => {
                  setSpareFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>

            {/* Airframe Filter */}
            <div className="flex items-center space-x-1.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-1">
              <span className="text-[#5C5C57] text-[11px]">Airframe:</span>
              <select
                value={aircraftFilter}
                onChange={(e) => {
                  setAircraftFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
              >
                <option value="all">All Fleet</option>
                {aircraftData?.items.map((ac) => (
                  <option key={ac.aircraft_id} value={ac.aircraft_id}>
                    {ac.tail_code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#5C5C57] absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Search component, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#FAFAF8] border border-[#E3E3DE] text-[#1A1A1A] text-xs font-mono rounded pl-7 pr-2.5 py-1 w-56 focus:outline-none focus:border-[#2F5D8A]"
            />
          </div>
        </div>

        {/* Bulk Action Bar (when selected) */}
        {selectedIds.size > 0 && canAction && (
          <div className="pt-2 border-t border-[#ECECE8] flex items-center justify-between text-xs font-mono">
            <span className="text-[#2F5D8A] font-semibold">
              {selectedIds.size} advisories selected for bulk operation
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkAccept}
                disabled={updateMutation.isPending}
                className="py-1 px-3 bg-[#2E7D4F] hover:bg-[#256640] text-white rounded font-medium flex items-center gap-1 transition"
              >
                <Check className="w-3.5 h-3.5" /> Accept Selected ({selectedIds.size})
              </button>
              <button
                onClick={() => setDismissTarget({ bulk: true })}
                disabled={updateMutation.isPending}
                className="py-1 px-3 bg-white hover:bg-[#FDF2F0] text-[#5C5C57] hover:text-[#B3402F] border border-[#E3E3DE] hover:border-[#F5C2BC] rounded font-medium flex items-center gap-1 transition"
              >
                <X className="w-3.5 h-3.5" /> Dismiss Selected ({selectedIds.size})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Advisories Data Table */}
      <div className="overflow-x-auto rounded border border-[#E3E3DE] bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#FAFAF8] text-[#5C5C57] font-mono uppercase text-[11px] tracking-wider select-none sticky top-0 z-10">
              <th className="py-2.5 px-3 w-10 text-center">
                <button
                  onClick={toggleSelectAll}
                  className="text-[#5C5C57] hover:text-[#1A1A1A] transition"
                  title="Toggle Select All"
                >
                  {allCurrentSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#2F5D8A]" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-2.5 px-3 text-center">Priority</th>
              <th className="py-2.5 px-3.5">Airframe</th>
              <th className="py-2.5 px-3.5">Component & System</th>
              <th className="py-2.5 px-3.5">Recommended Action</th>
              <th className="py-2.5 px-3 text-right">Risk (14d)</th>
              <th className="py-2.5 px-3 text-right">RUL (P50)</th>
              <th className="py-2.5 px-3 text-center">Spare</th>
              <th className="py-2.5 px-3 text-right">Downtime</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECECE8] font-mono text-[#1A1A1A]">
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
                    className={`transition-colors duration-100 ${
                      isSelected ? 'bg-[#EDF3F8]' : 'hover:bg-[#FAFAF8]'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => toggleSelectOne(advisory.advisory_id)}
                        className="text-[#5C5C57] hover:text-[#1A1A1A] transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#2F5D8A]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Priority */}
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge status={advisory.priority} size="sm" />
                    </td>

                    {/* Airframe */}
                    <td className="py-2.5 px-3.5">
                      <button
                        onClick={() => navigate(`/aircraft?id=${advisory.aircraft_id}`)}
                        className="font-semibold text-[#1A1A1A] hover:text-[#2F5D8A] transition"
                      >
                        {advisory.tail_code || advisory.aircraft_id}
                      </button>
                    </td>

                    {/* Component */}
                    <td className="py-2.5 px-3.5">
                      <div>
                        <button
                          onClick={() => navigate(`/components/${advisory.component_id}`)}
                          className="font-medium text-[#1A1A1A] hover:text-[#2F5D8A] transition text-left"
                        >
                          {advisory.component_name || advisory.component_id}
                        </button>
                        <div className="text-[11px] text-[#5C5C57]">{advisory.system_name}</div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3.5">
                      <span className="text-[#A66A00] font-medium">
                        {advisory.action}
                      </span>
                    </td>

                    {/* Risk */}
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span
                        className={
                          (riskVal ?? 0) >= 0.5
                            ? 'text-[#B3402F] font-semibold'
                            : (riskVal ?? 0) >= 0.2
                            ? 'text-[#A66A00] font-semibold'
                            : 'text-[#5C5C57]'
                        }
                      >
                        {riskVal !== undefined ? `${(riskVal * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>

                    {/* RUL */}
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span
                        className={
                          (rulVal ?? 99) <= 14
                            ? 'text-[#B3402F] font-semibold'
                            : (rulVal ?? 99) <= 30
                            ? 'text-[#A66A00] font-semibold'
                            : 'text-[#1A1A1A]'
                        }
                      >
                        {rulVal !== undefined ? `${Math.round(rulVal)}d` : '—'}
                      </span>
                    </td>

                    {/* Spare */}
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge status={advisory.spare_status || 'in_stock'} size="sm" />
                    </td>

                    {/* Expected Downtime */}
                    <td className="py-2.5 px-3 text-right text-[#1A1A1A] tabular-nums">
                      {advisory.expected_downtime_days ? `${advisory.expected_downtime_days}d` : '—'}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge status={advisory.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3.5 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {canAction && advisory.status === 'proposed' && (
                          <>
                            <button
                              onClick={() => handleSingleAccept(advisory.advisory_id)}
                              disabled={updateMutation.isPending && processingId === advisory.advisory_id}
                              className="py-0.5 px-2 bg-[#2E7D4F] hover:bg-[#256640] disabled:opacity-50 text-white rounded text-[11px] font-medium transition flex items-center gap-1"
                              title="Accept Advisory"
                            >
                              {processingId === advisory.advisory_id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Saving...</span>
                                </>
                              ) : (
                                <span>Accept</span>
                              )}
                            </button>

                            <button
                              onClick={() =>
                                navigate(
                                  `/planning?aircraft=${advisory.aircraft_id}&component=${advisory.component_id}&advisory=${advisory.advisory_id}`
                                )
                              }
                              className="py-0.5 px-2 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-[11px] font-medium transition"
                              title="Schedule Work Order"
                            >
                              Schedule
                            </button>

                            <button
                              onClick={() => setDismissTarget({ id: advisory.advisory_id })}
                              className="p-1 bg-white hover:bg-[#FDF2F0] text-[#5C5C57] hover:text-[#B3402F] border border-[#E3E3DE] hover:border-[#F5C2BC] rounded text-[11px] transition"
                              title="Dismiss with reason"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => navigate(`/components/${advisory.component_id}`)}
                          className="p-1 text-[#5C5C57] hover:text-[#2F5D8A] transition"
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
        <div className="flex items-center justify-between px-1 text-xs font-mono text-[#5C5C57]">
          <div>
            Page <span className="font-semibold text-[#1A1A1A]">{advisoriesData.page}</span> of{' '}
            <span className="font-semibold text-[#1A1A1A]">{advisoriesData.total_pages}</span> ({advisoriesData.total}{' '}
            advisories)
          </div>
          <div className="flex space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded border border-[#E3E3DE] bg-white hover:bg-[#F6F6F3] text-[#5C5C57] disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= advisoriesData.total_pages}
              className="px-2.5 py-1 rounded border border-[#E3E3DE] bg-white hover:bg-[#F6F6F3] text-[#5C5C57] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Dismissal Audit Reason Modal */}
      {dismissTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleDismissSubmit}
            className="bg-white border border-[#E3E3DE] rounded p-5 max-w-md w-full shadow-[0_4px_16px_rgba(0,0,0,0.1)] space-y-3 font-mono text-xs"
          >
            <div className="flex items-center space-x-2 text-[#B3402F]">
              <h3 className="font-semibold text-xs uppercase text-[#1A1A1A]">
                Override & Dismissal Justification
              </h3>
            </div>
            <p className="text-[#5C5C57]">
              {dismissTarget.bulk
                ? `You are dismissing ${selectedIds.size} selected advisories. An audit justification is required:`
                : `You are dismissing advisory #${dismissTarget.id}. Enter an engineering justification:`}
            </p>
            <textarea
              required
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Visual inspection performed; component confirmed nominal; sensor drift documented."
              className="w-full bg-white border border-[#E3E3DE] rounded p-2 text-[#1A1A1A] focus:outline-none focus:border-[#2F5D8A]"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDismissTarget(null)}
                className="px-3 py-1.5 bg-white border border-[#E3E3DE] hover:bg-[#F6F6F3] text-[#5C5C57] rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!dismissReason.trim() || updateMutation.isPending}
                className="px-3.5 py-1.5 bg-[#B3402F] hover:bg-[#973627] text-white rounded font-medium"
              >
                Confirm Dismissal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Batch Scoring Engine Trigger Modal */}
      {engineModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#E3E3DE] rounded p-5 max-w-lg w-full shadow-[0_4px_16px_rgba(0,0,0,0.1)] space-y-3.5 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#ECECE8] pb-2.5">
              <div className="flex items-center space-x-1.5 text-[#2F5D8A]">
                <Play className="w-4 h-4 fill-current" />
                <h3 className="font-semibold text-xs uppercase text-[#1A1A1A]">
                  Execute Predictive Maintenance Scoring Engine
                </h3>
              </div>
              <button
                onClick={() => setEngineModalOpen(false)}
                className="text-[#5C5C57] hover:text-[#1A1A1A]"
              >
                ✕
              </button>
            </div>

            <p className="text-[#5C5C57] leading-relaxed">
              Triggers the batch scoring engine (`POST /api/v1/engine/run`) to evaluate rolling flight telemetry,
              infer failure risk and RUL models, synthesize prioritization rules, and generate updated advisories.
            </p>

            <form onSubmit={handleRunEngineSubmit} className="space-y-3">
              <div>
                <label className="block text-[#5C5C57] mb-1">Cutoff Reference Date (as_of_date)</label>
                <input
                  type="date"
                  value={engineAsOf}
                  onChange={(e) => setEngineAsOf(e.target.value)}
                  className="w-full bg-[#FAFAF8] border border-[#E3E3DE] rounded p-2 text-[#1A1A1A] focus:outline-none focus:border-[#2F5D8A]"
                />
                <span className="text-[11px] text-[#5C5C57] mt-1 block">
                  Leave blank to score against latest flight telemetry date.
                </span>
              </div>

              <div>
                <label className="block text-[#5C5C57] mb-1">Target Airframe (Optional)</label>
                <select
                  value={engineAircraft}
                  onChange={(e) => setEngineAircraft(e.target.value)}
                  className="w-full bg-[#FAFAF8] border border-[#E3E3DE] rounded p-2 text-[#1A1A1A] focus:outline-none focus:border-[#2F5D8A] cursor-pointer"
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
                <div className="p-3 bg-[#EDF6F0] border border-[#C8E6D3] rounded space-y-1 text-[11px] text-[#2E7D4F]">
                  <div className="font-semibold text-[#1A1A1A]">
                    Engine Run Complete ({engineResult.duration_seconds.toFixed(2)}s)
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-[#5C5C57]">
                    <div>Components Scored: <strong className="text-[#1A1A1A]">{engineResult.components_scored}</strong></div>
                    <div>Predictions Logged: <strong className="text-[#1A1A1A]">{engineResult.predictions_recorded}</strong></div>
                    <div>Advisories Raised: <strong className="text-[#1A1A1A]">{engineResult.advisories_generated}</strong></div>
                    <div>P1 / P2 Critical: <strong className="text-[#B3402F]">{engineResult.p1_count} / {engineResult.p2_count}</strong></div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#ECECE8]">
                <button
                  type="button"
                  onClick={() => setEngineModalOpen(false)}
                  className="px-3 py-1.5 bg-white border border-[#E3E3DE] hover:bg-[#F6F6F3] text-[#5C5C57] rounded"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={runEngineMutation.isPending}
                  className="px-3.5 py-1.5 bg-[#2F5D8A] hover:bg-[#264A6E] disabled:opacity-50 text-white rounded font-medium flex items-center gap-1.5"
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

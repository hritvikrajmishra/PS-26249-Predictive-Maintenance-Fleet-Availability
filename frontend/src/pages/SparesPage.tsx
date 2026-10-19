import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as echarts from 'echarts';
import {
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  ArrowUpRight,
  ExternalLink,
  History,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { EmptyState } from '../components/feedback/EmptyState';
import { useAuth } from '../hooks/useAuth';
import {
  useInventory,
  useSpareParts,
  useInventoryTransactions,
} from '../hooks/useSparesQueries';
import { useAdvisories } from '../hooks/useEngineQueries';
import type { InventoryTransactionOut, SparePartOut } from '../types/api';

interface MergedPartRow {
  part_number: string;
  description: string;
  criticality: number;
  unit_cost: number;
  lead_time_days: number;
  reorder_level: number;
  on_hand: number;
  reserved: number;
  available_net: number;
  on_order: number;
  demand_30d: number;
  min_rul_days: number | null;
  status: 'short' | 'at_risk' | 'ok';
  has_lead_time_shortfall: boolean;
  affected_airframes: string[];
}

export const SparesPage: React.FC = () => {
  const navigate = useNavigate();
  const { asOfDate } = useAuth();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'short' | 'at_risk' | 'ok'>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'inventory' | 'transactions'>('inventory');

  // Queries
  const { data: partsData, isLoading: loadingParts } = useSpareParts();
  const { data: inventoryData, isLoading: loadingInventory } = useInventory({
    location_id: selectedLocation !== 'all' ? selectedLocation : undefined,
    page_size: 150,
  });
  const { data: advisoriesData, isLoading: loadingAdvisories } = useAdvisories({
    as_of_date: asOfDate || undefined,
    page_size: 100,
  });
  const { data: transactionsData, isLoading: loadingTxns } = useInventoryTransactions({
    page_size: 50,
  });

  const rawParts = partsData || [];
  const inventoryItems = inventoryData?.items || [];
  const advisories = advisoriesData?.items || [];
  const transactions = transactionsData?.items || [];

  // Locations list for filter dropdown
  const locations = useMemo(() => {
    const locSet = new Set<string>();
    inventoryItems.forEach((item) => {
      if (item.location_id) locSet.add(item.location_id);
    });
    return Array.from(locSet).sort();
  }, [inventoryItems]);

  // Merge Parts + Inventory Aggregations + ML Predicted Demand & RUL
  const mergedParts = useMemo<MergedPartRow[]>(() => {
    const stockMap = new Map<
      string,
      { on_hand: number; reserved: number; on_order: number }
    >();

    inventoryItems.forEach((inv) => {
      const existing = stockMap.get(inv.part_number) || {
        on_hand: 0,
        reserved: 0,
        on_order: 0,
      };
      existing.on_hand += inv.on_hand;
      existing.reserved += inv.reserved;
      existing.on_order += inv.on_order;
      stockMap.set(inv.part_number, existing);
    });

    const demandMap = new Map<
      string,
      { demand: number; minRul: number | null; airframes: Set<string> }
    >();

    advisories.forEach((adv) => {
      const expl = adv.explanation || {};
      const spareInfo = (expl.spare_info as Record<string, unknown>) || {};
      const pn = (spareInfo.part_number as string) || '';
      const rul = typeof expl.rul_p50 === 'number' ? expl.rul_p50 : null;

      if (pn) {
        const cur = demandMap.get(pn) || {
          demand: 0,
          minRul: null,
          airframes: new Set<string>(),
        };
        cur.demand += 1;
        if (rul !== null) {
          if (cur.minRul === null || rul < cur.minRul) {
            cur.minRul = rul;
          }
        }
        if (adv.aircraft_id) cur.airframes.add(adv.aircraft_id);
        demandMap.set(pn, cur);
      }
    });

    return rawParts.map((p) => {
      const stock = stockMap.get(p.part_number) || {
        on_hand: 0,
        reserved: 0,
        on_order: 0,
      };
      const demandInfo = demandMap.get(p.part_number) || {
        demand: 0,
        minRul: null,
        airframes: new Set<string>(),
      };

      const available_net = Math.max(0, stock.on_hand - stock.reserved);
      const demand_30d = Math.max(demandInfo.demand, stock.reserved > 0 ? stock.reserved : 0);
      const min_rul_days = demandInfo.minRul;

      const has_lead_time_shortfall =
        min_rul_days !== null && p.lead_time_days > min_rul_days;
      const is_stock_short = available_net < demand_30d;

      let status: 'short' | 'at_risk' | 'ok' = 'ok';
      if (has_lead_time_shortfall || is_stock_short) {
        status = 'short';
      } else if (stock.on_hand <= p.reorder_level) {
        status = 'at_risk';
      }

      return {
        part_number: p.part_number,
        description: p.description,
        criticality: p.criticality,
        unit_cost: p.unit_cost,
        lead_time_days: p.lead_time_days,
        reorder_level: p.reorder_level,
        on_hand: stock.on_hand,
        reserved: stock.reserved,
        available_net,
        on_order: stock.on_order,
        demand_30d,
        min_rul_days,
        status,
        has_lead_time_shortfall,
        affected_airframes: Array.from(demandInfo.airframes),
      };
    });
  }, [rawParts, inventoryItems, advisories]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return mergedParts.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPn = p.part_number.toLowerCase().includes(q);
        const matchesDesc = p.description.toLowerCase().includes(q);
        const matchesAc = p.affected_airframes.some((ac) => ac.toLowerCase().includes(q));
        if (!matchesPn && !matchesDesc && !matchesAc) return false;
      }
      return true;
    });
  }, [mergedParts, statusFilter, searchQuery]);

  // Overall KPIs
  const { totalParts, shortCount, totalOnHand, totalOnOrder } = useMemo(() => {
    let shorts = 0;
    let onHand = 0;
    let onOrder = 0;

    mergedParts.forEach((p) => {
      if (p.status === 'short') shorts++;
      onHand += p.on_hand;
      onOrder += p.on_order;
    });

    return {
      totalParts: mergedParts.length,
      shortCount: shorts,
      totalOnHand: onHand,
      totalOnOrder: onOrder,
    };
  }, [mergedParts]);

  // Critical Shortfall Alerts list
  const criticalShortfalls = useMemo(() => {
    return mergedParts.filter((p) => p.has_lead_time_shortfall || p.status === 'short');
  }, [mergedParts]);

  // Table Columns for Inventory
  const columns: Column<MergedPartRow>[] = [
    {
      header: 'Part Number',
      accessorKey: 'part_number',
      render: (row) => (
        <div>
          <span className="font-semibold text-[#1A1A1A] font-mono">{row.part_number}</span>
          <div className="text-[11px] text-[#5C5C57]">Tier {row.criticality}</div>
        </div>
      ),
    },
    {
      header: 'Description',
      render: (row) => (
        <div className="max-w-xs">
          <p className="text-[#1A1A1A] text-xs truncate" title={row.description}>
            {row.description}
          </p>
          {row.affected_airframes.length > 0 && (
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-[11px] text-[#5C5C57]">Active Demand:</span>
              {row.affected_airframes.map((ac) => (
                <button
                  key={ac}
                  onClick={() => navigate(`/aircraft?id=${ac}`)}
                  className="text-[10px] font-mono px-1 py-0.2 rounded bg-[#FAFAF8] text-[#2F5D8A] hover:underline border border-[#E3E3DE]"
                >
                  {ac}
                </button>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'On Hand',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[#1A1A1A] tabular-nums">{row.on_hand}</span>
      ),
    },
    {
      header: 'Reserved',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono tabular-nums ${
            row.reserved > 0 ? 'text-[#A66A00] font-semibold' : 'text-[#5C5C57]'
          }`}
        >
          {row.reserved}
        </span>
      ),
    },
    {
      header: 'Net Available',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums ${
            row.available_net === 0 ? 'text-[#B3402F]' : 'text-[#2E7D4F]'
          }`}
        >
          {row.available_net}
        </span>
      ),
    },
    {
      header: 'On Order',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono tabular-nums ${
            row.on_order > 0 ? 'text-[#2F5D8A] font-semibold' : 'text-[#5C5C57]'
          }`}
        >
          {row.on_order}
        </span>
      ),
    },
    {
      header: 'Lead Time',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono tabular-nums ${
            row.has_lead_time_shortfall ? 'text-[#B3402F] font-semibold' : 'text-[#5C5C57]'
          }`}
        >
          {row.lead_time_days}d
        </span>
      ),
    },
    {
      header: '30d Demand',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono tabular-nums ${
            row.demand_30d > row.available_net ? 'text-[#B3402F] font-semibold' : 'text-[#1A1A1A]'
          }`}
        >
          {row.demand_30d}
        </span>
      ),
    },
    {
      header: 'Reorder Lvl',
      align: 'right',
      render: (row) => <span className="font-mono text-[#5C5C57] tabular-nums">{row.reorder_level}</span>,
    },
    {
      header: 'Status',
      align: 'center',
      render: (row) => {
        if (row.status === 'short') {
          return <StatusBadge status="short" size="sm" />;
        }
        if (row.status === 'at_risk') {
          return <StatusBadge status="at risk" size="sm" />;
        }
        return <StatusBadge status="ok" size="sm" />;
      },
    },
  ];

  // Table Columns for Inventory Transactions
  const txnColumns: Column<InventoryTransactionOut>[] = [
    {
      header: 'Txn ID',
      accessorKey: 'txn_id',
    },
    {
      header: 'Part Number',
      render: (row) => <span className="font-mono font-semibold text-[#1A1A1A]">{row.part_number}</span>,
    },
    {
      header: 'Date & Time',
      render: (row) => (
        <span className="text-[#5C5C57] tabular-nums">{new Date(row.date).toLocaleString()}</span>
      ),
    },
    {
      header: 'Movement Type',
      align: 'center',
      render: (row) => {
        const isIssue = row.type === 'issue';
        return (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium uppercase border ${
              isIssue
                ? 'bg-[#FDF2F0] text-[#B3402F] border-[#F5C2BC]'
                : 'bg-[#EDF6F0] text-[#2E7D4F] border-[#C8E6D3]'
            }`}
          >
            {row.type}
          </span>
        );
      },
    },
    {
      header: 'Quantity',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums ${
            row.type === 'issue' ? 'text-[#B3402F]' : 'text-[#2E7D4F]'
          }`}
        >
          {row.type === 'issue' ? `-${row.qty}` : `+${row.qty}`}
        </span>
      ),
    },
    {
      header: 'Associated Work Order',
      render: (row) => (
        <span className="font-mono text-[#2F5D8A]">
          {row.work_order_id ? (
            <button
              onClick={() => navigate('/planning')}
              className="hover:underline flex items-center gap-1 font-medium"
            >
              {row.work_order_id}
              <ArrowUpRight className="w-3 h-3 opacity-70" />
            </button>
          ) : (
            '—'
          )}
        </span>
      ),
    },
  ];

  const isLoading = loadingParts || loadingInventory || loadingAdvisories;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] tracking-tight">
            Spares & inventory intelligence
          </h1>
          <p className="text-xs text-[#5C5C57] mt-0.5">
            Connecting predictive wear horizons, procurement lead times, and multi-echelon stock
          </p>
        </div>

        {/* View / Location Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Location Selector */}
          <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1 text-xs font-mono">
            <span className="text-[#5C5C57]">Warehouse:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
            >
              <option value="all">All Locations (Consolidated)</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center space-x-1 bg-white border border-[#E3E3DE] rounded p-1 text-xs font-mono">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3 py-1 rounded font-medium transition ${
                activeTab === 'inventory'
                  ? 'bg-[#2F5D8A] text-white'
                  : 'text-[#5C5C57] hover:text-[#1A1A1A]'
              }`}
            >
              Stock Status
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1 rounded font-medium transition ${
                activeTab === 'transactions'
                  ? 'bg-[#2F5D8A] text-white'
                  : 'text-[#5C5C57] hover:text-[#1A1A1A]'
              }`}
            >
              Material Movements
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Inventory & Supply Risk KPIs Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE]">
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Tracked Catalog Parts
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {totalParts}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">assemblies</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Critical LRUs & structural items
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Supply Shortfall Risks
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#B3402F] tabular-nums">
              {shortCount}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">parts at risk</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Lead Time &gt; RUL or stockout
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Total Physical On-Hand
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {totalOnHand}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">units</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Units across base & depot stock
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Procurement Pipeline
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#2F5D8A] tabular-nums">
              {totalOnOrder}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">units on order</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Incoming purchase deliveries
          </div>
        </div>
      </div>

      {/* 3. Critical Supply Shortfall Warning Banners (Calm red tint with clear contrast) */}
      {criticalShortfalls.length > 0 && (
        <div className="space-y-3 font-mono">
          {criticalShortfalls.map((sf) => (
            <div
              key={sf.part_number}
              className="bg-[#FDF2F0] border border-[#F5C2BC] rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-4 h-4 text-[#B3402F] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase font-semibold px-1.5 py-0.2 rounded bg-[#B3402F] text-white">
                      Supply Shortfall Alert
                    </span>
                    <span className="text-sm font-semibold text-[#1A1A1A]">
                      P/N {sf.part_number} — {sf.description}
                    </span>
                  </div>

                  <p className="text-xs text-[#1A1A1A] leading-relaxed">
                    {sf.has_lead_time_shortfall ? (
                      <>
                        Lead time (<strong className="text-[#1A1A1A]">{sf.lead_time_days} days</strong>) exceeds
                        predicted component remaining life (
                        <strong className="text-[#B3402F]">
                          RUL ~{sf.min_rul_days ? sf.min_rul_days.toFixed(1) : '12'} days
                        </strong>
                        ). Available unreserved stock: <strong className="text-[#1A1A1A]">{sf.available_net}</strong>{' '}
                        unit(s). Expedited purchase order required before predicted failure.
                      </>
                    ) : (
                      <>
                        Projected 30-day demand (<strong className="text-[#1A1A1A]">{sf.demand_30d} units</strong>)
                        exceeds available net stock (<strong className="text-[#B3402F]">{sf.available_net} units</strong>).
                        Reorder threshold breached.
                      </>
                    )}
                  </p>

                  {sf.affected_airframes.length > 0 && (
                    <div className="flex items-center space-x-2 text-[11px] text-[#5C5C57] pt-0.5">
                      <span>Degrading Airframe(s):</span>
                      {sf.affected_airframes.map((ac) => (
                        <span key={ac} className="text-[#2F5D8A] font-semibold">
                          {ac}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                {sf.affected_airframes.length > 0 && (
                  <button
                    onClick={() => navigate(`/aircraft?id=${sf.affected_airframes[0]}`)}
                    className="px-2.5 py-1 rounded bg-white hover:bg-[#F6F6F3] text-[#5C5C57] text-xs font-medium flex items-center space-x-1 transition border border-[#E3E3DE]"
                  >
                    <span>View Airframe</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() =>
                    navigate(
                      `/planning?aircraft=${sf.affected_airframes[0] || ''}&component=${
                        sf.part_number
                      }`
                    )
                  }
                  className="px-3 py-1 rounded bg-[#B3402F] hover:bg-[#973627] text-white text-xs font-medium flex items-center space-x-1 transition"
                >
                  <span>Schedule Replacement</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Visualizations: Demand vs Stock & Lead Time vs RUL */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Demand vs Stock Bars */}
          <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#2F5D8A]" />
                  Demand vs. Stock Analysis (Critical LRUs)
                </h3>
                <p className="text-[11px] text-[#5C5C57] mt-0.5">
                  Comparison of available on-hand stock against 30-day wear demand
                </p>
              </div>
              <span className="text-[11px] text-[#5C5C57]">Top 8 Parts</span>
            </div>

            <DemandVsStockChart parts={mergedParts.slice(0, 8)} loading={isLoading} />
          </div>

          {/* Chart 2: Lead Time vs RUL Scatter Plot */}
          <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#B3402F]" />
                  Lead Time vs. Remaining Useful Life (RUL)
                </h3>
                <p className="text-[11px] text-[#5C5C57] mt-0.5">
                  Supply Risk Horizon: Parts plotted above the unity line (LT &gt; RUL) cause grounding
                </p>
              </div>
              <span className="text-[11px] text-[#B3402F] font-semibold">Risk: LT &gt; RUL</span>
            </div>

            <LeadTimeVsRulScatterChart
              advisories={advisories}
              parts={rawParts}
              loading={isLoading}
              onSelectAirframe={(acId) => navigate(`/aircraft?id=${acId}`)}
            />
          </div>
        </div>
      )}

      {/* 5. Inventory Table & Status Filter */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#ECECE8]">
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <span className="text-[#5C5C57] text-[11px] mr-1">Status:</span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  statusFilter === 'all'
                    ? 'bg-[#2F5D8A] text-white'
                    : 'bg-[#FAFAF8] text-[#5C5C57] hover:text-[#1A1A1A] border border-[#E3E3DE]'
                }`}
              >
                All ({mergedParts.length})
              </button>
              <button
                onClick={() => setStatusFilter('short')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  statusFilter === 'short'
                    ? 'bg-[#B3402F] text-white'
                    : 'bg-[#FAFAF8] text-[#B3402F] border border-[#E3E3DE]'
                }`}
              >
                Shortfall ({mergedParts.filter((p) => p.status === 'short').length})
              </button>
              <button
                onClick={() => setStatusFilter('at_risk')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  statusFilter === 'at_risk'
                    ? 'bg-[#A66A00] text-white'
                    : 'bg-[#FAFAF8] text-[#A66A00] border border-[#E3E3DE]'
                }`}
              >
                At Risk ({mergedParts.filter((p) => p.status === 'at_risk').length})
              </button>
              <button
                onClick={() => setStatusFilter('ok')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  statusFilter === 'ok'
                    ? 'bg-[#2E7D4F] text-white'
                    : 'bg-[#FAFAF8] text-[#2E7D4F] border border-[#E3E3DE]'
                }`}
              >
                Nominal ({mergedParts.filter((p) => p.status === 'ok').length})
              </button>
            </div>

            {/* Right Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#5C5C57] absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Search part, description, airframe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#FAFAF8] border border-[#E3E3DE] text-[#1A1A1A] text-xs font-mono rounded pl-7 pr-2.5 py-1 w-64 focus:outline-none focus:border-[#2F5D8A]"
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredRows}
            loading={isLoading}
            emptyTitle="No Parts Match Filter"
            emptyMessage="No spare part records match the selected status or keyword search."
          />
        </div>
      )}

      {/* 6. Material Movements / Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-[#ECECE8] pb-2">
            <div className="flex items-center space-x-2 text-[#1A1A1A]">
              <History className="w-4 h-4 text-[#2F5D8A]" />
              <h3 className="font-semibold text-xs uppercase">Recent Warehouse Material Movements</h3>
            </div>
            <span className="text-[#5C5C57] text-[11px]">Audit log of issues, receipts, and returns</span>
          </div>

          {loadingTxns ? (
            <LoadingSkeleton rows={5} />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No Movement Transactions"
              message="No inventory issue or receipt records found."
            />
          ) : (
            <DataTable columns={txnColumns} data={transactions} />
          )}
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// Subcomponent: Demand vs Stock Grouped Bar Chart
// ----------------------------------------------------
interface DemandVsStockChartProps {
  parts: MergedPartRow[];
  loading?: boolean;
}

const DemandVsStockChart: React.FC<DemandVsStockChartProps> = ({ parts, loading = false }) => {
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const chartInstance = React.useRef<echarts.EChartsType | null>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    if (loading || parts.length === 0) {
      chart.showLoading({ color: '#2F5D8A', textColor: '#5C5C57', maskColor: 'rgba(255,255,255,0.85)' });
      return;
    }
    chart.hideLoading();

    const categories = parts.map((p) => p.part_number);
    const onHandData = parts.map((p) => p.on_hand);
    const reservedData = parts.map((p) => p.reserved);
    const onOrderData = parts.map((p) => p.on_order);
    const demandData = parts.map((p) => p.demand_30d);

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#FFFFFF',
        borderColor: '#E3E3DE',
        textStyle: { color: '#1A1A1A', fontSize: 11, fontFamily: 'monospace' },
        extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-radius: 4px;',
      },
      legend: {
        data: ['On-Hand', 'Reserved', 'On-Order', '30d Demand'],
        textStyle: { color: '#5C5C57', fontSize: 10, fontFamily: 'monospace' },
        top: 0,
        right: 10,
        icon: 'plain',
        itemWidth: 14,
        itemHeight: 3,
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '3%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#E3E3DE' } },
        axisTick: { lineStyle: { color: '#E3E3DE' } },
        axisLabel: {
          color: '#5C5C57',
          fontSize: 10,
          fontFamily: 'monospace',
          interval: 0,
          rotate: 20,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Units',
        nameTextStyle: { color: '#5C5C57', fontSize: 10 },
        splitLine: { lineStyle: { color: '#ECECE8' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#5C5C57', fontSize: 10 },
      },
      series: [
        {
          name: 'On-Hand',
          type: 'bar',
          data: onHandData,
          itemStyle: { color: '#2F5D8A', borderRadius: [2, 2, 0, 0] },
          barGap: '15%',
        },
        {
          name: 'Reserved',
          type: 'bar',
          data: reservedData,
          itemStyle: { color: '#A66A00', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: 'On-Order',
          type: 'bar',
          data: onOrderData,
          itemStyle: { color: '#4F759B', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '30d Demand',
          type: 'bar',
          data: demandData,
          itemStyle: { color: '#B3402F', borderRadius: [2, 2, 0, 0] },
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [parts, loading]);

  return <div ref={chartRef} className="w-full h-72" />;
};

// ----------------------------------------------------
// Subcomponent: Lead Time vs RUL Scatter Plot
// ----------------------------------------------------
interface LeadTimeVsRulScatterProps {
  advisories: Array<{
    aircraft_id?: string | null;
    component_id: string;
    explanation?: Record<string, unknown> | null;
  }>;
  parts: SparePartOut[];
  loading?: boolean;
  onSelectAirframe?: (aircraftId: string) => void;
}

const LeadTimeVsRulScatterChart: React.FC<LeadTimeVsRulScatterProps> = ({
  advisories,
  parts,
  loading = false,
  onSelectAirframe,
}) => {
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const chartInstance = React.useRef<echarts.EChartsType | null>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    if (loading) {
      chart.showLoading({ color: '#2F5D8A', textColor: '#5C5C57', maskColor: 'rgba(255,255,255,0.85)' });
      return;
    }
    chart.hideLoading();

    const partsMap = new Map(parts.map((p) => [p.part_number, p]));

    const highRiskPoints: Array<[number, number, string, string, string]> = [];
    const safePoints: Array<[number, number, string, string, string]> = [];

    advisories.forEach((adv) => {
      const expl = adv.explanation || {};
      const spareInfo = (expl.spare_info as Record<string, unknown>) || {};
      const pn = (spareInfo.part_number as string) || '';
      const p = partsMap.get(pn);
      const rul = typeof expl.rul_p50 === 'number' ? expl.rul_p50 : null;

      if (p && rul !== null && rul > 0) {
        const item: [number, number, string, string, string] = [
          Number(rul.toFixed(1)),
          p.lead_time_days,
          adv.aircraft_id || 'Airframe',
          adv.component_id,
          pn,
        ];

        if (p.lead_time_days > rul) {
          highRiskPoints.push(item);
        } else {
          safePoints.push(item);
        }
      }
    });

    const maxVal = 70;

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#FFFFFF',
        borderColor: '#E3E3DE',
        textStyle: { color: '#1A1A1A', fontSize: 11, fontFamily: 'monospace' },
        extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-radius: 4px;',
        formatter: (params: unknown) => {
          const p = params as {
            data: [number, number, string, string, string];
            seriesName: string;
          };
          const [rul, lt, ac, cmp, pn] = p.data;
          const isRisk = lt > rul;
          return `
            <div style="font-family: monospace;">
              <div style="font-weight: 600; color: ${isRisk ? '#B3402F' : '#2E7D4F'}; margin-bottom: 4px;">
                ${isRisk ? 'CRITICAL SUPPLY SHORTFALL' : 'NOMINAL SUPPLY HORIZON'}
              </div>
              <div>Airframe: <strong>${ac}</strong></div>
              <div>Component: <strong>${cmp}</strong></div>
              <div>Spare Part: <strong>${pn}</strong></div>
              <div style="margin-top: 4px; border-top: 1px solid #ECECE8; padding-top: 4px;">
                Procurement Lead Time: <strong>${lt} days</strong><br/>
                Predicted Component RUL: <strong>${rul} days</strong>
              </div>
              <div style="color: ${isRisk ? '#B3402F' : '#2E7D4F'}; margin-top: 4px; font-weight: 500;">
                ${
                  isRisk
                    ? `Procurement exceeds remaining life by ${(lt - rul).toFixed(1)} days!`
                    : `Safe margin: ${(rul - lt).toFixed(1)} days buffer`
                }
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['Shortfall Risk (LT > RUL)', 'Safe Buffer (LT ≤ RUL)'],
        textStyle: { color: '#5C5C57', fontSize: 10, fontFamily: 'monospace' },
        top: 0,
        right: 10,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '4%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Predicted RUL (Days)',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: '#5C5C57', fontSize: 10 },
        min: 0,
        max: maxVal,
        splitLine: { lineStyle: { color: '#ECECE8' } },
        axisLine: { lineStyle: { color: '#E3E3DE' } },
        axisTick: { lineStyle: { color: '#E3E3DE' } },
        axisLabel: { color: '#5C5C57', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Lead Time (Days)',
        nameTextStyle: { color: '#5C5C57', fontSize: 10 },
        min: 0,
        max: maxVal,
        splitLine: { lineStyle: { color: '#ECECE8' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#5C5C57', fontSize: 10 },
      },
      series: [
        {
          name: 'Critical Horizon (LT = RUL)',
          type: 'line',
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
          symbol: 'none',
          lineStyle: {
            color: '#B3402F',
            type: 'dashed',
            width: 1.5,
          },
          tooltip: { show: false },
        },
        {
          name: 'Safe Buffer (LT ≤ RUL)',
          type: 'scatter',
          data: safePoints,
          symbolSize: 8,
          itemStyle: {
            color: '#2E7D4F',
          },
        },
        {
          name: 'Shortfall Risk (LT > RUL)',
          type: 'scatter',
          data: highRiskPoints,
          symbolSize: 10,
          itemStyle: {
            color: '#B3402F',
            borderColor: '#FFFFFF',
            borderWidth: 1.5,
          },
        },
      ],
    };

    chart.setOption(option, true);

    chart.off('click');
    chart.on('click', (params: unknown) => {
      const p = params as { data?: [number, number, string, string, string] };
      if (p.data && p.data[2] && onSelectAirframe) {
        onSelectAirframe(p.data[2]);
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [advisories, parts, loading, onSelectAirframe]);

  return <div ref={chartRef} className="w-full h-72 cursor-pointer" />;
};

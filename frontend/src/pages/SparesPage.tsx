import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as echarts from 'echarts';
import {
  Package,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  CheckCircle2,
  Truck,
  ArrowUpRight,
  ExternalLink,
  History,
  ShieldAlert,
} from 'lucide-react';
import { KpiCard } from '../components/common/KpiCard';
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
    // 1. Aggregate stock across matching locations
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

    // 2. Aggregate demand & lowest RUL from ML advisories
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

    // 3. Build merged rows
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

      // Supply shortfall check:
      // Condition 1: Lead time exceeds remaining useful life of degraded component
      const has_lead_time_shortfall =
        min_rul_days !== null && p.lead_time_days > min_rul_days;

      // Condition 2: Net unreserved stock cannot satisfy 30-day demand
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

  // Filtered rows for data table
  const filteredRows = useMemo(() => {
    return mergedParts.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesPn = item.part_number.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesAc = item.affected_airframes.some((ac) => ac.toLowerCase().includes(q));
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

  // Critical Shortfall Alerts list (specifically highlighting lead time vs RUL risks like AC-017)
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
          <span className="font-bold text-white font-mono">{row.part_number}</span>
          <div className="text-[10px] text-slate-400">Crit: Tier {row.criticality}</div>
        </div>
      ),
    },
    {
      header: 'Description',
      render: (row) => (
        <div className="max-w-xs">
          <p className="text-slate-200 text-xs truncate" title={row.description}>
            {row.description}
          </p>
          {row.affected_airframes.length > 0 && (
            <div className="flex items-center space-x-1 mt-0.5">
              <span className="text-[10px] text-slate-500">Active Demand:</span>
              {row.affected_airframes.map((ac) => (
                <button
                  key={ac}
                  onClick={() => navigate(`/aircraft?id=${ac}`)}
                  className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-cyan-300 hover:underline border border-blue-800/40"
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
        <span className="font-mono font-semibold text-slate-200">{row.on_hand}</span>
      ),
    },
    {
      header: 'Reserved',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono font-semibold ${
            row.reserved > 0 ? 'text-amber-400' : 'text-slate-500'
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
          className={`font-mono font-bold ${
            row.available_net === 0 ? 'text-rose-400' : 'text-emerald-400'
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
          className={`font-mono ${
            row.on_order > 0 ? 'text-cyan-400 font-semibold' : 'text-slate-500'
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
          className={`font-mono ${
            row.has_lead_time_shortfall ? 'text-rose-400 font-bold' : 'text-slate-300'
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
          className={`font-mono font-semibold ${
            row.demand_30d > row.available_net ? 'text-rose-400' : 'text-slate-300'
          }`}
        >
          {row.demand_30d}
        </span>
      ),
    },
    {
      header: 'Reorder Lvl',
      align: 'right',
      render: (row) => <span className="font-mono text-slate-400">{row.reorder_level}</span>,
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
      render: (row) => <span className="font-mono font-bold text-white">{row.part_number}</span>,
    },
    {
      header: 'Date & Time',
      render: (row) => (
        <span className="text-slate-300">{new Date(row.date).toLocaleString()}</span>
      ),
    },
    {
      header: 'Movement Type',
      align: 'center',
      render: (row) => {
        const isIssue = row.type === 'issue';
        return (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
              isIssue
                ? 'bg-rose-950/70 text-rose-300 border border-rose-800/40'
                : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40'
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
          className={`font-mono font-bold ${
            row.type === 'issue' ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {row.type === 'issue' ? `-${row.qty}` : `+${row.qty}`}
        </span>
      ),
    },
    {
      header: 'Associated Work Order',
      render: (row) => (
        <span className="font-mono text-cyan-300">
          {row.work_order_id ? (
            <button
              onClick={() => navigate('/planning')}
              className="hover:underline flex items-center gap-1"
            >
              {row.work_order_id}
              <ArrowUpRight className="w-3 h-3 opacity-60" />
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-mono text-white tracking-tight">
              Spares & Inventory Intelligence
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Connecting predictive wear horizons, procurement lead times, and multi-echelon stock (§9 & §10)
            </p>
          </div>
        </div>

        {/* View / Location Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Location Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Warehouse:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">All Locations (Consolidated)</option>
              {locations.map((loc) => (
                <option key={loc} value={loc} className="bg-slate-900 text-white">
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700/80 rounded-lg p-1 text-xs font-mono">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3 py-1 rounded font-semibold transition ${
                activeTab === 'inventory'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Stock Status
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1 rounded font-semibold transition ${
                activeTab === 'transactions'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Material Movements
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Inventory & Supply Risk KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Tracked Catalog Parts"
          value={totalParts}
          subtitle="Critical LRUs & Assemblies"
          icon={<Package className="w-5 h-5" />}
          accent="blue"
          loading={isLoading}
        />

        <KpiCard
          title="Supply Shortfall Risks"
          value={shortCount}
          subtitle="Lead Time > RUL or Stockout"
          change={{
            value: shortCount > 0 ? 'Urgent PO Req.' : 'Protected',
            isPositive: shortCount === 0,
            label: 'Risk State',
          }}
          icon={<ShieldAlert className="w-5 h-5" />}
          accent="rose"
          loading={isLoading}
        />

        <KpiCard
          title="Total Physical On-Hand"
          value={totalOnHand}
          subtitle="Units across base & depot"
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="emerald"
          loading={isLoading}
        />

        <KpiCard
          title="On-Order Procurement Pipeline"
          value={totalOnOrder}
          subtitle="Incoming purchase deliveries"
          icon={<Truck className="w-5 h-5" />}
          accent="cyan"
          loading={isLoading}
        />
      </div>

      {/* 3. Critical Supply Shortfall Warning Banners (§9 & §10 Demo Story Step 7) */}
      {criticalShortfalls.length > 0 && (
        <div className="space-y-3 font-mono">
          {criticalShortfalls.map((sf) => (
            <div
              key={sf.part_number}
              className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-[#0e1629] border border-rose-600/60 rounded-xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2 bg-rose-600/20 border border-rose-500/40 rounded-lg text-rose-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-rose-600 text-white tracking-wider">
                      Supply Shortfall Alert
                    </span>
                    <span className="text-sm font-bold text-white">
                      P/N {sf.part_number} — {sf.description}
                    </span>
                  </div>

                  <p className="text-xs text-rose-200/90 leading-relaxed">
                    {sf.has_lead_time_shortfall ? (
                      <>
                        Lead time (<strong className="text-white">{sf.lead_time_days} days</strong>) exceeds
                        predicted component remaining life (
                        <strong className="text-rose-400">
                          RUL ~{sf.min_rul_days ? sf.min_rul_days.toFixed(1) : '12'} days
                        </strong>
                        ). Available unreserved stock: <strong className="text-white">{sf.available_net}</strong>{' '}
                        unit(s). Grounding will occur unless immediate emergency PO expediting is triggered.
                      </>
                    ) : (
                      <>
                        Projected 30-day demand (<strong className="text-white">{sf.demand_30d} units</strong>)
                        exceeds available net stock (<strong className="text-rose-400">{sf.available_net} units</strong>).
                        Reorder threshold breached.
                      </>
                    )}
                  </p>

                  {sf.affected_airframes.length > 0 && (
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 pt-0.5">
                      <span>Degrading Airframe(s):</span>
                      {sf.affected_airframes.map((ac) => (
                        <span key={ac} className="text-cyan-300 font-bold">
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
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700"
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
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow-lg shadow-rose-900/30"
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
          <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3 font-mono">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Demand vs. Stock Analysis (Critical LRUs)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Comparison of available on-hand stock against 30-day wear demand
                </p>
              </div>
              <span className="text-[10px] text-slate-500">Top 8 Parts</span>
            </div>

            <DemandVsStockChart parts={mergedParts.slice(0, 8)} loading={isLoading} />
          </div>

          {/* Chart 2: Lead Time vs RUL Scatter Plot */}
          <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3 font-mono">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-400" />
                  Lead Time vs. Remaining Useful Life (RUL)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Supply Risk Horizon: Parts plotted above the unity line (LT &gt; RUL) cause grounding
                </p>
              </div>
              <span className="text-[10px] text-rose-400 font-bold">Risk Zone: LT &gt; RUL</span>
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

      {/* 5. Inventory Stock Table & Filter Controls */}
      {activeTab === 'inventory' && (
        <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 text-[11px]">Filter Status:</span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All ({mergedParts.length})
              </button>
              <button
                onClick={() => setStatusFilter('short')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === 'short'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-rose-400 hover:text-rose-300 border border-slate-800'
                }`}
              >
                Shortfall ({mergedParts.filter((p) => p.status === 'short').length})
              </button>
              <button
                onClick={() => setStatusFilter('at_risk')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === 'at_risk'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-amber-400 hover:text-amber-300 border border-slate-800'
                }`}
              >
                At Risk ({mergedParts.filter((p) => p.status === 'at_risk').length})
              </button>
              <button
                onClick={() => setStatusFilter('ok')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === 'ok'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-emerald-400 hover:text-emerald-300 border border-slate-800'
                }`}
              >
                Nominal ({mergedParts.filter((p) => p.status === 'ok').length})
              </button>
            </div>

            {/* Right Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search part, description, airframe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700/80 text-white text-xs font-mono rounded-lg pl-8 pr-3 py-1.5 w-64 focus:outline-none focus:border-blue-500"
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
        <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-slate-200">
              <History className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm uppercase">Recent Warehouse Material Movements</h3>
            </div>
            <span className="text-slate-400 text-[11px]">Audit log of issues, receipts, and returns</span>
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
      chartInstance.current = echarts.init(chartRef.current, 'dark', { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    if (loading || parts.length === 0) {
      chart.showLoading();
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
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#0c1220',
        borderColor: '#1e293b',
        textStyle: { color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace' },
      },
      legend: {
        data: ['On-Hand', 'Reserved', 'On-Order', '30d Demand'],
        textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        top: 0,
        right: 10,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: {
          color: '#cbd5e1',
          fontSize: 10,
          fontFamily: 'monospace',
          interval: 0,
          rotate: 20,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Units',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          name: 'On-Hand',
          type: 'bar',
          data: onHandData,
          itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] },
          barGap: '10%',
        },
        {
          name: 'Reserved',
          type: 'bar',
          data: reservedData,
          itemStyle: { color: '#f59e0b', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: 'On-Order',
          type: 'bar',
          data: onOrderData,
          itemStyle: { color: '#06b6d4', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '30d Demand',
          type: 'bar',
          data: demandData,
          itemStyle: { color: '#f43f5e', borderRadius: [2, 2, 0, 0] },
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
      chartInstance.current = echarts.init(chartRef.current, 'dark', { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    if (loading) {
      chart.showLoading();
      return;
    }
    chart.hideLoading();

    const partsMap = new Map(parts.map((p) => [p.part_number, p]));

    // Construct data points: [RUL_days, LeadTime_days, Aircraft, Component, PartNumber, isShortfall]
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
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0c1220',
        borderColor: '#1e293b',
        textStyle: { color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: unknown) => {
          const p = params as {
            data: [number, number, string, string, string];
            seriesName: string;
          };
          const [rul, lt, ac, cmp, pn] = p.data;
          const isRisk = lt > rul;
          return `
            <div style="font-family: monospace;">
              <div style="font-weight: bold; color: ${isRisk ? '#f43f5e' : '#10b981'}; margin-bottom: 4px;">
                ${isRisk ? 'CRITICAL SUPPLY SHORTFALL' : 'NOMINAL SUPPLY HORIZON'}
              </div>
              <div>Airframe: <strong>${ac}</strong></div>
              <div>Component: <strong>${cmp}</strong></div>
              <div>Spare Part: <strong>${pn}</strong></div>
              <div style="margin-top: 4px; border-top: 1px solid #334155; padding-top: 4px;">
                Procurement Lead Time: <strong>${lt} days</strong><br/>
                Predicted Component RUL: <strong>${rul} days</strong>
              </div>
              <div style="color: ${isRisk ? '#fda4af' : '#6ee7b7'}; margin-top: 4px;">
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
        textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        top: 0,
        right: 10,
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '4%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Predicted RUL (Days)',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        min: 0,
        max: maxVal,
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Lead Time (Days)',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        min: 0,
        max: maxVal,
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        // Diagonal Unity line (LT = RUL)
        {
          name: 'Critical Horizon (LT = RUL)',
          type: 'line',
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
          symbol: 'none',
          lineStyle: {
            color: '#f43f5e',
            type: 'dashed',
            width: 1.5,
          },
          tooltip: { show: false },
        },
        // Safe Points
        {
          name: 'Safe Buffer (LT ≤ RUL)',
          type: 'scatter',
          data: safePoints,
          symbolSize: 10,
          itemStyle: {
            color: '#10b981',
            shadowBlur: 4,
            shadowColor: 'rgba(16, 185, 129, 0.4)',
          },
        },
        // High Risk Points
        {
          name: 'Shortfall Risk (LT > RUL)',
          type: 'scatter',
          data: highRiskPoints,
          symbolSize: 14,
          itemStyle: {
            color: '#f43f5e',
            borderColor: '#ffffff',
            borderWidth: 1.5,
            shadowBlur: 8,
            shadowColor: 'rgba(244, 63, 94, 0.8)',
          },
        },
      ],
    };

    chart.setOption(option, true);

    // Click handler to navigate to airframe
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

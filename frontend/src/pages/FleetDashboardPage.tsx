import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Filter,
  Plane,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { TimeSeriesChart } from '../components/common/TimeSeriesChart';
import { Heatgrid, type HeatgridCell } from '../components/common/Heatgrid';
import { useAuth } from '../hooks/useAuth';
import { useKpis, useFleetSummary, useAvailabilityTrend } from '../hooks/useAvailabilityQueries';
import { useFleetTwin } from '../hooks/useTwinQueries';
import { useAdvisories, useAlerts } from '../hooks/useEngineQueries';
import { useWorkOrders } from '../hooks/useMaintenanceQueries';
import { useSystems, useAircraftList } from '../hooks/useFleetQueries';
import type { AdvisoryOut, WorkOrderOut } from '../types/api';

export const FleetDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { asOfDate } = useAuth();

  // Filters state
  const [selectedBase, setSelectedBase] = useState<string>('all');
  const [selectedSystem, setSelectedSystem] = useState<string>('all');

  // API Queries
  const { data: summary, isLoading: loadingSummary } = useFleetSummary(asOfDate);
  const { data: kpis, isLoading: loadingKpis } = useKpis(asOfDate);
  const { data: trendData, isLoading: loadingTrend } = useAvailabilityTrend(30, asOfDate);
  const { data: fleetTwin, isLoading: loadingTwin } = useFleetTwin(asOfDate);
  const { data: systemsData } = useSystems();
  const { data: aircraftData } = useAircraftList({ page_size: 100 });
  const { data: topAdvisories, isLoading: loadingAdvisories } = useAdvisories({
    status: 'proposed',
    page_size: 10,
  });
  const { data: upcomingOrders, isLoading: loadingOrders } = useWorkOrders({
    page_size: 8,
  });
  const { data: alertsData } = useAlerts({ acknowledged: false, page_size: 3 });

  // Map of aircraft_id -> base_id
  const aircraftBaseMap = useMemo(() => {
    const map = new Map<string, string>();
    aircraftData?.items.forEach((a) => {
      if (a.base_id) map.set(a.aircraft_id, a.base_id);
    });
    return map;
  }, [aircraftData]);

  // Dynamic Base Dropdown Options
  const baseOptions = useMemo(() => {
    if (!aircraftData?.items) {
      return [
        { value: 'all', label: 'All Squadrons' },
        { value: 'BASE-NORTH', label: 'Base-North (Forward)' },
        { value: 'BASE-SOUTH', label: 'Base-South (Main)' },
        { value: 'BASE-EAST', label: 'Base-East' },
        { value: 'BASE-WEST', label: 'Base-West' },
      ];
    }
    const rawBases = Array.from(new Set(aircraftData.items.map((a) => a.base_id).filter(Boolean))) as string[];
    const sorted = rawBases.sort();
    return [
      { value: 'all', label: 'All Squadrons' },
      ...sorted.map((b) => {
        let label = b;
        if (b.toUpperCase() === 'BASE-NORTH') label = 'Base-North (Forward)';
        else if (b.toUpperCase() === 'BASE-SOUTH') label = 'Base-South (Main Depot)';
        else if (b.toUpperCase() === 'BASE-EAST') label = 'Base-East';
        else if (b.toUpperCase() === 'BASE-WEST') label = 'Base-West';
        return { value: b, label };
      }),
    ];
  }, [aircraftData]);

  // 1. Prepare Availability Trend Series with Forecast Shading
  const { trendSeries, forecastStart } = useMemo(() => {
    if (!trendData || !trendData.points || trendData.points.length === 0) {
      return { trendSeries: [], forecastStart: undefined };
    }

    const actualOrP50: Array<[string, number]> = [];
    const p10Data: Array<[string, number]> = [];
    const p90Data: Array<[string, number]> = [];
    let firstForecastDate: string | undefined = undefined;

    trendData.points.forEach((pt) => {
      actualOrP50.push([pt.date, Number(pt.avail.toFixed(1))]);
      if (pt.is_forecast) {
        if (!firstForecastDate) firstForecastDate = pt.date;
        if (pt.p10 !== null) p10Data.push([pt.date, Number(pt.p10.toFixed(1))]);
        if (pt.p90 !== null) p90Data.push([pt.date, Number(pt.p90.toFixed(1))]);
      }
    });

    const series: Array<{
      name: string;
      data: Array<[string, number]>;
      color: string;
      area?: boolean;
      dashed?: boolean;
    }> = [
      {
        name: 'Availability (Median)',
        data: actualOrP50,
        color: '#2F5D8A',
        area: true,
      },
    ];

    if (p90Data.length > 0) {
      series.push({
        name: 'P90 (Optimistic)',
        data: p90Data,
        color: '#2E7D4F',
        area: false,
        dashed: true,
      });
    }

    if (p10Data.length > 0) {
      series.push({
        name: 'P10 (Stress Lower)',
        data: p10Data,
        color: '#B3402F',
        area: false,
        dashed: true,
      });
    }

    return { trendSeries: series, forecastStart: firstForecastDate };
  }, [trendData]);

  // 2. Prepare Heatgrid Matrix Cells
  const heatgridCells: HeatgridCell[] = useMemo(() => {
    if (!fleetTwin || !fleetTwin.aircraft) return [];

    const cells: HeatgridCell[] = [];
    const systemsList = systemsData || [
      { system_id: 'sys-1', name: 'Propulsion' },
      { system_id: 'sys-2', name: 'Hydraulics' },
      { system_id: 'sys-3', name: 'Electrical' },
      { system_id: 'sys-4', name: 'Landing gear' },
      { system_id: 'sys-5', name: 'Avionics' },
      { system_id: 'sys-6', name: 'Fuel' },
      { system_id: 'sys-7', name: 'Environmental (ECS)' },
    ];

    fleetTwin.aircraft.forEach((ac) => {
      // Filter by Base if specified
      if (selectedBase !== 'all') {
        const acBase = aircraftBaseMap.get(ac.aircraft_id);
        if (acBase && acBase.toLowerCase() !== selectedBase.toLowerCase()) {
          return;
        }
      }

      // Filter by system if specified
      systemsList.forEach((sys) => {
        if (selectedSystem !== 'all') {
          const sysName = sys.name.toLowerCase();
          const target = selectedSystem.toLowerCase();
          if (!sysName.includes(target) && !target.includes(sysName)) {
            return;
          }
        }

        // Check if driver component belongs to this system
        const isDriverSystem = ac.driver_component?.system_name.toLowerCase().includes(sys.name.toLowerCase());
        const healthIndex = isDriverSystem && ac.driver_component ? ac.driver_component.health_index : ac.health_index;
        const status = isDriverSystem && ac.driver_component ? ac.driver_component.state : ac.state;

        cells.push({
          aircraftId: ac.aircraft_id,
          tailCode: ac.tail_code,
          systemId: sys.system_id,
          systemName: sys.name,
          healthIndex: Number(healthIndex.toFixed(1)),
          status,
          driverComponent: isDriverSystem ? ac.driver_component?.component_name : undefined,
        });
      });
    });

    return cells;
  }, [fleetTwin, systemsData, selectedSystem, selectedBase, aircraftBaseMap]);

  // 3. Advisory Table Columns
  const advisoryColumns: Column<AdvisoryOut>[] = [
    {
      header: 'Priority',
      align: 'center',
      render: (row) => <StatusBadge status={row.priority} size="sm" />,
    },
    {
      header: 'Airframe',
      render: (row) => (
        <span className="font-semibold text-[#1A1A1A] hover:text-[#2F5D8A] cursor-pointer">
          {row.tail_code || row.aircraft_id}
        </span>
      ),
    },
    {
      header: 'System / Component',
      render: (row) => (
        <div>
          <div className="text-[#1A1A1A] font-medium">{row.component_name || row.component_id}</div>
          <div className="text-[11px] text-[#5C5C57]">{row.system_name || 'System'}</div>
        </div>
      ),
    },
    {
      header: 'Recommended Action',
      render: (row) => (
        <span className="text-[#A66A00] font-medium">
          {row.action}
        </span>
      ),
    },
    {
      header: 'Spares',
      align: 'center',
      render: (row) => <StatusBadge status={row.spare_status || 'in_stock'} size="sm" />,
    },
    {
      header: 'Loss (Days)',
      align: 'right',
      render: (row) => (
        <span className="text-[#1A1A1A] tabular-nums">
          {row.expected_downtime_days ? `${row.expected_downtime_days}d` : '—'}
        </span>
      ),
    },
    {
      header: 'Inspect',
      align: 'center',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/components/${row.component_id}`);
          }}
          className="py-0.5 px-2 text-[11px] bg-white hover:bg-[#F6F6F3] text-[#2F5D8A] rounded border border-[#E3E3DE] transition font-mono"
        >
          View Evidence
        </button>
      ),
    },
  ];

  // 4. Upcoming Work Orders Table Columns
  const workOrderColumns: Column<WorkOrderOut>[] = [
    {
      header: 'WO ID',
      render: (row) => <span className="text-[#5C5C57] font-mono">{row.wo_id}</span>,
    },
    {
      header: 'Airframe',
      render: (row) => <span className="text-[#1A1A1A] font-semibold">{row.aircraft_id}</span>,
    },
    {
      header: 'Agency / Bay',
      render: (row) => <span className="text-[#5C5C57]">{row.agency_id}</span>,
    },
    {
      header: 'Priority',
      align: 'center',
      render: (row) => <StatusBadge status={row.priority} size="sm" />,
    },
    {
      header: 'Status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      header: 'Delay Reason',
      render: (row) => (
        <span className="text-[#B3402F] text-[11px] truncate max-w-[160px] block">
          {row.delay_reason || 'Nominal execution'}
        </span>
      ),
    },
  ];

  const downtime = kpis?.downtime_by_cause;
  const stateBreakdown = summary?.by_state || {};

  // Filtered Advisories based on selectedSystem and selectedBase
  const filteredAdvisories = useMemo(() => {
    if (!topAdvisories?.items) return [];
    return topAdvisories.items.filter((adv) => {
      if (selectedSystem !== 'all' && adv.system_name) {
        const sysName = adv.system_name.toLowerCase();
        const target = selectedSystem.toLowerCase();
        if (!sysName.includes(target) && !target.includes(sysName)) return false;
      }
      if (selectedBase !== 'all' && adv.aircraft_id) {
        const acBase = aircraftBaseMap.get(adv.aircraft_id);
        if (acBase && acBase.toLowerCase() !== selectedBase.toLowerCase()) return false;
      }
      return true;
    });
  }, [topAdvisories, selectedSystem, selectedBase, aircraftBaseMap]);

  // Filtered Work Orders based on selectedBase
  const filteredWorkOrders = useMemo(() => {
    if (!upcomingOrders?.items) return [];
    return upcomingOrders.items.filter((wo) => {
      if (selectedBase !== 'all' && wo.aircraft_id) {
        const acBase = aircraftBaseMap.get(wo.aircraft_id);
        if (acBase && acBase.toLowerCase() !== selectedBase.toLowerCase()) return false;
      }
      return true;
    });
  }, [upcomingOrders, selectedBase, aircraftBaseMap]);

  // Base-scoped aircraft for KPI calculation
  const baseAircraft = useMemo(() => {
    if (!aircraftData?.items) return [];
    if (selectedBase === 'all') return aircraftData.items;
    return aircraftData.items.filter((a) => a.base_id?.toLowerCase() === selectedBase.toLowerCase());
  }, [aircraftData, selectedBase]);

  // Base-scoped or fleet-wide availability calculation
  const displayedAvailability = useMemo(() => {
    if (selectedBase === 'all') {
      return (summary?.availability_pct ?? kpis?.fleet_availability_pct ?? 0).toFixed(1);
    }
    if (baseAircraft.length === 0) return '0.0';
    const availCount = baseAircraft.filter((a) => a.current_status.toLowerCase() === 'available').length;
    return ((availCount / baseAircraft.length) * 100).toFixed(1);
  }, [selectedBase, baseAircraft, summary, kpis]);

  // Base-scoped or fleet-wide serviceable breakdown
  const displayedServiceable = useMemo(() => {
    if (selectedBase === 'all') {
      return {
        count: summary?.serviceable_count ?? '—',
        total: summary?.total_aircraft ?? 40,
        sub: `${stateBreakdown['Unscheduled Repair'] || 0} unscheduled • ${stateBreakdown['Awaiting Spares'] || 0} supply hold`,
      };
    }
    const avail = baseAircraft.filter((a) => a.current_status.toLowerCase() === 'available').length;
    const unsched = baseAircraft.filter((a) => a.current_status.toLowerCase().includes('unscheduled') || a.current_status.toLowerCase().includes('repair')).length;
    const supply = baseAircraft.filter((a) => a.current_status.toLowerCase().includes('spares') || a.current_status.toLowerCase().includes('supply')).length;
    return {
      count: avail,
      total: baseAircraft.length,
      sub: `${unsched} unscheduled • ${supply} supply hold`,
    };
  }, [selectedBase, baseAircraft, summary, stateBreakdown]);

  const p1Count = useMemo(() => filteredAdvisories.filter((a) => a.priority === 'P1').length, [filteredAdvisories]);
  const p2Count = useMemo(() => filteredAdvisories.filter((a) => a.priority === 'P2').length, [filteredAdvisories]);
  const totalActiveAdvisories = useMemo(() => {
    if (selectedSystem === 'all' && selectedBase === 'all') {
      return (summary?.open_p1 || 0) + (summary?.open_p2 || 0);
    }
    return p1Count + p2Count;
  }, [selectedSystem, selectedBase, summary, p1Count, p2Count]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Alerts Banner Strip (Calm red tint with text) */}
      {alertsData && alertsData.items.length > 0 && (
        <div className="bg-[#FDF2F0] border border-[#F5C2BC] rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-[#B3402F]">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#B3402F] shrink-0" />
            <span className="font-semibold uppercase tracking-wider">Operational Alert:</span>
            <span className="text-[#1A1A1A] truncate max-w-2xl">{alertsData.items[0].message}</span>
          </div>
          <button
            onClick={() => navigate('/advisories')}
            className="text-[11px] text-[#2F5D8A] hover:underline flex items-center gap-1 font-semibold flex-shrink-0"
          >
            Review Queue ({alertsData.total}) <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. Top Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] tracking-tight">
            Fleet operational cockpit
          </h1>
          <p className="text-xs text-[#5C5C57] mt-0.5">
            Integrated fleet availability, degradation signals, and turnaround bottlenecks
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-[#5C5C57]" />
            <span className="text-[#5C5C57]">System:</span>
            <select
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
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

          <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1">
            <Plane className="w-3.5 h-3.5 text-[#5C5C57]" />
            <span className="text-[#5C5C57]">Base:</span>
            <select
              value={selectedBase}
              onChange={(e) => setSelectedBase(e.target.value)}
              className="bg-transparent text-[#1A1A1A] focus:outline-none cursor-pointer border-none p-0"
            >
              {baseOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {(selectedSystem !== 'all' || selectedBase !== 'all') && (
            <button
              onClick={() => {
                setSelectedSystem('all');
                setSelectedBase('all');
              }}
              className="px-2 py-1 text-[11px] text-[#2F5D8A] bg-[#EBF2F7] hover:bg-[#DCE7F0] border border-[#C5D7E8] rounded font-mono transition"
            >
              Reset Filters ×
            </button>
          )}
        </div>
      </div>

      {/* 3. Compact Horizontal Metric Summary Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE]">
        {/* Metric 1 */}
        <div
          onClick={() => navigate('/scenarios')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            {selectedBase === 'all' ? 'Fleet Availability (Ao)' : `${selectedBase} Availability`}
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {loadingSummary && loadingKpis ? '—' : `${displayedAvailability}%`}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">
              {selectedBase === 'all' ? '/ target ≥75%' : `/ ${baseAircraft.length} squadron total`}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57] flex justify-between">
            <span>Forecast 30d: 74.2%</span>
            <span className="text-[#B3402F] font-mono font-medium">↓ -0.8%</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div
          onClick={() => navigate('/aircraft')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Serviceable Airframes
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {displayedServiceable.count}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">
              / {displayedServiceable.total} {selectedBase === 'all' ? 'fleet' : 'squadron'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57] truncate">
            {displayedServiceable.sub}
          </div>
        </div>

        {/* Metric 3 */}
        <div
          onClick={() => navigate('/advisories')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            P1 / P2 Active Advisories
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {totalActiveAdvisories}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">
              {selectedSystem !== 'all' || selectedBase !== 'all' ? 'matching items' : 'action items'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            <span className="text-[#B3402F] font-semibold">{selectedSystem === 'all' && selectedBase === 'all' ? (summary?.open_p1 || 0) : p1Count} Critical</span> •{' '}
            <span className="text-[#A66A00] font-semibold">{selectedSystem === 'all' && selectedBase === 'all' ? (summary?.open_p2 || 0) : p2Count} High</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div
          onClick={() => navigate('/spares')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Spares at Risk & Backlog
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {summary?.parts_at_risk || 0}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">critical parts</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57] truncate">
            {kpis?.backlog.open_orders || summary?.backlog.open_orders || 0} open WOs ({Math.round(kpis?.backlog.outstanding_man_hours || 0)} hrs)
          </div>
        </div>
      </div>

      {/* 4. Charts Row: Availability Trend + Downtime by Cause */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Availability Trend Line Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-[#E3E3DE] rounded p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Fleet Availability Timeline & 30-Day Forward Projection
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Observed availability with P10 / P50 / P90 Monte Carlo projection
              </p>
            </div>
            {forecastStart && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E3E3DE] text-[#5C5C57]">
                Forecast from: {forecastStart}
              </span>
            )}
          </div>

          <TimeSeriesChart
            height={240}
            series={trendSeries}
            forecastStartDate={forecastStart}
            yAxisLabel="Availability %"
            yAxisMin={50}
            yAxisMax={100}
            loading={loadingTrend}
          />
        </div>

        {/* Downtime by Cause (1 Col) */}
        <div className="bg-white border border-[#E3E3DE] rounded p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A] mb-1">
              Downtime Loss Breakdown
            </h3>
            <p className="text-[11px] text-[#5C5C57] mb-3">
              Cumulative aircraft-days lost by operational root cause
            </p>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <div className="flex justify-between text-[#1A1A1A] mb-1 text-[11px]">
                  <span>Scheduled Inspections</span>
                  <span className="font-semibold text-[#2F5D8A]">
                    {downtime ? `${downtime.scheduled_days}d (${downtime.scheduled_pct.toFixed(0)}%)` : '—'}
                  </span>
                </div>
                <div className="w-full bg-[#ECECE8] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#2F5D8A] h-full rounded-full"
                    style={{ width: `${downtime?.scheduled_pct || 40}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A1A1A] mb-1 text-[11px]">
                  <span>Unscheduled Repairs</span>
                  <span className="font-semibold text-[#A66A00]">
                    {downtime ? `${downtime.unscheduled_days}d (${downtime.unscheduled_pct.toFixed(0)}%)` : '—'}
                  </span>
                </div>
                <div className="w-full bg-[#ECECE8] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#A66A00] h-full rounded-full"
                    style={{ width: `${downtime?.unscheduled_pct || 25}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A1A1A] mb-1 text-[11px]">
                  <span>Supply Wait (Parts Stockout)</span>
                  <span className="font-semibold text-[#B3402F]">
                    {downtime ? `${downtime.supply_wait_days}d (${downtime.supply_wait_pct.toFixed(0)}%)` : '—'}
                  </span>
                </div>
                <div className="w-full bg-[#ECECE8] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#B3402F] h-full rounded-full"
                    style={{ width: `${downtime?.supply_wait_pct || 20}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A1A1A] mb-1 text-[11px]">
                  <span>Workshop / Agency Bay Queue</span>
                  <span className="font-semibold text-[#5C5C57]">
                    {downtime ? `${downtime.agency_wait_days}d (${downtime.agency_wait_pct.toFixed(0)}%)` : '—'}
                  </span>
                </div>
                <div className="w-full bg-[#ECECE8] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#7A7A75] h-full rounded-full"
                    style={{ width: `${downtime?.agency_wait_pct || 15}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#ECECE8] flex items-center justify-between text-xs font-mono text-[#5C5C57]">
            <span>Total Lost Days:</span>
            <span className="font-semibold text-[#1A1A1A]">
              {downtime ? `${downtime.total_downtime_days} Days` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Aircraft × System Health Heat-Grid */}
      <Heatgrid
        cells={heatgridCells}
        loading={loadingTwin}
        onCellClick={(aircraftId) => {
          navigate(`/aircraft?id=${aircraftId}`);
        }}
      />

      {/* 6. Clean Operations Impact Summary (No gradients, no AI glow) */}
      <div className="bg-[#FAFAF8] border border-[#E3E3DE] rounded p-4 font-mono space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#ECECE8]">
          <h3 className="font-semibold text-xs uppercase tracking-wider text-[#1A1A1A]">
            Integrated Maintenance & Availability Impact Summary
          </h3>
          <span className="text-[11px] font-mono text-[#5C5C57]">
            Synthetic telemetry demonstration
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-white border border-[#E3E3DE] rounded p-3 space-y-1">
            <div className="text-[#5C5C57] text-[11px]">Availability Uplift</div>
            <div className="text-lg font-semibold text-[#2E7D4F] tabular-nums">+7.8% Uplift</div>
            <p className="text-[11px] text-[#5C5C57] leading-snug">
              Fleet readiness elevated from ~74.2% reactive baseline to ~82.0% continuous availability.
            </p>
          </div>

          <div className="bg-white border border-[#E3E3DE] rounded p-3 space-y-1">
            <div className="text-[#5C5C57] text-[11px]">Downtime Reduction</div>
            <div className="text-lg font-semibold text-[#2F5D8A] tabular-nums">-6.5 Days / Defect</div>
            <p className="text-[11px] text-[#5C5C57] leading-snug">
              Proactive bundled bay slot requires 2.5d vs 9.0d run-to-failure unscheduled grounding.
            </p>
          </div>

          <div className="bg-white border border-[#E3E3DE] rounded p-3 space-y-1">
            <div className="text-[#5C5C57] text-[11px]">Advance Early Warning</div>
            <div className="text-lg font-semibold text-[#2F5D8A] tabular-nums">19 Days Lead-Time</div>
            <p className="text-[11px] text-[#5C5C57] leading-snug">
              Telemetry anomaly flags deteriorating pump ~19 days prior to functional failure.
            </p>
          </div>

          <div className="bg-white border border-[#E3E3DE] rounded p-3 space-y-1">
            <div className="text-[#5C5C57] text-[11px]">Supply Risk Avoidance</div>
            <div className="text-lg font-semibold text-[#A66A00] tabular-nums">Zero Spares AOG</div>
            <p className="text-[11px] text-[#5C5C57] leading-snug">
              Integrated logistics triggers 45-day lead-time procurement before depot stockout.
            </p>
          </div>
        </div>
      </div>

      {/* 7. Lower Tables Row: Top Risk Advisories + Upcoming Work Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Advisories Table */}
        <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Top Priority Maintenance Advisories
              </h3>
              {(selectedSystem !== 'all' || selectedBase !== 'all') && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EDF2F7] text-[#2F5D8A] rounded">
                  {filteredAdvisories.length} filtered
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/advisories')}
              className="text-[11px] font-mono text-[#2F5D8A] hover:underline flex items-center gap-1 font-medium"
            >
              Full Queue <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <DataTable
            columns={advisoryColumns}
            data={filteredAdvisories}
            loading={loadingAdvisories}
            emptyTitle="No Active Advisories"
            emptyMessage="No open advisories match the active system and base filters."
            onRowClick={(row) => navigate(`/components/${row.component_id}`)}
          />
        </div>

        {/* Upcoming Work Orders */}
        <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Active & Upcoming Work Orders
              </h3>
              {selectedBase !== 'all' && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EDF2F7] text-[#2F5D8A] rounded">
                  {filteredWorkOrders.length} filtered
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/planning')}
              className="text-[11px] font-mono text-[#2F5D8A] hover:underline flex items-center gap-1 font-medium"
            >
              Planning Board <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <DataTable
            columns={workOrderColumns}
            data={filteredWorkOrders}
            loading={loadingOrders}
            emptyTitle="No Active Work Orders"
            emptyMessage="No open work orders currently scheduled for this squadron selection."
            onRowClick={() => navigate('/planning')}
          />
        </div>
      </div>
    </div>
  );
};

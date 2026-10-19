import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldAlert,
  Layers,
  TrendingDown,
  History,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { TimeSeriesChart } from '../components/common/TimeSeriesChart';
import { SvgSchematic, type SystemStatusInfo } from '../components/common/SvgSchematic';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useAircraftList, useAircraftDetail } from '../hooks/useFleetQueries';
import { useAircraftTwin } from '../hooks/useTwinQueries';
import { useWorkOrders } from '../hooks/useMaintenanceQueries';
import { useAdvisories } from '../hooks/useEngineQueries';
import type {
  TwinComponentNodeOut,
  TwinMaintenanceEvent,
  WorkOrderOut,
} from '../types/api';

export const AircraftDetailPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { asOfDate } = useAuth();

  // Active airframe ID from URL param or default
  const requestedId = searchParams.get('id') || '';

  // Tabs: 'schematic' | 'twin' | 'orders'
  const [activeTab, setActiveTab] = useState<'schematic' | 'twin' | 'orders'>('schematic');
  const [selectedSystemName, setSelectedSystemName] = useState<string | null>(null);

  // Queries
  const { data: aircraftListData, isLoading: loadingList } = useAircraftList({ page_size: 100 });
  const allAircraft = aircraftListData?.items || [];

  // Default to requested ID or hero aircraft AC-017 or first aircraft
  const activeAircraftId = useMemo(() => {
    if (requestedId && allAircraft.some((a) => a.aircraft_id === requestedId)) {
      return requestedId;
    }
    const hero = allAircraft.find((a) => a.tail_code === 'AC-017' || a.aircraft_id === 'AC-017');
    if (hero) return hero.aircraft_id;
    return allAircraft[0]?.aircraft_id || '';
  }, [requestedId, allAircraft]);

  useEffect(() => {
    if (activeAircraftId && requestedId !== activeAircraftId) {
      setSearchParams({ id: activeAircraftId }, { replace: true });
    }
  }, [activeAircraftId, requestedId, setSearchParams]);

  const { data: aircraftDetail } = useAircraftDetail(activeAircraftId);
  const { data: twinData, isLoading: loadingTwin } = useAircraftTwin(activeAircraftId, asOfDate);
  const { data: workOrdersData, isLoading: loadingOrders } = useWorkOrders({
    aircraft: activeAircraftId,
    page_size: 20,
  });
  const { data: advisoriesData } = useAdvisories({
    aircraft_id: activeAircraftId,
    as_of_date: asOfDate || undefined,
    page_size: 10,
  });

  // Switch aircraft handler
  const handleSelectAircraft = (id: string) => {
    setSearchParams({ id });
    setSelectedSystemName(null);
  };

  // Prepare systems for SVG Schematic
  const schematicSystems: SystemStatusInfo[] = useMemo(() => {
    if (!twinData || !twinData.systems) return [];
    return twinData.systems.map((s) => ({
      name: s.system_name,
      healthIndex: Number(s.health_index.toFixed(1)),
      status: s.state,
      driverComponent: s.driver_component?.component_name,
    }));
  }, [twinData]);

  // Flatten or filter components
  const displayedComponents: TwinComponentNodeOut[] = useMemo(() => {
    if (!twinData || !twinData.systems) return [];
    let list: TwinComponentNodeOut[] = [];
    twinData.systems.forEach((sys) => {
      if (
        !selectedSystemName ||
        sys.system_name.toLowerCase().includes(selectedSystemName.toLowerCase()) ||
        selectedSystemName.toLowerCase().includes(sys.system_name.toLowerCase())
      ) {
        list = list.concat(sys.components);
      }
    });
    // Sort components: lowest health index first (worst performing on top)
    return list.sort((a, b) => a.health_index - b.health_index);
  }, [twinData, selectedSystemName]);

  // Prepare Digital Twin Trajectory Series
  const { trajectorySeries, forecastStart } = useMemo(() => {
    if (!twinData || !twinData.predicted_trajectory || twinData.predicted_trajectory.length === 0) {
      return { trajectorySeries: [], forecastStart: undefined };
    }

    const hiData: Array<[string, number]> = [];
    const riskData: Array<[string, number]> = [];
    let firstForecast: string | undefined = undefined;

    twinData.predicted_trajectory.forEach((pt) => {
      hiData.push([pt.date, Number(pt.health_index.toFixed(1))]);
      if (pt.risk !== null && pt.risk !== undefined) {
        riskData.push([pt.date, Number((pt.risk * 100).toFixed(1))]);
      }
      if (pt.is_forecast && !firstForecast) {
        firstForecast = pt.date;
      }
    });

    const series = [
      {
        name: 'Airframe Health Index',
        data: hiData,
        color: '#2F5D8A',
        area: true,
      },
      {
        name: 'Failure Risk (%)',
        data: riskData,
        color: '#B3402F',
        area: false,
        dashed: true,
      },
    ];

    return { trajectorySeries: series, forecastStart: firstForecast };
  }, [twinData]);

  // Component Table Columns
  const componentColumns: Column<TwinComponentNodeOut>[] = [
    {
      header: 'Component',
      render: (row) => (
        <div>
          <span className="font-semibold text-[#1A1A1A]">{row.component_name}</span>
          <div className="text-[11px] text-[#5C5C57] font-mono">
            PN: {row.part_number} • SN: {row.serial_number}
          </div>
        </div>
      ),
    },
    {
      header: 'System',
      accessorKey: 'system_name',
    },
    {
      header: 'Criticality',
      align: 'center',
      render: (row) => (
        <span
          className={`font-mono font-medium text-xs ${
            row.criticality >= 4 ? 'text-[#B3402F]' : row.criticality === 3 ? 'text-[#A66A00]' : 'text-[#5C5C57]'
          }`}
        >
          Level {row.criticality}
        </span>
      ),
    },
    {
      header: 'Health Index',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center space-x-1.5">
          <span
            className={`font-mono font-semibold text-xs tabular-nums ${
              row.health_index >= 75
                ? 'text-[#2E7D4F]'
                : row.health_index >= 50
                ? 'text-[#A66A00]'
                : 'text-[#B3402F]'
            }`}
          >
            {row.health_index.toFixed(1)}
          </span>
          <StatusBadge status={row.state} size="sm" />
        </div>
      ),
    },
    {
      header: '14d Risk',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums ${
            (row.risk ?? 0) >= 0.5 ? 'text-[#B3402F]' : (row.risk ?? 0) >= 0.2 ? 'text-[#A66A00]' : 'text-[#5C5C57]'
          }`}
        >
          {row.risk !== null && row.risk !== undefined ? `${(row.risk * 100).toFixed(0)}%` : '—'}
        </span>
      ),
    },
    {
      header: 'RUL (P50)',
      align: 'right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums ${
            (row.rul_p50 ?? 99) <= 14 ? 'text-[#B3402F]' : (row.rul_p50 ?? 99) <= 30 ? 'text-[#A66A00]' : 'text-[#1A1A1A]'
          }`}
        >
          {row.rul_p50 !== null && row.rul_p50 !== undefined ? `${Math.round(row.rul_p50)} days` : '—'}
        </span>
      ),
    },
    {
      header: 'Evidence',
      align: 'center',
      render: (row) => (
        <button
          onClick={() => navigate(`/components/${row.component_id}`)}
          className="py-0.5 px-2 bg-white hover:bg-[#F6F6F3] text-[#2F5D8A] rounded text-[11px] font-mono border border-[#E3E3DE] transition flex items-center gap-1"
        >
          Telemetry <ArrowRight className="w-3 h-3" />
        </button>
      ),
    },
  ];

  // Work Order Columns
  const workOrderColumns: Column<WorkOrderOut>[] = [
    {
      header: 'WO ID',
      render: (row) => <span className="font-mono text-[#5C5C57]">{row.wo_id}</span>,
    },
    {
      header: 'Agency / Bay',
      render: (row) => <span className="text-[#1A1A1A]">{row.agency_id}</span>,
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
      header: 'Opened',
      render: (row) => <span className="text-[#5C5C57] font-mono">{new Date(row.opened).toLocaleDateString()}</span>,
    },
    {
      header: 'Promised vs Actual',
      render: (row) => (
        <span className="text-[#1A1A1A] font-mono text-[11px]">
          {row.promised_done ? new Date(row.promised_done).toLocaleDateString() : '—'} /{' '}
          {row.actual_done ? new Date(row.actual_done).toLocaleDateString() : 'Pending'}
        </span>
      ),
    },
    {
      header: 'Delay Reason',
      render: (row) => (
        <span className={`text-[11px] ${row.delay_reason ? 'text-[#B3402F] font-semibold' : 'text-[#5C5C57]'}`}>
          {row.delay_reason || 'On Schedule'}
        </span>
      ),
    },
  ];

  // Maintenance History Columns
  const historyColumns: Column<TwinMaintenanceEvent>[] = [
    {
      header: 'Date',
      render: (row) => <span className="font-mono text-[#1A1A1A]">{row.date}</span>,
    },
    {
      header: 'Event Type',
      align: 'center',
      render: (row) => <StatusBadge status={row.event_type} size="sm" />,
    },
    {
      header: 'Action / Description',
      render: (row) => <span className="text-[#1A1A1A]">{row.description}</span>,
    },
    {
      header: 'Status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
  ];

  if (loadingList && !activeAircraftId) {
    return <LoadingSkeleton rows={6} />;
  }

  const driver = twinData?.driver_component;
  const openAdvisoriesCount = advisoriesData?.total || 0;
  const openOrdersCount = workOrdersData?.items.filter((w) => w.status !== 'completed').length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Airframe Selector & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div className="flex items-center space-x-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] tracking-tight">
                {twinData?.tail_code || activeAircraftId}
              </h1>
              <span className="text-xs font-mono text-[#5C5C57]">
                ({twinData?.type_code || aircraftDetail?.type_code || 'Trainer Jet'})
              </span>
              {activeAircraftId === 'AC-017' && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FEF7ED] text-[#A66A00] border border-[#F8DCB5] font-semibold">
                  Scripted Hero Airframe
                </span>
              )}
            </div>
            <p className="text-xs text-[#5C5C57] font-mono mt-0.5">
              Commissioned: {aircraftDetail?.commissioned_date || '2023-01-15'} • Base:{' '}
              {aircraftDetail?.base_id || 'Base-North'}
            </p>
          </div>
        </div>

        {/* Airframe Switcher & What-If Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1 text-xs font-mono">
            <span className="text-[#5C5C57]">Switch Airframe:</span>
            <select
              value={activeAircraftId}
              onChange={(e) => handleSelectAircraft(e.target.value)}
              className="bg-transparent text-[#1A1A1A] font-semibold focus:outline-none cursor-pointer border-none p-0"
            >
              {allAircraft.map((ac) => (
                <option key={ac.aircraft_id} value={ac.aircraft_id}>
                  {ac.tail_code} ({ac.current_status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => navigate(`/scenarios?aircraft=${activeAircraftId}`)}
            className="py-1 px-3 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-mono font-medium flex items-center space-x-1.5 transition"
          >
            <span>Launch What-If Simulator</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Metric Summary Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE]">
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Airframe Health Index
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {twinData ? twinData.health_index.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            {twinData?.risk ? `${(twinData.risk * 100).toFixed(0)}% 14d Risk` : 'Nominal serviceability'}
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Operational State
          </div>
          <div className="mt-2">
            <StatusBadge status={twinData?.state || aircraftDetail?.current_status || 'Available'} size="md" />
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Fleet availability state
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Flight Hours & Cycles
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {aircraftDetail ? Math.round(aircraftDetail.total_flight_hours) : '—'}h
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">
              ({aircraftDetail?.total_cycles || 0} cycles)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#2E7D4F] font-mono">
            Inspection compliant
          </div>
        </div>

        <div
          onClick={() => setActiveTab('orders')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Maintenance Backlog
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {openOrdersCount} Orders
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            {openAdvisoriesCount} predictive advisories raised
          </div>
        </div>
      </div>

      {/* 3. Driver Component Alert Banner (Calm amber banner) */}
      {driver && driver.health_index < 75 && (
        <div className="bg-[#FEF7ED] border border-[#F8DCB5] rounded p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-[#A66A00] mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold font-mono uppercase text-[#A66A00] tracking-wider">
                Primary Degradation Driver Flagged
              </div>
              <p className="text-xs text-[#1A1A1A] font-mono mt-0.5">
                Governed by <strong className="text-[#1A1A1A]">{driver.component_name}</strong> ({driver.system_name} system).
                Health Index: <span className="font-semibold text-[#A66A00]">{driver.health_index.toFixed(1)}</span>,
                State: <span className="uppercase text-[#A66A00]">{driver.state}</span>
                {driver.rul_p50 ? `, RUL: ${Math.round(driver.rul_p50)} days` : ''}.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/components/${driver.component_id}`)}
            className="py-1 px-3 bg-white hover:bg-[#F6F6F3] text-[#A66A00] border border-[#F8DCB5] rounded text-xs font-mono font-medium flex items-center justify-center space-x-1 transition flex-shrink-0"
          >
            <span>Inspect Evidence</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Tab Navigation */}
      <div className="flex border-b border-[#E3E3DE] text-xs font-mono space-x-4">
        <button
          onClick={() => setActiveTab('schematic')}
          className={`py-2 px-1 border-b-2 font-medium flex items-center space-x-1.5 transition ${
            activeTab === 'schematic'
              ? 'border-[#2F5D8A] text-[#1A1A1A] font-semibold'
              : 'border-transparent text-[#5C5C57] hover:text-[#1A1A1A]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Subsystems & Schematic</span>
        </button>

        <button
          onClick={() => setActiveTab('twin')}
          className={`py-2 px-1 border-b-2 font-medium flex items-center space-x-1.5 transition ${
            activeTab === 'twin'
              ? 'border-[#2F5D8A] text-[#1A1A1A] font-semibold'
              : 'border-transparent text-[#5C5C57] hover:text-[#1A1A1A]'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Digital Twin & Trajectory</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`py-2 px-1 border-b-2 font-medium flex items-center space-x-1.5 transition ${
            activeTab === 'orders'
              ? 'border-[#2F5D8A] text-[#1A1A1A] font-semibold'
              : 'border-transparent text-[#5C5C57] hover:text-[#1A1A1A]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Work Orders ({workOrdersData?.total || 0})</span>
        </button>
      </div>

      {/* 5. Tab Content */}

      {/* TAB 1: Schematic & Functional Systems */}
      {activeTab === 'schematic' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Vector Schematic (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <SvgSchematic
              systems={schematicSystems}
              selectedSystem={selectedSystemName}
              onSelectSystem={(name) => setSelectedSystemName(name === selectedSystemName ? null : name)}
            />

            {/* System Filter Clear Helper */}
            {selectedSystemName && (
              <div className="flex items-center justify-between p-2.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded text-xs font-mono text-[#1A1A1A]">
                <span>
                  Filtering components for: <strong>{selectedSystemName}</strong>
                </span>
                <button
                  onClick={() => setSelectedSystemName(null)}
                  className="text-xs text-[#2F5D8A] hover:underline font-medium"
                >
                  Show All Systems
                </button>
              </div>
            )}
          </div>

          {/* Right: Functional Component Hierarchy Table (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
              <div>
                <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                  Tracked Line Replaceable Units (LRUs)
                </h3>
                <p className="text-[11px] text-[#5C5C57]">
                  {displayedComponents.length} components installed • Sorted by degradation severity
                </p>
              </div>
            </div>

            <DataTable
              columns={componentColumns}
              data={displayedComponents}
              loading={loadingTwin}
              emptyTitle="No Components"
              emptyMessage="No component instances found matching the selected subsystem filter."
              onRowClick={(row) => navigate(`/components/${row.component_id}`)}
            />
          </div>
        </div>
      )}

      {/* TAB 2: Digital Twin & Trajectory */}
      {activeTab === 'twin' && (
        <div className="space-y-6">
          {/* Trajectory TimeSeries Chart */}
          <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#ECECE8]">
              <div>
                <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                  Degradation Trajectory & Forward Monte Carlo Projection
                </h3>
                <p className="text-[11px] text-[#5C5C57]">
                  Health index decay curve and 14-day failure risk trajectory
                </p>
              </div>
              {forecastStart && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E3E3DE] text-[#5C5C57]">
                  Projection starts: {forecastStart}
                </span>
              )}
            </div>

            <TimeSeriesChart
              height={260}
              series={trajectorySeries}
              forecastStartDate={forecastStart}
              yAxisLabel="Metric Score"
              yAxisMin={0}
              yAxisMax={100}
              loading={loadingTwin}
            />
          </div>

          {/* Maintenance & Compliance History */}
          <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Digital Twin Maintenance & Inspection Compliance Events
              </h3>
            </div>

            <DataTable
              columns={historyColumns}
              data={twinData?.maintenance_history || []}
              loading={loadingTwin}
              emptyTitle="No Historical Events Recorded"
              emptyMessage="No inspection or maintenance events recorded in this airframe's digital twin state."
            />
          </div>
        </div>
      )}

      {/* TAB 3: Work Orders */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Work Orders & Turnaround Logistics
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Workshop agency routing, queue wait times, and parts availability constraints
              </p>
            </div>
            <button
              onClick={() => navigate('/planning')}
              className="text-xs font-mono text-[#2F5D8A] hover:underline flex items-center gap-1 font-medium"
            >
              Open Planning Board <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <DataTable
            columns={workOrderColumns}
            data={workOrdersData?.items || []}
            loading={loadingOrders}
            emptyTitle="No Work Orders"
            emptyMessage="No active or past work orders found for this airframe."
            onRowClick={() => navigate('/planning')}
          />
        </div>
      )}
    </div>
  );
};

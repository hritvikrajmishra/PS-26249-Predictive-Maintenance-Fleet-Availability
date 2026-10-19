import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldAlert,
  Layers,
  TrendingDown,
  History,
  Wrench,
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
  const [hoveredSystemName, setHoveredSystemName] = useState<string | null>(null);

  // Sorting state for LRU table
  const [sortKey, setSortKey] = useState<string>('health_index');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'health_index' || key === 'rul_p50' ? 'asc' : 'desc');
    }
  };

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
    setHoveredSystemName(null);
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

  // Flatten or filter components with client-side sorting
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

    return list.sort((a, b) => {
      let aVal: unknown = (a as unknown as Record<string, unknown>)[sortKey];
      let bVal: unknown = (b as unknown as Record<string, unknown>)[sortKey];

      if (aVal === undefined || aVal === null) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
      if (bVal === undefined || bVal === null) bVal = sortDirection === 'asc' ? Infinity : -Infinity;

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(String(bVal));
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      const cmp = Number(aVal) - Number(bVal);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [twinData, selectedSystemName, sortKey, sortDirection]);

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
        name: 'Airframe health index',
        data: hiData,
        color: '#2F5D8A',
        area: true,
      },
      {
        name: 'Failure risk (%)',
        data: riskData,
        color: '#B3402F',
        area: false,
        dashed: true,
      },
    ];

    return { trajectorySeries: series, forecastStart: firstForecast };
  }, [twinData]);

  // Component Table Columns with tooltips and right-aligned numbers
  const componentColumns: Column<TwinComponentNodeOut>[] = [
    {
      header: 'Component',
      sortable: true,
      sortKey: 'component_name',
      render: (row) => (
        <div className="min-w-0">
          <span className="font-medium font-sans text-xs text-[#1A1A1A] block truncate max-w-[200px] xl:max-w-[260px]">
            {row.component_name}
          </span>
          <span className="text-[11px] text-[#5C5C57] font-mono whitespace-nowrap block">
            PN: {row.part_number} • SN: {row.serial_number}
          </span>
        </div>
      ),
    },
    {
      header: 'System',
      accessorKey: 'system_name',
      sortable: true,
      sortKey: 'system_name',
      className: 'whitespace-nowrap font-sans text-xs text-[#5C5C57]',
    },
    {
      header: 'Criticality',
      align: 'center',
      sortable: true,
      sortKey: 'criticality',
      tooltip: 'Flight-safety criticality rating from 1 (auxiliary) to 5 (mission/flight critical)',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span
          className={`font-sans font-medium text-xs whitespace-nowrap ${
            row.criticality >= 4 ? 'text-[#B3402F]' : row.criticality === 3 ? 'text-[#A66A00]' : 'text-[#5C5C57]'
          }`}
        >
          Level {row.criticality}
        </span>
      ),
    },
    {
      header: 'Health index',
      align: 'right',
      sortable: true,
      sortKey: 'health_index',
      tooltip: 'Composite health indicator from 0 (failed) to 100 (optimal baseline) computed from telemetry',
      className: 'whitespace-nowrap',
      render: (row) => {
        const isCritical = row.health_index < 50 || row.state.toLowerCase() === 'critical';
        const isDegraded = !isCritical && (row.health_index < 75 || row.state.toLowerCase() === 'degraded');
        const numColor = isCritical ? 'text-[#B3402F]' : isDegraded ? 'text-[#A66A00]' : 'text-[#2E7D4F]';

        return (
          <div className="flex items-center justify-end space-x-2 whitespace-nowrap">
            <span className={`font-mono font-semibold text-xs tabular-nums ${numColor}`}>
              {row.health_index.toFixed(1)}
            </span>
            <StatusBadge status={row.state} size="sm" />
          </div>
        );
      },
    },
    {
      header: '14d risk',
      align: 'right',
      sortable: true,
      sortKey: 'risk',
      tooltip: 'Predicted probability of in-service functional failure within the next 14 operational days',
      className: 'whitespace-nowrap text-right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums text-xs whitespace-nowrap ${
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
      sortable: true,
      sortKey: 'rul_p50',
      tooltip: 'Estimated Remaining Useful Life (50th percentile median estimate in days)',
      className: 'whitespace-nowrap text-right',
      render: (row) => (
        <span
          className={`font-mono font-semibold tabular-nums text-xs whitespace-nowrap ${
            (row.rul_p50 ?? 99) <= 14 ? 'text-[#B3402F]' : (row.rul_p50 ?? 99) <= 30 ? 'text-[#A66A00]' : 'text-[#1A1A1A]'
          }`}
        >
          {row.rul_p50 !== null && row.rul_p50 !== undefined ? `${Math.round(row.rul_p50)}d` : '—'}
        </span>
      ),
    },
    {
      header: 'Evidence',
      align: 'center',
      className: 'whitespace-nowrap',
      render: (row) => (
        <button
          onClick={() => navigate(`/components/${row.component_id}`)}
          className="py-0.5 px-2 bg-white hover:bg-[#F6F6F3] text-[#2F5D8A] rounded text-[11px] font-sans font-medium border border-[#E3E3DE] transition inline-flex items-center gap-1"
        >
          <span>Telemetry</span>
          <ArrowRight className="w-3 h-3" />
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
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* 1. Airframe Selector & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div className="flex items-center space-x-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] font-mono tracking-tight">
                {twinData?.tail_code || activeAircraftId}
              </h1>
              <span className="text-xs text-[#5C5C57] font-mono">
                ({twinData?.type_code || aircraftDetail?.type_code || 'Trainer Jet'})
              </span>
              {activeAircraftId === 'AC-017' && (
                <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-[#F0F0EE] text-[#5C5C57] border border-[#E3E3DE] font-medium">
                  Demo scenario
                </span>
              )}
            </div>
            <p className="text-xs text-[#5C5C57] mt-0.5">
              Commissioned: <span className="font-mono">{aircraftDetail?.commissioned_date || '2023-01-15'}</span> • Base:{' '}
              <span className="font-mono">{aircraftDetail?.base_id || 'Base-North'}</span>
            </p>
          </div>
        </div>

        {/* Airframe Switcher & What-If Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1 text-xs">
            <span className="text-[#5C5C57]">Switch airframe:</span>
            <select
              value={activeAircraftId}
              onChange={(e) => handleSelectAircraft(e.target.value)}
              className="bg-transparent text-[#1A1A1A] font-semibold focus:outline-none cursor-pointer border-none p-0 font-sans"
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
            className="py-1 px-3 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-sans font-medium flex items-center space-x-1.5 transition"
          >
            <span>Launch what-if simulator</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Metric Summary Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE]">
        <div className="p-4">
          <div className="text-[11px] text-[#5C5C57] font-semibold">
            Airframe health index
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {twinData ? twinData.health_index.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-[#5C5C57]">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            {twinData?.risk ? `${(twinData.risk * 100).toFixed(0)}% 14d risk` : 'Nominal serviceability'}
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-[#5C5C57] font-semibold">
            Operational state
          </div>
          <div className="mt-2">
            <StatusBadge status={twinData?.state || aircraftDetail?.current_status || 'Available'} size="md" />
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Fleet availability state
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-[#5C5C57] font-semibold">
            Flight hours & cycles
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {aircraftDetail ? Math.round(aircraftDetail.total_flight_hours) : '—'}
            </span>
            <span className="text-xs text-[#5C5C57]">
              hrs ({aircraftDetail?.total_cycles || 0} cycles)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#2E7D4F]">
            Inspection compliant
          </div>
        </div>

        <div
          onClick={() => setActiveTab('orders')}
          className="p-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        >
          <div className="text-[11px] text-[#5C5C57] font-semibold">
            Maintenance backlog
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {openOrdersCount}
            </span>
            <span className="text-xs text-[#5C5C57]">
              open ({workOrdersData?.total || 0} lifetime)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            {openAdvisoriesCount} predictive advisories raised
          </div>
        </div>
      </div>

      {/* 3. Driver Component Alert Banner (Red-tinted for Critical, Amber for Degraded) */}
      {driver && driver.health_index < 75 && (() => {
        const isCritical = driver.health_index < 50 || driver.state?.toLowerCase() === 'critical';
        const bannerBg = isCritical ? 'bg-[#FDF2F0] border-[#F5C2BC]' : 'bg-[#FEF7ED] border-[#F8DCB5]';
        const titleColor = isCritical ? 'text-[#B3402F]' : 'text-[#A66A00]';
        const iconColor = isCritical ? 'text-[#B3402F]' : 'text-[#A66A00]';

        return (
          <div className={`${bannerBg} border rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
            <div className="flex items-start space-x-3">
              <ShieldAlert className={`w-5 h-5 ${iconColor} mt-0.5 flex-shrink-0`} />
              <div className="space-y-1">
                <div className={`text-xs font-semibold ${titleColor}`}>
                  {isCritical ? 'Critical component degradation flagged' : 'Component degradation watch flagged'}
                </div>
                <p className="text-xs text-[#1A1A1A]">
                  Governed by <strong className="font-semibold">{driver.component_name}</strong> ({driver.system_name} system).{' '}
                  Component health: <span className="font-mono font-semibold">{driver.health_index.toFixed(1)}/100</span>{' '}
                  <span className="text-[#5C5C57]">(versus airframe composite health {twinData?.health_index.toFixed(1)}/100)</span> •{' '}
                  State: <span className="font-medium">{driver.state}</span>
                  {driver.rul_p50 ? ` • Remaining useful life: ${Math.round(driver.rul_p50)} days` : ''}.
                </p>
                <p className="text-xs text-[#5C5C57]">
                  <strong className="text-[#1A1A1A] font-medium">Recommended action:</strong> Schedule priority removal and replacement of {driver.component_name} before next scheduled sortie. Inspect hydraulic pressure seals and fluid contamination.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigate('/planning')}
                className="py-1.5 px-3 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-sans font-medium flex items-center space-x-1.5 transition shadow-sm"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Create work order</span>
              </button>
              <button
                onClick={() => navigate(`/components/${driver.component_id}`)}
                className="py-1.5 px-3 bg-white hover:bg-[#F6F6F3] text-[#1A1A1A] border border-[#E3E3DE] rounded text-xs font-sans font-medium flex items-center space-x-1 transition"
              >
                <span>Inspect evidence</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* 4. Tab Navigation */}
      <div className="flex border-b border-[#E3E3DE] text-xs space-x-4">
        <button
          onClick={() => setActiveTab('schematic')}
          className={`py-2 px-1 border-b-2 font-medium flex items-center space-x-1.5 transition ${
            activeTab === 'schematic'
              ? 'border-[#2F5D8A] text-[#1A1A1A] font-semibold'
              : 'border-transparent text-[#5C5C57] hover:text-[#1A1A1A]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Subsystems & schematic</span>
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
          <span>Digital twin & trajectory</span>
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
          <span>Work orders ({workOrdersData?.total || 0})</span>
        </button>
      </div>

      {/* 5. Tab Content */}

      {/* TAB 1: Schematic & Functional Systems */}
      {activeTab === 'schematic' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Vector Schematic (5 cols ~ 41.7%) */}
          <div className="lg:col-span-5 space-y-3">
            <SvgSchematic
              systems={schematicSystems}
              selectedSystem={selectedSystemName}
              onSelectSystem={(name) => setSelectedSystemName(name === selectedSystemName ? null : name)}
              hoveredSystem={hoveredSystemName}
              onHoverSystem={setHoveredSystemName}
            />

            {/* System Filter Clear Helper */}
            {selectedSystemName && (
              <div className="flex items-center justify-between p-2.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded text-xs text-[#1A1A1A]">
                <span>
                  Filtering components for: <strong>{selectedSystemName}</strong>
                </span>
                <button
                  onClick={() => setSelectedSystemName(null)}
                  className="text-xs text-[#2F5D8A] hover:underline font-medium"
                >
                  Show all systems
                </button>
              </div>
            )}
          </div>

          {/* Right: Functional Component Hierarchy Table (7 cols ~ 58.3%) */}
          <div className="lg:col-span-7 bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
              <div>
                <h3 className="text-xs font-semibold text-[#1A1A1A]">
                  Tracked line replaceable units (LRUs)
                </h3>
                <p className="text-[11px] text-[#5C5C57]">
                  {displayedComponents.length} components installed • Sorted by {sortKey.replace('_', ' ')}
                </p>
              </div>
            </div>

            <DataTable
              columns={componentColumns}
              data={displayedComponents}
              loading={loadingTwin}
              emptyTitle="No Components"
              emptyMessage="No component instances found matching the selected subsystem filter."
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              onRowMouseEnter={(row) => setHoveredSystemName(row.system_name)}
              onRowMouseLeave={() => setHoveredSystemName(null)}
              rowClassName={(row) => hoveredSystemName === row.system_name ? 'bg-[#F0F5FA]' : ''}
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
                <h3 className="text-xs font-semibold text-[#1A1A1A]">
                  Degradation trajectory & forward Monte Carlo projection
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
              <h3 className="text-xs font-semibold text-[#1A1A1A]">
                Digital twin maintenance & inspection compliance events
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
              <h3 className="text-xs font-semibold text-[#1A1A1A]">
                Work orders & turnaround logistics
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Workshop agency routing, queue wait times, and parts availability constraints
              </p>
            </div>
            <button
              onClick={() => navigate('/planning')}
              className="text-xs text-[#2F5D8A] hover:underline flex items-center gap-1 font-medium"
            >
              Open planning board <ArrowRight className="w-3.5 h-3.5" />
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


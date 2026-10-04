import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Cpu,
  Activity,
  AlertTriangle,
  Clock,
  TrendingDown,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { KpiCard } from '../components/common/KpiCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { TimeSeriesChart, type TimeSeriesAnomalyWindow } from '../components/common/TimeSeriesChart';
import { AdvisoryCard } from '../components/common/AdvisoryCard';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useComponentTwin } from '../hooks/useTwinQueries';
import { useComponentSensors } from '../hooks/useSensorQueries';
import { usePredictions, useAdvisories } from '../hooks/useEngineQueries';
import { useComponents } from '../hooks/useFleetQueries';
import type { AdvisoryOut, TwinMaintenanceEvent } from '../types/api';

export const ComponentHealthPage: React.FC = () => {
  const { id: paramId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { asOfDate } = useAuth();

  const queryId = searchParams.get('id') || '';
  const initialComponentId = paramId || queryId || '';

  // Component catalog for dropdown selector
  const { data: componentsData } = useComponents({ page_size: 150 });
  const allComponents = componentsData?.items || [];

  // Determine active component ID: prefer URL param, or AC-017 hydraulic pump if exists, or first
  const activeComponentId = useMemo(() => {
    if (initialComponentId) return initialComponentId;
    // Prefer hero aircraft AC-017's component if present
    const heroComp = allComponents.find(
      (c) => c.aircraft_id === 'AC-017' && (c.component_id.toLowerCase().includes('pump') || c.status === 'degraded')
    );
    if (heroComp) return heroComp.component_id;
    return allComponents[0]?.component_id || '';
  }, [initialComponentId, allComponents]);

  useEffect(() => {
    if (activeComponentId && !paramId && queryId !== activeComponentId) {
      setSearchParams({ id: activeComponentId }, { replace: true });
    }
  }, [activeComponentId, paramId, queryId, setSearchParams]);

  // Queries
  const { data: compTwin, isLoading: loadingTwin } = useComponentTwin(activeComponentId, asOfDate);
  const { data: sensorReadings, isLoading: loadingSensors } = useComponentSensors(activeComponentId, { limit: 500 });
  const { data: predictionsData, isLoading: loadingPredictions } = usePredictions({
    page_size: 10,
    as_of_date: asOfDate || undefined,
  });
  const { data: advisoriesData } = useAdvisories({ page_size: 20 });

  // Parameter filter for telemetry
  const [selectedParam, setSelectedParam] = useState<string>('all');

  // Find relevant prediction & advisory for this component
  const componentPrediction = useMemo(() => {
    if (!predictionsData?.items) return null;
    return predictionsData.items.find((p) => p.component_id === activeComponentId) || null;
  }, [predictionsData, activeComponentId]);

  const componentAdvisory: AdvisoryOut | null = useMemo(() => {
    // Check if active_advisory in compTwin
    if (compTwin?.active_advisory) {
      const adv = compTwin.active_advisory as unknown as AdvisoryOut;
      if (adv.advisory_id) return adv;
    }
    // Check advisories list
    if (advisoriesData?.items) {
      return advisoriesData.items.find((a) => a.component_id === activeComponentId) || null;
    }
    return null;
  }, [compTwin, advisoriesData, activeComponentId]);

  // Extract unique telemetry parameters
  const availableParameters = useMemo(() => {
    if (!sensorReadings) return [];
    const set = new Set<string>();
    sensorReadings.forEach((r) => set.add(r.parameter));
    return Array.from(set).sort();
  }, [sensorReadings]);

  // 1. Prepare Telemetry Series & Anomaly Shading Windows
  const { sensorSeries, anomalyWindows } = useMemo(() => {
    if (!sensorReadings || sensorReadings.length === 0) {
      return { sensorSeries: [], anomalyWindows: [] };
    }

    const grouped: Record<string, Array<[string, number]>> = {};
    const anomalies: TimeSeriesAnomalyWindow[] = [];

    // Sort readings by date
    const sorted = [...sensorReadings].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sorted.forEach((r) => {
      const d = r.date || '2026-01-01';
      if (!grouped[r.parameter]) {
        grouped[r.parameter] = [];
      }
      grouped[r.parameter].push([d, Number(r.mean.toFixed(2))]);

      if (r.quality_flag && r.quality_flag !== 'valid') {
        anomalies.push({
          startDate: d,
          endDate: d,
          label: r.quality_flag,
          color: 'rgba(244, 63, 94, 0.25)',
        });
      }
    });

    const seriesList: Array<{
      name: string;
      data: Array<[string, number]>;
      color?: string;
      area?: boolean;
    }> = [];

    const colors = ['#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#ec4899', '#f97316'];
    let colorIdx = 0;

    Object.entries(grouped).forEach(([param, pts]) => {
      if (selectedParam === 'all' || selectedParam === param) {
        seriesList.push({
          name: param.replace(/_/g, ' '),
          data: pts,
          color: colors[colorIdx % colors.length],
          area: selectedParam !== 'all',
        });
        colorIdx++;
      }
    });

    return { sensorSeries: seriesList, anomalyWindows: anomalies };
  }, [sensorReadings, selectedParam]);

  // 2. Health Index Trajectory Series (Decay towards threshold)
  const { trajectorySeries, trajectoryForecastStart } = useMemo(() => {
    if (!compTwin?.predicted_trajectory || compTwin.predicted_trajectory.length === 0) {
      return { trajectorySeries: [], trajectoryForecastStart: undefined };
    }

    const hiPts: Array<[string, number]> = [];
    const thresholdPts: Array<[string, number]> = [];
    let forecastDate: string | undefined = undefined;

    compTwin.predicted_trajectory.forEach((pt) => {
      hiPts.push([pt.date, Number(pt.health_index.toFixed(1))]);
      thresholdPts.push([pt.date, 50.0]); // Failure/Degradation alert threshold
      if (pt.is_forecast && !forecastDate) {
        forecastDate = pt.date;
      }
    });

    const series = [
      {
        name: 'Component Health Index (HI)',
        data: hiPts,
        color: (compTwin.health_index >= 75) ? '#10b981' : (compTwin.health_index >= 50) ? '#f59e0b' : '#f43f5e',
        area: true,
      },
      {
        name: 'Alert Threshold (HI = 50)',
        data: thresholdPts,
        color: '#f43f5e',
        area: false,
        dashed: true,
      },
    ];

    return { trajectorySeries: series, trajectoryForecastStart: forecastDate };
  }, [compTwin]);

  // Maintenance history columns
  const historyColumns: Column<TwinMaintenanceEvent>[] = [
    {
      header: 'Date',
      render: (row) => <span className="font-mono text-slate-300">{row.date}</span>,
    },
    {
      header: 'Type',
      align: 'center',
      render: (row) => <StatusBadge status={row.event_type} size="sm" />,
    },
    {
      header: 'Description',
      render: (row) => <span className="text-slate-200">{row.description}</span>,
    },
    {
      header: 'Status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
  ];

  if (loadingTwin && !compTwin) {
    return <LoadingSkeleton rows={8} />;
  }

  const rulP10 = componentPrediction?.rul_p10 ?? (compTwin?.rul_p50 ? Math.max(1, compTwin.rul_p50 - 5) : 10);
  const rulP50 = componentPrediction?.rul_p50 ?? compTwin?.rul_p50 ?? 15;
  const rulP90 = componentPrediction?.rul_p90 ?? (compTwin?.rul_p50 ? compTwin.rul_p50 + 8 : 22);

  const riskScore = componentPrediction?.risk_14d ?? compTwin?.risk ?? 0.15;
  const shapDrivers = componentAdvisory?.explanation?.top_drivers || [
    { feature: 'sensor_residual_outlet_pressure', impact: 0.38 },
    { feature: 'fluid_temp_drift_slope', impact: 0.27 },
    { feature: 'operating_hours_stress', impact: 0.19 },
    { feature: 'ambient_temp_severity', impact: 0.12 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Component Header & Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-600/20 border border-cyan-500/40 rounded-xl text-cyan-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl font-bold font-mono text-white tracking-tight">
                {compTwin?.component_name || activeComponentId}
              </h1>
              <StatusBadge status={compTwin?.state || 'Nominal'} size="md" />
              {activeComponentId.toLowerCase().includes('pump') && compTwin?.aircraft_id === 'AC-017' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                  Scripted Failure Arc
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Part No: <span className="text-slate-200">{compTwin?.part_number || 'PN-HYD-001'}</span> • Serial No:{' '}
              <span className="text-slate-200">{compTwin?.serial_number || 'SN-7892'}</span> • Installed on:{' '}
              <button
                onClick={() => navigate(`/aircraft?id=${compTwin?.aircraft_id}`)}
                className="text-blue-400 hover:underline font-bold"
              >
                {compTwin?.aircraft_id}
              </button>{' '}
              ({compTwin?.system_name || 'Hydraulics'})
            </p>
          </div>
        </div>

        {/* Component Selector */}
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs font-mono">
          <span className="text-slate-400">Select Component:</span>
          <select
            value={activeComponentId}
            onChange={(e) => {
              const newId = e.target.value;
              navigate(`/components/${newId}`);
            }}
            className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer max-w-xs truncate"
          >
            {allComponents.map((c) => (
              <option key={c.component_id} value={c.component_id} className="bg-slate-900 text-white">
                {c.aircraft_id ? `${c.aircraft_id} • ` : ''}
                {c.component_id} ({c.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Component Health Index (HI)"
          value={compTwin ? compTwin.health_index.toFixed(1) : '—'}
          subtitle={`Design Criticality: Level ${compTwin?.criticality || 4}`}
          change={{
            value: (riskScore * 100).toFixed(0) + '% Risk',
            isPositive: riskScore < 0.3,
            label: '14-Day',
          }}
          icon={<Activity className="w-5 h-5" />}
          accent={
            (compTwin?.health_index ?? 100) >= 75
              ? 'emerald'
              : (compTwin?.health_index ?? 100) >= 50
              ? 'amber'
              : 'rose'
          }
          loading={loadingTwin}
        />

        <KpiCard
          title="Predicted RUL (Median P50)"
          value={`${Math.round(rulP50)} Days`}
          subtitle={`Credible interval: ${Math.round(rulP10)} – ${Math.round(rulP90)} days`}
          change={{
            value: `${Math.round(rulP10)}d lower`,
            isPositive: rulP10 > 14,
            label: 'P10',
          }}
          icon={<Clock className="w-5 h-5" />}
          accent={rulP50 <= 14 ? 'rose' : rulP50 <= 30 ? 'amber' : 'blue'}
          loading={loadingTwin || loadingPredictions}
        />

        <KpiCard
          title="Operating Utilization"
          value={`${Math.round(compTwin?.operating_hours ?? 340)}h`}
          subtitle={`Total life since new: ${Math.round(compTwin?.hours_since_new ?? 1200)}h`}
          icon={<TrendingDown className="w-5 h-5" />}
          accent="slate"
          loading={loadingTwin}
        />

        <KpiCard
          title="Active Advisory Status"
          value={componentAdvisory?.priority || 'Nominal'}
          subtitle={componentAdvisory?.action || 'No open maintenance action required'}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent={componentAdvisory ? 'amber' : 'emerald'}
          loading={loadingTwin}
        />
      </div>

      {/* 3. Advisory Human-in-the-Loop Card (if advisory active) */}
      {componentAdvisory && (
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Decision-Support Maintenance Advisory Action
          </div>
          <AdvisoryCard
            advisory={componentAdvisory}
            onSchedule={() => navigate(`/planning?aircraft=${compTwin?.aircraft_id}&component=${activeComponentId}`)}
          />
        </div>
      )}

      {/* 4. Charts Grid: Sensor Telemetry Trends + HI Trajectory with Threshold */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Multi-Parameter Sensor Telemetry with Anomaly Shading */}
        <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
                Multi-Parameter Telemetry & Anomaly Shading
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Post-flight sensor summary parameters with shaded anomaly windows
              </p>
            </div>

            {/* Parameter Selector */}
            <div className="flex items-center space-x-1.5 text-xs font-mono">
              <span className="text-slate-400 text-[11px]">Param:</span>
              <select
                value={selectedParam}
                onChange={(e) => setSelectedParam(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
              >
                <option value="all">All Parameters</option>
                {availableParameters.map((p) => (
                  <option key={p} value={p}>
                    {p.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TimeSeriesChart
            height={270}
            series={sensorSeries}
            anomalyWindows={anomalyWindows}
            yAxisLabel="Normalized Signal"
            loading={loadingSensors}
          />
        </div>

        {/* Right: Health Index Trajectory with Projected Threshold Crossing */}
        <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
                Health Index Degradation Trajectory
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Latent degradation progression toward failure threshold (HI = 50)
              </p>
            </div>
            {trajectoryForecastStart && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/60 border border-blue-500/40 text-blue-300">
                Forecast: {trajectoryForecastStart}
              </span>
            )}
          </div>

          <TimeSeriesChart
            height={270}
            series={trajectorySeries}
            forecastStartDate={trajectoryForecastStart}
            yAxisLabel="Health Index"
            yAxisMin={0}
            yAxisMax={105}
            loading={loadingTwin}
          />
        </div>
      </div>

      {/* 5. Lower Row: SHAP Contributors Bar Chart + RUL Distribution Interval */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SHAP Wear Drivers (7 cols) */}
        <div className="lg:col-span-7 bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
                SHAP Feature Attribution (ML Explainability)
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Top telemetry and operating stress features accelerating component wear
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              TreeExplainer (LightGBM)
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs pt-1">
            {shapDrivers.map((driver, idx) => {
              const isPositive = driver.impact >= 0;
              const magnitude = Math.min(100, Math.abs(driver.impact) * 120);

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">
                      {driver.feature.replace(/_/g, ' ')}
                    </span>
                    <span className={`font-semibold ${isPositive ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isPositive ? `+${driver.impact.toFixed(3)}` : driver.impact.toFixed(3)} SHAP
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full rounded-full ${
                        isPositive
                          ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                          : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                      }`}
                      style={{ width: `${magnitude}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RUL Quantile Distribution (5 cols) */}
        <div className="lg:col-span-5 bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
              Remaining Useful Life (RUL) Distribution
            </h3>
            <p className="text-[11px] text-slate-400 font-mono mb-4">
              Multi-quantile LightGBM regression estimate with asymmetric risk weighting
            </p>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-400 font-semibold">P10 (Pessimistic)</span>
                <span className="text-sm font-bold text-white">{Math.round(rulP10)} Days</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-400 font-semibold">P50 (Median Expectation)</span>
                <span className="text-base font-bold text-cyan-300">{Math.round(rulP50)} Days</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-semibold">P90 (Optimistic)</span>
                <span className="text-sm font-bold text-white">{Math.round(rulP90)} Days</span>
              </div>

              {/* Visual Interval Bar */}
              <div className="pt-2">
                <div className="w-full bg-slate-800 h-2.5 rounded-full relative overflow-hidden">
                  <div
                    className="absolute bg-blue-500/80 h-full rounded"
                    style={{
                      left: `${Math.min(90, Math.max(5, (rulP10 / 60) * 100))}%`,
                      width: `${Math.min(90, Math.max(10, ((rulP90 - rulP10) / 60) * 100))}%`,
                    }}
                  />
                  <div
                    className="absolute w-2 h-full bg-cyan-300"
                    style={{ left: `${Math.min(95, Math.max(5, (rulP50 / 60) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>0 days</span>
                  <span>Horizon 60 days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-lg text-xs font-mono text-blue-300 flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <span>
              Target replace-before interval: <strong>{Math.round(Math.max(1, rulP10))} days</strong> before high
              unplanned failure probability.
            </span>
          </div>
        </div>
      </div>

      {/* 6. Maintenance & Replacement History Table */}
      <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">
              Component Life Cycle & Maintenance History
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Physical installations, bench check tests, and overhaul records
            </p>
          </div>
        </div>

        <DataTable
          columns={historyColumns}
          data={compTwin?.maintenance_history || []}
          loading={loadingTwin}
          emptyTitle="No Overhaul Records"
          emptyMessage="No previous physical replacements or repair events recorded for this component serial number."
        />
      </div>
    </div>
  );
};

import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Info,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { TimeSeriesChart, type TimeSeriesAnomalyWindow } from '../components/common/TimeSeriesChart';
import { AdvisoryCard } from '../components/common/AdvisoryCard';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useComponentTwin } from '../hooks/useTwinQueries';
import { useComponentSensors, useComponentAnomalies } from '../hooks/useSensorQueries';
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

  // Determine active component ID: prefer URL param, or hero aircraft AC-017's component, or first
  const activeComponentId = useMemo(() => {
    if (initialComponentId) return initialComponentId;
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
  const { data: anomaliesData } = useComponentAnomalies(activeComponentId);
  const { data: predictionsData } = usePredictions({
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
    if (compTwin?.active_advisory) {
      const adv = compTwin.active_advisory as unknown as AdvisoryOut;
      if (adv.advisory_id) return adv;
    }
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
          color: 'rgba(179, 64, 47, 0.12)',
        });
      }
    });

    if (anomaliesData && anomaliesData.length > 0) {
      anomaliesData
        .filter((a) => a.is_anomaly || a.score >= 0.45)
        .forEach((a) => {
          if (a.date) {
            anomalies.push({
              startDate: a.date,
              endDate: a.date,
              label: `Anomaly ${(a.score * 100).toFixed(0)}%`,
              color: 'rgba(179, 64, 47, 0.18)',
            });
          }
        });
    }

    const seriesList: Array<{
      name: string;
      data: Array<[string, number]>;
      color?: string;
      area?: boolean;
    }> = [];

    const colors = ['#2F5D8A', '#A66A00', '#2E7D4F', '#8F6580', '#608070', '#8C7A6B'];
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
  }, [sensorReadings, selectedParam, anomaliesData]);

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
      thresholdPts.push([pt.date, 50.0]); // Failure alert threshold
      if (pt.is_forecast && !forecastDate) {
        forecastDate = pt.date;
      }
    });

    const series = [
      {
        name: 'Component Health Index (HI)',
        data: hiPts,
        color: (compTwin.health_index >= 75) ? '#2E7D4F' : (compTwin.health_index >= 50) ? '#A66A00' : '#B3402F',
        area: true,
      },
      {
        name: 'Alert Threshold (HI = 50)',
        data: thresholdPts,
        color: '#B3402F',
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
      render: (row) => <span className="font-mono text-[#1A1A1A]">{row.date}</span>,
    },
    {
      header: 'Type',
      align: 'center',
      render: (row) => <StatusBadge status={row.event_type} size="sm" />,
    },
    {
      header: 'Description',
      render: (row) => <span className="text-[#1A1A1A]">{row.description}</span>,
    },
    {
      header: 'Status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
  ];

  const shapDrivers = useMemo(() => {
    const raw =
      componentAdvisory?.explanation?.top_shap_factors ||
      componentAdvisory?.explanation?.top_factors ||
      componentAdvisory?.explanation?.top_drivers;
    if (raw && raw.length > 0) {
      return raw.map((item) => ({
        feature: item.feature,
        impact:
          'shap_impact' in item && typeof item.shap_impact === 'number'
            ? item.shap_impact
            : 'impact' in item && typeof item.impact === 'number'
            ? item.impact
            : 0,
      }));
    }
    return [
      { feature: 'sensor_residual_outlet_pressure', impact: 0.38 },
      { feature: 'fluid_temp_drift_slope', impact: 0.27 },
      { feature: 'operating_hours_stress', impact: 0.19 },
      { feature: 'ambient_temp_severity', impact: 0.12 },
    ];
  }, [componentAdvisory]);

  if (loadingTwin && !compTwin) {
    return <LoadingSkeleton rows={8} />;
  }

  const rulP10 = componentPrediction?.rul_p10 ?? (compTwin?.rul_p50 ? Math.max(1, compTwin.rul_p50 - 5) : 10);
  const rulP50 = componentPrediction?.rul_p50 ?? compTwin?.rul_p50 ?? 15;
  const rulP90 = componentPrediction?.rul_p90 ?? (compTwin?.rul_p50 ? compTwin.rul_p50 + 8 : 22);

  const riskScore = componentPrediction?.risk_14d ?? compTwin?.risk ?? 0.15;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Component Header & Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E3DE] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl md:text-2xl font-semibold text-[#1A1A1A] tracking-tight">
              {compTwin?.component_name || activeComponentId}
            </h1>
            <StatusBadge status={compTwin?.state || 'Nominal'} size="md" />
            {activeComponentId.toLowerCase().includes('pump') && compTwin?.aircraft_id === 'AC-017' && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FEF7ED] text-[#A66A00] border border-[#F8DCB5] font-semibold">
                Scripted Failure Arc
              </span>
            )}
          </div>
          <p className="text-xs text-[#5C5C57] font-mono mt-0.5">
            Part No: <span className="text-[#1A1A1A] font-semibold">{compTwin?.part_number || 'PN-HYD-001'}</span> • Serial No:{' '}
            <span className="text-[#1A1A1A] font-semibold">{compTwin?.serial_number || 'SN-7892'}</span> • Installed on:{' '}
            <button
              onClick={() => navigate(`/aircraft?id=${compTwin?.aircraft_id}`)}
              className="text-[#2F5D8A] hover:underline font-semibold"
            >
              {compTwin?.aircraft_id}
            </button>{' '}
            ({compTwin?.system_name || 'Hydraulics'})
          </p>
        </div>

        {/* Component Selector */}
        <div className="flex items-center space-x-1.5 bg-white border border-[#E3E3DE] rounded px-2.5 py-1 text-xs font-mono">
          <span className="text-[#5C5C57]">Select Component:</span>
          <select
            value={activeComponentId}
            onChange={(e) => {
              const newId = e.target.value;
              navigate(`/components/${newId}`);
            }}
            className="bg-transparent text-[#1A1A1A] font-semibold focus:outline-none cursor-pointer max-w-xs truncate border-none p-0"
          >
            {allComponents.map((c) => (
              <option key={c.component_id} value={c.component_id}>
                {c.aircraft_id ? `${c.aircraft_id} • ` : ''}
                {c.component_id} ({c.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Compact Metric Summary Strip */}
      <div className="bg-white border border-[#E3E3DE] rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E3E3DE]">
        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Health Index (HI)
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {compTwin ? compTwin.health_index.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-[#5C5C57] font-mono">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            {(riskScore * 100).toFixed(0)}% failure risk in 14 days
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Predicted RUL (Median P50)
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {Math.round(rulP50)} Days
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Interval: {Math.round(rulP10)} – {Math.round(rulP90)} days (P10–P90)
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Operating Utilization
          </div>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-semibold font-mono text-[#1A1A1A] tabular-nums">
              {Math.round(compTwin?.operating_hours ?? 340)}h
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57]">
            Total life: {Math.round(compTwin?.hours_since_new ?? 1200)}h since new
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
            Active Advisory Status
          </div>
          <div className="mt-2">
            <StatusBadge status={componentAdvisory?.priority || 'Nominal'} size="md" />
          </div>
          <div className="mt-1 text-[11px] text-[#5C5C57] truncate">
            {componentAdvisory?.action || 'No open maintenance action required'}
          </div>
        </div>
      </div>

      {/* 3. Advisory Card (if active) */}
      {componentAdvisory && (
        <div className="space-y-1.5">
          <div className="text-xs font-mono uppercase tracking-wider text-[#5C5C57] font-semibold">
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
        {/* Left: Multi-Parameter Sensor Telemetry */}
        <div className="bg-white border border-[#E3E3DE] rounded p-4 flex flex-col justify-between space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#ECECE8]">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Multi-Parameter Telemetry & Anomaly Shading
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Post-flight sensor summary parameters with shaded anomaly windows
              </p>
            </div>

            {/* Parameter Selector */}
            <div className="flex items-center space-x-1 text-xs font-mono">
              <span className="text-[#5C5C57] text-[11px]">Param:</span>
              <select
                value={selectedParam}
                onChange={(e) => setSelectedParam(e.target.value)}
                className="bg-[#FAFAF8] border border-[#E3E3DE] rounded px-2 py-0.5 text-[#1A1A1A] focus:outline-none"
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
            height={250}
            series={sensorSeries}
            anomalyWindows={anomalyWindows}
            yAxisLabel="Normalized Signal"
            loading={loadingSensors}
          />
        </div>

        {/* Right: Health Index Trajectory */}
        <div className="bg-white border border-[#E3E3DE] rounded p-4 flex flex-col justify-between space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#ECECE8]">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                Health Index Degradation Trajectory
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Latent degradation progression toward failure threshold (HI = 50)
              </p>
            </div>
            {trajectoryForecastStart && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FAFAF8] border border-[#E3E3DE] text-[#5C5C57]">
                Forecast: {trajectoryForecastStart}
              </span>
            )}
          </div>

          <TimeSeriesChart
            height={250}
            series={trajectorySeries}
            forecastStartDate={trajectoryForecastStart}
            yAxisLabel="Health Index"
            yAxisMin={0}
            yAxisMax={105}
            loading={loadingTwin}
          />
        </div>
      </div>

      {/* 5. Lower Row: SHAP Contributors + RUL Distribution Interval */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SHAP Wear Drivers (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
            <div>
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
                SHAP Feature Attribution (ML Explainability)
              </h3>
              <p className="text-[11px] text-[#5C5C57]">
                Top telemetry and operating stress features accelerating component wear
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FAFAF8] text-[#5C5C57] border border-[#E3E3DE]">
              LightGBM TreeExplainer
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs pt-1">
            {shapDrivers.map((driver, idx) => {
              const isPositive = driver.impact >= 0;
              const magnitude = Math.min(100, Math.abs(driver.impact) * 120);

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#1A1A1A] font-medium">
                      {driver.feature.replace(/_/g, ' ')}
                    </span>
                    <span className={`font-semibold tabular-nums ${isPositive ? 'text-[#B3402F]' : 'text-[#2E7D4F]'}`}>
                      {isPositive ? `+${driver.impact.toFixed(3)}` : driver.impact.toFixed(3)} SHAP
                    </span>
                  </div>
                  <div className="w-full bg-[#ECECE8] h-1.5 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full rounded-full ${
                        isPositive ? 'bg-[#B3402F]' : 'bg-[#2E7D4F]'
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
        <div className="lg:col-span-5 bg-white border border-[#E3E3DE] rounded p-4 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
              Remaining Useful Life (RUL) Distribution
            </h3>
            <p className="text-[11px] text-[#5C5C57] mb-3">
              Multi-quantile LightGBM regression estimate with asymmetric risk weighting
            </p>

            <div className="p-3.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded space-y-3 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#B3402F] font-semibold">P10 (Pessimistic)</span>
                <span className="text-sm font-semibold text-[#1A1A1A] tabular-nums">{Math.round(rulP10)} Days</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#2F5D8A] font-semibold">P50 (Median Expectation)</span>
                <span className="text-base font-semibold text-[#2F5D8A] tabular-nums">{Math.round(rulP50)} Days</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#2E7D4F] font-semibold">P90 (Optimistic)</span>
                <span className="text-sm font-semibold text-[#1A1A1A] tabular-nums">{Math.round(rulP90)} Days</span>
              </div>

              {/* Visual Interval Bar */}
              <div className="pt-2">
                <div className="w-full bg-[#E3E3DE] h-2 rounded-full relative overflow-hidden">
                  <div
                    className="absolute bg-[#4F759B] h-full rounded"
                    style={{
                      left: `${Math.min(90, Math.max(5, (rulP10 / 60) * 100))}%`,
                      width: `${Math.min(90, Math.max(10, ((rulP90 - rulP10) / 60) * 100))}%`,
                    }}
                  />
                  <div
                    className="absolute w-1.5 h-full bg-[#2F5D8A]"
                    style={{ left: `${Math.min(95, Math.max(5, (rulP50 / 60) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#5C5C57] mt-1 font-mono">
                  <span>0 days</span>
                  <span>Horizon 60 days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-[#FAFAF8] border border-[#E3E3DE] rounded text-xs font-mono text-[#5C5C57] flex items-start space-x-2">
            <Info className="w-3.5 h-3.5 text-[#2F5D8A] mt-0.5 flex-shrink-0" />
            <span>
              Target replace-before interval: <strong className="text-[#1A1A1A]">{Math.round(Math.max(1, rulP10))} days</strong> before high
              unplanned failure probability.
            </span>
          </div>
        </div>
      </div>

      {/* 6. Maintenance & Replacement History Table */}
      <div className="bg-white border border-[#E3E3DE] rounded p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#ECECE8]">
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-[#1A1A1A]">
              Component Life Cycle & Maintenance History
            </h3>
            <p className="text-[11px] text-[#5C5C57]">
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

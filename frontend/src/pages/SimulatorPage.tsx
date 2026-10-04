import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as echarts from 'echarts';
import {
  Sliders,
  Play,
  RotateCcw,
  AlertTriangle,
  BookmarkPlus,
  Trash2,
  Layers,
  Wrench,
  Package,
  TrendingUp,
  TrendingDown,
  Clock,
  History,
} from 'lucide-react';
import { KpiCard } from '../components/common/KpiCard';
import { LoadingSkeleton } from '../components/feedback/LoadingSkeleton';
import { EmptyState } from '../components/feedback/EmptyState';
import { useAuth } from '../hooks/useAuth';
import {
  useRunScenario,
  useScenarioHistory,
} from '../hooks/useAvailabilityQueries';
import { useAircraftList } from '../hooks/useFleetQueries';
import { useSpareParts } from '../hooks/useSparesQueries';
import type { DailyTrendPoint, ScenarioRunOut } from '../types/api';

type ScenarioType =
  | 'schedule_maintenance'
  | 'spare_unavailable'
  | 'early_vs_run_to_failure'
  | 'extra_capacity';

interface ScenarioComparisonItem {
  id: string;
  name: string;
  type: ScenarioType;
  params: Record<string, unknown>;
  horizon_days: number;
  runs: number;
  seed: number;
  baseline_p50: number;
  scenario_p50: number;
  avail_delta_pct: number;
  days_lost_delta: number;
  stockout_prob: number;
  by_cause_delta: Record<string, number>;
}

export const SimulatorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const canSimulate = role === 'commander' || role === 'planner';

  // Read URL query params for what-if pre-fills
  const prefillAircraft = searchParams.get('aircraft') || '';
  const prefillPart = searchParams.get('part') || '';
  const prefillTypeParam = searchParams.get('type') as ScenarioType | null;

  // Form State
  const initialType: ScenarioType =
    prefillTypeParam || (prefillPart ? 'spare_unavailable' : 'early_vs_run_to_failure');
  const [scenarioType, setScenarioType] = useState<ScenarioType>(initialType);
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [simulationRuns, setSimulationRuns] = useState<number>(100);
  const [randomSeed, setRandomSeed] = useState<number>(42);

  // Type-specific parameters
  // 1. schedule_maintenance
  const [schedAircraft, setSchedAircraft] = useState<string>(prefillAircraft || 'AC-017');
  const [schedStartDay, setSchedStartDay] = useState<number>(5);
  const [schedDurationDays, setSchedDurationDays] = useState<number>(3);

  // 2. spare_unavailable
  const [sparePartNumber, setSparePartNumber] = useState<string>(prefillPart || 'HYD-114');
  const [spareStockOverride, setSpareStockOverride] = useState<number>(0);
  const [spareLeadTimeDays, setSpareLeadTimeDays] = useState<number>(45);

  // 3. early_vs_run_to_failure
  const [earlyAircraft, setEarlyAircraft] = useState<string>(prefillAircraft || 'AC-017');
  const [earlyReplaceDay, setEarlyReplaceDay] = useState<number>(3);
  const [earlyDurationDays, setEarlyDurationDays] = useState<number>(1);

  // 4. extra_capacity
  const [bayIncrease, setBayIncrease] = useState<number>(2);

  // Active Simulation Result & Error
  const [activeResult, setActiveResult] = useState<ScenarioRunOut | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Saved / Pinned Scenarios for Side-by-Side Comparison (Max 3)
  const [pinnedScenarios, setPinnedScenarios] = useState<ScenarioComparisonItem[]>([]);
  const [activeTab, setActiveTab] = useState<'simulator' | 'compare' | 'history'>('simulator');

  // Queries
  const { data: aircraftData } = useAircraftList({ page_size: 100 });
  const { data: partsData } = useSpareParts();
  const { data: scenarioHistory, isLoading: loadingHistory } = useScenarioHistory();
  const runScenarioMutation = useRunScenario();

  const aircraftList = aircraftData?.items || [];
  const partsList = partsData || [];

  // Build params payload based on type
  const buildParams = useMemo(() => {
    switch (scenarioType) {
      case 'schedule_maintenance':
        return {
          aircraft_id: schedAircraft,
          start_day: Number(schedStartDay),
          duration_days: Number(schedDurationDays),
        };
      case 'spare_unavailable':
        return {
          part_number: sparePartNumber,
          stock_override: Number(spareStockOverride),
          lead_time_days: Number(spareLeadTimeDays),
        };
      case 'early_vs_run_to_failure':
        return {
          aircraft_id: earlyAircraft,
          early_replace_day: Number(earlyReplaceDay),
          planned_duration_days: Number(earlyDurationDays),
        };
      case 'extra_capacity':
        return {
          bay_increase: Number(bayIncrease),
        };
      default:
        return {};
    }
  }, [
    scenarioType,
    schedAircraft,
    schedStartDay,
    schedDurationDays,
    sparePartNumber,
    spareStockOverride,
    spareLeadTimeDays,
    earlyAircraft,
    earlyReplaceDay,
    earlyDurationDays,
    bayIncrease,
  ]);

  // Execute Simulation
  const handleExecuteSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Form validations
    if (horizonDays < 7 || horizonDays > 90) {
      setValidationError('Horizon must be configured between 7 and 90 days.');
      return;
    }
    if (simulationRuns < 50 || simulationRuns > 500) {
      setValidationError('Simulation iterations must be between 50 and 500 runs.');
      return;
    }

    try {
      const res = await runScenarioMutation.mutateAsync({
        type: scenarioType,
        params: buildParams,
        horizon_days: horizonDays,
        runs: simulationRuns,
        seed: randomSeed,
      });
      setActiveResult(res);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Simulation failed. Check parameters and try again.';
      setValidationError(errorMsg);
    }
  };

  // Pin Current Run for Comparison
  const handlePinScenario = () => {
    if (!activeResult) return;
    if (pinnedScenarios.length >= 3) {
      setValidationError('Maximum 3 scenarios can be compared side-by-side. Remove one to add this run.');
      return;
    }
    if (pinnedScenarios.some((s) => s.id === activeResult.id)) {
      return;
    }

    const typeLabels: Record<ScenarioType, string> = {
      schedule_maintenance: `Schedule Maint (${activeResult.params.aircraft_id || 'Airframe'})`,
      spare_unavailable: `Spare Outage (${activeResult.params.part_number || 'Part'})`,
      early_vs_run_to_failure: `Proactive vs RTF (${activeResult.params.aircraft_id || 'AC-017'})`,
      extra_capacity: `Capacity (+${activeResult.params.bay_increase || 2} Bays)`,
    };

    const newItem: ScenarioComparisonItem = {
      id: activeResult.id,
      name: typeLabels[activeResult.type as ScenarioType] || activeResult.type,
      type: activeResult.type as ScenarioType,
      params: activeResult.params,
      horizon_days: activeResult.horizon_days,
      runs: activeResult.runs,
      seed: activeResult.seed,
      baseline_p50: activeResult.baseline.availability_p50,
      scenario_p50: activeResult.scenario.availability_p50,
      avail_delta_pct: activeResult.delta.availability_pct_points,
      days_lost_delta: activeResult.delta.aircraft_days_lost,
      stockout_prob: activeResult.scenario.stockout_probability,
      by_cause_delta: activeResult.by_cause || {},
    };

    setPinnedScenarios([...pinnedScenarios, newItem]);
  };

  const handleUnpinScenario = (id: string) => {
    setPinnedScenarios(pinnedScenarios.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-600/20 border border-cyan-500/40 rounded-xl text-cyan-400">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-mono text-white tracking-tight">
              Scenario Simulator (What-If Engine)
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Seeded dual-leg Monte Carlo discrete-event availability simulation (§7, §9 & §10)
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700/80 rounded-lg p-1 text-xs font-mono">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded font-semibold transition ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Run Simulator
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`px-3 py-1.5 rounded font-semibold transition flex items-center space-x-1.5 ${
              activeTab === 'compare'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Compare ({pinnedScenarios.length}/3)</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded font-semibold transition flex items-center space-x-1.5 ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
          </button>
        </div>
      </div>

      {/* Validation or Error Message */}
      {validationError && (
        <div className="p-3.5 bg-rose-950/70 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 2. TAB: SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Configuration Form (5 cols) */}
          <div className="lg:col-span-5 bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-white uppercase flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-cyan-400" />
                Scenario Parameters
              </span>
              <span className="text-[10px] text-slate-500">4 Policy Types</span>
            </div>

            <form onSubmit={handleExecuteSimulation} className="space-y-4">
              {/* Scenario Type Selection */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Select Policy Type</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    {
                      id: 'early_vs_run_to_failure',
                      label: 'Proactive Early vs Run-to-Failure',
                      desc: 'Compare replacement before wear failure vs unscheduled repair',
                    },
                    {
                      id: 'schedule_maintenance',
                      label: 'Schedule Planned Maintenance',
                      desc: 'Reserve a specific airframe servicing window',
                    },
                    {
                      id: 'spare_unavailable',
                      label: 'Spare Stockout / Supply Delays',
                      desc: 'Simulate critical part stockout and supplier delivery lag',
                    },
                    {
                      id: 'extra_capacity',
                      label: 'Workshop Bay Capacity Expansion',
                      desc: 'Evaluate adding repair bays / extra maintenance shifts',
                    },
                  ].map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition ${
                        scenarioType === item.id
                          ? 'bg-blue-950/60 border-blue-500/80 text-white'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="scenarioType"
                        value={item.id}
                        checked={scenarioType === item.id}
                        onChange={() => setScenarioType(item.id as ScenarioType)}
                        className="mt-0.5 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-slate-200">{item.label}</div>
                        <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          {item.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Parameter Fields */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3">
                {scenarioType === 'early_vs_run_to_failure' && (
                  <>
                    <div>
                      <label className="block text-slate-400 mb-1">Target Airframe</label>
                      <select
                        value={earlyAircraft}
                        onChange={(e) => setEarlyAircraft(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                      >
                        {aircraftList.map((ac) => (
                          <option key={ac.aircraft_id} value={ac.aircraft_id}>
                            {ac.tail_code} ({ac.current_status})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Proactive Day</label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={earlyReplaceDay}
                          onChange={(e) => setEarlyReplaceDay(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={earlyDurationDays}
                          onChange={(e) => setEarlyDurationDays(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {scenarioType === 'schedule_maintenance' && (
                  <>
                    <div>
                      <label className="block text-slate-400 mb-1">Target Airframe</label>
                      <select
                        value={schedAircraft}
                        onChange={(e) => setSchedAircraft(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                      >
                        {aircraftList.map((ac) => (
                          <option key={ac.aircraft_id} value={ac.aircraft_id}>
                            {ac.tail_code} ({ac.current_status})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Planned Start (Day)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={schedStartDay}
                          onChange={(e) => setSchedStartDay(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Service Duration (Days)</label>
                        <input
                          type="number"
                          min={1}
                          max={14}
                          value={schedDurationDays}
                          onChange={(e) => setSchedDurationDays(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {scenarioType === 'spare_unavailable' && (
                  <>
                    <div>
                      <label className="block text-slate-400 mb-1">Critical Part Number</label>
                      <select
                        value={sparePartNumber}
                        onChange={(e) => setSparePartNumber(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                      >
                        {partsList.map((p) => (
                          <option key={p.part_number} value={p.part_number}>
                            {p.part_number} — {p.description.slice(0, 30)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Simulated Stock</label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={spareStockOverride}
                          onChange={(e) => setSpareStockOverride(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Lead Time Delay (Days)</label>
                        <input
                          type="number"
                          min={5}
                          max={90}
                          value={spareLeadTimeDays}
                          onChange={(e) => setSpareLeadTimeDays(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {scenarioType === 'extra_capacity' && (
                  <div>
                    <label className="block text-slate-400 mb-1">Additional Workshop Bays</label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={bayIncrease}
                        onChange={(e) => setBayIncrease(Number(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-white text-sm w-12 text-right">
                        +{bayIncrease} Bays
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Simulation Global Engine Parameters */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    Horizon (7–90d)
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={90}
                    value={horizonDays}
                    onChange={(e) => setHorizonDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    Runs (50–500)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={500}
                    step={25}
                    value={simulationRuns}
                    onChange={(e) => setSimulationRuns(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    RNG Seed
                  </label>
                  <input
                    type="number"
                    value={randomSeed}
                    onChange={(e) => setRandomSeed(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!canSimulate || runScenarioMutation.isPending}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-cyan-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-900/30"
              >
                {runScenarioMutation.isPending ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Executing {simulationRuns} Monte Carlo Runs...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run What-If Simulation</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Simulation Output Dashboard (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {runScenarioMutation.isPending ? (
              <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-8 text-center font-mono space-y-4">
                <RotateCcw className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                <div>
                  <h3 className="text-white font-bold text-sm">
                    Simulating {simulationRuns} Parallel Monte Carlo Trajectories
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Executing dual-leg discrete event simulation over a {horizonDays}-day horizon...
                  </p>
                </div>
                <div className="max-w-xs mx-auto bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full w-2/3 animate-pulse" />
                </div>
              </div>
            ) : !activeResult ? (
              <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-12 text-center font-mono space-y-3">
                <Sliders className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-slate-300 font-bold text-sm">Ready for Simulation</h3>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Configure the scenario policy on the left and click &quot;Run What-If Simulation&quot; to compute
                  availability trajectory curves, confidence bands, and aircraft-days delta.
                </p>
              </div>
            ) : (
              <div className="space-y-4 font-mono">
                {/* 1. Delta Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <KpiCard
                    title="Availability Delta"
                    value={`${activeResult.delta.availability_pct_points >= 0 ? '+' : ''}${
                      activeResult.delta.availability_pct_points
                    }%`}
                    subtitle={`Scenario ${(activeResult.scenario.availability_p50 * 100).toFixed(
                      1
                    )}% vs Base ${(activeResult.baseline.availability_p50 * 100).toFixed(1)}%`}
                    change={{
                      value: `${activeResult.delta.availability_pct_points}% pts`,
                      isPositive: activeResult.delta.availability_pct_points >= 0,
                      label: 'Net Delta',
                    }}
                    icon={
                      activeResult.delta.availability_pct_points >= 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <TrendingDown className="w-5 h-5" />
                      )
                    }
                    accent={activeResult.delta.availability_pct_points >= 0 ? 'emerald' : 'rose'}
                  />

                  <KpiCard
                    title="Aircraft-Days Lost Delta"
                    value={`${activeResult.delta.aircraft_days_lost >= 0 ? '+' : ''}${
                      activeResult.delta.aircraft_days_lost
                    }d`}
                    subtitle={`Total: ${activeResult.scenario.aircraft_days_lost.toFixed(1)}d lost`}
                    change={{
                      value:
                        activeResult.delta.aircraft_days_lost <= 0
                          ? 'Capacity Saved'
                          : 'Added Downtime',
                      isPositive: activeResult.delta.aircraft_days_lost <= 0,
                    }}
                    icon={<Clock className="w-5 h-5" />}
                    accent={activeResult.delta.aircraft_days_lost <= 0 ? 'emerald' : 'amber'}
                  />

                  <KpiCard
                    title="Stockout Risk"
                    value={`${(activeResult.scenario.stockout_probability * 100).toFixed(1)}%`}
                    subtitle={`Baseline: ${(activeResult.baseline.stockout_probability * 100).toFixed(
                      1
                    )}%`}
                    change={{
                      value:
                        activeResult.scenario.stockout_probability <= 0.05
                          ? 'Safe Buffer'
                          : 'Supply Constrained',
                      isPositive: activeResult.scenario.stockout_probability <= 0.05,
                    }}
                    icon={<Package className="w-5 h-5" />}
                    accent={activeResult.scenario.stockout_probability <= 0.05 ? 'cyan' : 'rose'}
                  />
                </div>

                {/* 2. Interactive Availability Trajectory Chart (Baseline vs Scenario with Bands) */}
                <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        Fleet Availability Projection (Baseline vs. Scenario)
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        P50 trajectory lines with P10–P90 Monte Carlo confidence envelope bands
                      </p>
                    </div>

                    <button
                      onClick={handlePinScenario}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Pin for Comparison</span>
                    </button>
                  </div>

                  <ScenarioTrendChart result={activeResult} />
                </div>

                {/* 3. Downtime Cause Delta Breakdown */}
                <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-400" />
                      Downtime Impact Breakdown by Cause (Days Delta)
                    </span>
                    <span className="text-slate-500 text-[10px]">Net Fleet Days</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Scheduled Servicing</div>
                      <div
                        className={`text-sm font-bold font-mono mt-0.5 ${
                          (activeResult.by_cause.scheduled || 0) > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {(activeResult.by_cause.scheduled || 0) >= 0 ? '+' : ''}
                        {activeResult.by_cause.scheduled || 0}d
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Unscheduled Repairs</div>
                      <div
                        className={`text-sm font-bold font-mono mt-0.5 ${
                          (activeResult.by_cause.unscheduled || 0) > 0
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {(activeResult.by_cause.unscheduled || 0) >= 0 ? '+' : ''}
                        {activeResult.by_cause.unscheduled || 0}d
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Supply Wait Grounding</div>
                      <div
                        className={`text-sm font-bold font-mono mt-0.5 ${
                          (activeResult.by_cause.supply_wait || 0) > 0
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {(activeResult.by_cause.supply_wait || 0) >= 0 ? '+' : ''}
                        {activeResult.by_cause.supply_wait || 0}d
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-400">Workshop Bay Queue</div>
                      <div
                        className={`text-sm font-bold font-mono mt-0.5 ${
                          (activeResult.by_cause.agency_wait || 0) > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {(activeResult.by_cause.agency_wait || 0) >= 0 ? '+' : ''}
                        {activeResult.by_cause.agency_wait || 0}d
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TAB: SIDE-BY-SIDE COMPARISON (UP TO 3 SCENARIOS) */}
      {activeTab === 'compare' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white uppercase text-sm">
                Side-by-Side Policy Comparison ({pinnedScenarios.length}/3 Pinned)
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Evaluate trade-offs between proactive replacement, run-to-failure, and workshop capacity
              </p>
            </div>
            {pinnedScenarios.length > 0 && (
              <button
                onClick={() => setPinnedScenarios([])}
                className="text-rose-400 hover:text-rose-300 text-xs flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Pinned</span>
              </button>
            )}
          </div>

          {pinnedScenarios.length === 0 ? (
            <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-12 text-center space-y-3">
              <BookmarkPlus className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-white font-bold text-sm">No Scenarios Pinned Yet</h4>
              <p className="text-slate-400 text-xs max-w-md mx-auto">
                Execute a what-if run in the &quot;Run Simulator&quot; tab and click &quot;Pin for Comparison&quot; to
                place up to three policy alternatives side-by-side.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pinnedScenarios.map((scen, idx) => (
                <div
                  key={scen.id}
                  className="bg-[#0c1220]/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider">
                          Option {idx + 1}
                        </span>
                        <h4 className="text-white font-bold text-sm mt-0.5">{scen.name}</h4>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {scen.horizon_days}d horizon • {scen.runs} runs • Seed {scen.seed}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnpinScenario(scen.id)}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Parameters Details */}
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-[11px] space-y-1">
                      <div className="text-slate-400 font-semibold uppercase text-[10px]">
                        Configuration:
                      </div>
                      {Object.entries(scen.params).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-slate-300">
                          <span className="text-slate-500">{k}:</span>
                          <span className="font-bold text-white">{String(v)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Metric Rows */}
                    <div className="space-y-2 pt-1">
                      <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                        <span className="text-slate-400">Availability (P50):</span>
                        <span className="text-white font-bold">
                          {(scen.scenario_p50 * 100).toFixed(1)}%{' '}
                          <span className="text-[10px] text-slate-500 font-normal">
                            (Base: {(scen.baseline_p50 * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                        <span className="text-slate-400">Net Delta:</span>
                        <span
                          className={`font-bold font-mono ${
                            scen.avail_delta_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {scen.avail_delta_pct >= 0 ? '+' : ''}
                          {scen.avail_delta_pct}% pts
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                        <span className="text-slate-400">Lost Days Delta:</span>
                        <span
                          className={`font-bold font-mono ${
                            scen.days_lost_delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {scen.days_lost_delta >= 0 ? '+' : ''}
                          {scen.days_lost_delta}d
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                        <span className="text-slate-400">Stockout Risk:</span>
                        <span
                          className={`font-bold font-mono ${
                            scen.stockout_prob <= 0.05 ? 'text-cyan-400' : 'text-amber-400'
                          }`}
                        >
                          {(scen.stockout_prob * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-[10px] text-slate-500 mb-1">Downtime Causes:</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span className="text-slate-400">
                        Sched: {scen.by_cause_delta.scheduled || 0}d
                      </span>
                      <span className="text-slate-400">
                        Unplanned: {scen.by_cause_delta.unscheduled || 0}d
                      </span>
                      <span className="text-slate-400">
                        Supply: {scen.by_cause_delta.supply_wait || 0}d
                      </span>
                      <span className="text-slate-400">
                        Bay Queue: {scen.by_cause_delta.agency_wait || 0}d
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB: AUDIT HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-[#0c1220]/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-slate-200">
              <History className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm uppercase">Persisted Simulation Runs (Audit Trail)</h3>
            </div>
            <span className="text-slate-400 text-[11px]">Database logs from scenario_runs</span>
          </div>

          {loadingHistory ? (
            <LoadingSkeleton rows={5} />
          ) : !scenarioHistory || scenarioHistory.length === 0 ? (
            <EmptyState
              title="No Saved Scenarios"
              message="No previous what-if simulation records found in database."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Run ID</th>
                    <th className="py-2.5 px-3">Policy Type</th>
                    <th className="py-2.5 px-3">Executed At</th>
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3 text-right">RNG Seed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {scenarioHistory.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-cyan-300">{h.id}</td>
                      <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-200">
                        {h.type}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(h.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-semibold">
                        {h.created_by || 'planner'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">{h.seed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// Subcomponent: Baseline vs Scenario Dual Curve with Bands
// ----------------------------------------------------
interface ScenarioTrendChartProps {
  result: ScenarioRunOut;
}

const ScenarioTrendChart: React.FC<ScenarioTrendChartProps> = ({ result }) => {
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const chartInstance = React.useRef<echarts.EChartsType | null>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark', { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    const baselineTrend: DailyTrendPoint[] = result.daily_trend?.baseline || [];
    const scenarioTrend: DailyTrendPoint[] = result.daily_trend?.scenario || [];

    const horizon = result.horizon_days || 30;
    const days = Array.from({ length: horizon }, (_, i) => `Day ${i + 1}`);

    // Baseline P50, P10, P90
    const baseP50 = baselineTrend.map((d) => Number((d.p50 * 100).toFixed(1)));
    const baseP10 = baselineTrend.map((d) => Number((d.p10 * 100).toFixed(1)));
    const baseP90 = baselineTrend.map((d) => Number((d.p90 * 100).toFixed(1)));

    // Scenario P50, P10, P90
    const scenP50 = scenarioTrend.map((d) => Number((d.p50 * 100).toFixed(1)));
    const scenP10 = scenarioTrend.map((d) => Number((d.p10 * 100).toFixed(1)));
    const scenP90 = scenarioTrend.map((d) => Number((d.p90 * 100).toFixed(1)));

    // Confidence band diff for stack area (P90 - P10)
    const baseBandDiff = baseP90.map((v, i) => Math.max(0, v - (baseP10[i] || 0)));
    const scenBandDiff = scenP90.map((v, i) => Math.max(0, v - (scenP10[i] || 0)));

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0c1220',
        borderColor: '#1e293b',
        textStyle: { color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: unknown) => {
          const p = params as Array<{
            seriesName: string;
            value: number;
            dataIndex: number;
            color: string;
          }>;
          if (!p || p.length === 0) return '';
          const idx = p[0].dataIndex;
          const dayLabel = days[idx];

          const b50 = baseP50[idx];
          const b10 = baseP10[idx];
          const b90 = baseP90[idx];

          const s50 = scenP50[idx];
          const s10 = scenP10[idx];
          const s90 = scenP90[idx];

          const delta = (s50 - b50).toFixed(1);

          return `
            <div style="font-family: monospace;">
              <div style="font-weight: bold; color: #38bdf8; margin-bottom: 4px;">${dayLabel} Projection</div>
              <div style="color: #60a5fa;">● Baseline P50: <strong>${b50}%</strong> (${b10}%–${b90}%)</div>
              <div style="color: #34d399;">● Scenario P50: <strong>${s50}%</strong> (${s10}%–${s90}%)</div>
              <div style="margin-top: 4px; border-top: 1px solid #334155; padding-top: 4px; color: ${
                Number(delta) >= 0 ? '#34d399' : '#f87171'
              };">
                Delta: <strong>${Number(delta) >= 0 ? '+' : ''}${delta}% points</strong>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['Baseline (P50)', 'Scenario (P50)'],
        textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        top: 0,
        right: 10,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '14%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: days,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          fontFamily: 'monospace',
          interval: Math.max(1, Math.floor(horizon / 8)),
        },
      },
      yAxis: {
        type: 'value',
        name: 'Availability %',
        min: 60,
        max: 100,
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        // Baseline Band Lower (invisible stack base)
        {
          name: 'Base P10',
          type: 'line',
          data: baseP10,
          lineStyle: { opacity: 0 },
          stack: 'base-band',
          symbol: 'none',
          tooltip: { show: false },
        },
        // Baseline Band Area
        {
          name: 'Base Envelope',
          type: 'line',
          data: baseBandDiff,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(59, 130, 246, 0.12)' },
          stack: 'base-band',
          symbol: 'none',
          tooltip: { show: false },
        },
        // Scenario Band Lower
        {
          name: 'Scen P10',
          type: 'line',
          data: scenP10,
          lineStyle: { opacity: 0 },
          stack: 'scen-band',
          symbol: 'none',
          tooltip: { show: false },
        },
        // Scenario Band Area
        {
          name: 'Scen Envelope',
          type: 'line',
          data: scenBandDiff,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(16, 185, 129, 0.12)' },
          stack: 'scen-band',
          symbol: 'none',
          tooltip: { show: false },
        },
        // Baseline P50 Line
        {
          name: 'Baseline (P50)',
          type: 'line',
          data: baseP50,
          itemStyle: { color: '#3b82f6' },
          lineStyle: { width: 2.5, color: '#3b82f6', type: 'dashed' },
          symbol: 'circle',
          symbolSize: 4,
        },
        // Scenario P50 Line
        {
          name: 'Scenario (P50)',
          type: 'line',
          data: scenP50,
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 3, color: '#10b981' },
          symbol: 'circle',
          symbolSize: 4,
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [result]);

  return <div ref={chartRef} className="w-full h-80" />;
};

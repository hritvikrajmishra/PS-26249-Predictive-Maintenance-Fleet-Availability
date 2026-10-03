import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

interface HealthData {
  status: string;
  backend: string;
  database: string;
  database_detail?: string | null;
  environment: string;
  synthetic_data: boolean;
  version: string;
}

const PHASES = [
  { id: 0, name: 'Repo & Environment', status: 'active', desc: 'Native skeleton, PostgreSQL & task runner' },
  { id: 1, name: 'Data Model', status: 'upcoming', desc: 'Relational schema & Alembic migrations' },
  { id: 2, name: 'Synthetic Data', status: 'upcoming', desc: 'Telemetry & maintenance simulator' },
  { id: 3, name: 'Backend Foundation', status: 'upcoming', desc: 'FastAPI CRUD, JWT auth, ingestion API' },
  { id: 4, name: 'ML Pipeline', status: 'upcoming', desc: 'Anomaly, failure risk & RUL models' },
  { id: 5, name: 'Maintenance Engine', status: 'upcoming', desc: 'Advisories, scoring & prioritization' },
  { id: 6, name: 'Availability Engine', status: 'upcoming', desc: 'Monte Carlo fleet simulator & KPIs' },
  { id: 7, name: 'Digital Twin', status: 'upcoming', desc: 'Hierarchical twin states & replay' },
  { id: 8, name: 'Frontend Dashboard', status: 'upcoming', desc: 'Mission cockpit, twin viewer & analytics' },
];

export default function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const response = await fetch('/api/v1/health');
      const elapsed = Math.round(performance.now() - start);
      setPingLatency(elapsed);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      const data: HealthData = await response.json();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to backend';
      setError(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isBackendOk = health?.backend === 'ok';
  const isDbOk = health?.database === 'connected';

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Banner: Synthetic Data Notice (Mandatory per Project Rules) */}
      <header className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs font-mono text-amber-300">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="font-semibold uppercase tracking-wider">
            [SYNTHETIC DATA ONLY] - Decision-Support Platform Demonstration
          </span>
        </div>
        <div className="hidden md:flex items-center space-x-4 text-amber-400/80">
          <span>Problem Statement: 26249</span>
          <span>•</span>
          <span>Zero Real Flight/Operational Records</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Navigation & Header */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Activity className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Predictive Maintenance & Fleet Availability
              </h1>
            </div>
            <p className="text-slate-400 text-sm">
              Integrated Air Power Decision-Support Architecture • Phase 0 Local Environment
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              <span>{loading ? 'Probing...' : 'Refresh Status'}</span>
            </button>
          </div>
        </section>

        {/* System Health Status Cards */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span>Native Infrastructure Health</span>
            </h2>
            {lastChecked && (
              <span className="text-xs text-slate-500 font-mono">
                Last verified: {lastChecked.toLocaleTimeString()} ({pingLatency}ms)
              </span>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm">Backend Connectivity Error</h3>
                <p className="text-xs text-red-300 mt-1">{error}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Verify the backend is running at <code className="bg-slate-800 px-1 py-0.5 rounded">http://127.0.0.1:8000</code> or run <code className="bg-slate-800 px-1 py-0.5 rounded">python scripts/tasks.py dev</code>.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Backend API Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-xl ${isBackendOk ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">FastAPI Backend</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">GET /api/v1/health</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isBackendOk ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}`}>
                    {isBackendOk ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Backend OK
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Offline
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Environment</span>
                  <span className="font-mono text-slate-300">{health?.environment || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Roundtrip Latency</span>
                  <span className="font-mono text-slate-300">{pingLatency ? `${pingLatency} ms` : '—'}</span>
                </div>
              </div>
            </div>

            {/* PostgreSQL Database Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-xl ${isDbOk ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">PostgreSQL Database</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">AsyncPG Driver • native 16</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isDbOk ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                    {isDbOk ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Database OK
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        {health?.database || 'Disconnected'}
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Database Target</span>
                  <span className="font-mono text-slate-300">fleetmaint</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Connection State</span>
                  <span className="font-mono text-slate-300">{health?.database === 'connected' ? 'Connected (SELECT 1)' : 'Awaiting Connection'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Phased Roadmap & Architecture Overview */}
        <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Project Implementation Roadmap (PS 26249)</span>
            </h2>
            <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
              Phase 0 Complete
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PHASES.map((phase) => (
              <div
                key={phase.id}
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  phase.status === 'active'
                    ? 'border-blue-500/60 bg-blue-950/20 text-blue-100 shadow-md ring-1 ring-blue-500/40'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-200">
                    Phase {phase.id}: {phase.name}
                  </span>
                  {phase.status === 'active' && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{phase.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Developer Commands reference */}
        <section className="p-5 rounded-2xl border border-slate-800 bg-slate-900/20 text-xs">
          <h3 className="font-semibold text-slate-300 mb-2 flex items-center space-x-2">
            <span>Unified Cross-Platform Task Runner</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <code className="text-blue-400 font-mono">scripts/tasks.py</code>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-emerald-400 block mb-0.5">python scripts/tasks.py dev</span>
              <span className="text-slate-500">Starts FastAPI & Vite dev server</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-blue-400 block mb-0.5">python scripts/tasks.py test</span>
              <span className="text-slate-500">Runs pytest & vitest suites</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-amber-400 block mb-0.5">python scripts/tasks.py lint</span>
              <span className="text-slate-500">Executes ruff & eslint check</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-purple-400 block mb-0.5">python scripts/tasks.py migrate</span>
              <span className="text-slate-500">Database migrations status</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        SIH 2026 Problem Statement 26249 • Integrated Predictive Maintenance & Fleet Availability Platform • Decision-Support System
      </footer>
    </div>
  );
}

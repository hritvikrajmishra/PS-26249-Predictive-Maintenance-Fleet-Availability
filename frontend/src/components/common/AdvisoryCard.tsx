import React, { useState, useMemo } from 'react';
import { AlertCircle, CheckCircle, Calendar, XCircle, ArrowUpRight, ShieldAlert, Cpu } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { AdvisoryOut } from '../../types/api';
import { useUpdateAdvisory } from '../../hooks/useEngineQueries';
import { useAuth } from '../../hooks/useAuth';

interface AdvisoryCardProps {
  advisory: AdvisoryOut;
  onNavigateComponent?: (componentId: string) => void;
  onSchedule?: (advisory: AdvisoryOut) => void;
  compact?: boolean;
}

export const AdvisoryCard: React.FC<AdvisoryCardProps> = ({
  advisory,
  onNavigateComponent,
  onSchedule,
  compact = false,
}) => {
  const { role } = useAuth();
  const updateMutation = useUpdateAdvisory();
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const canAction = role === 'commander' || role === 'planner';

  const handleAccept = async () => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        id: advisory.advisory_id,
        payload: { status: 'accepted' },
      });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept advisory');
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        id: advisory.advisory_id,
        payload: { status: 'dismissed', reason: dismissReason.trim() },
      });
      setShowDismissModal(false);
      setDismissReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to dismiss advisory');
    }
  };

  const explanationDrivers: Array<{ feature: string; impact: number }> = useMemo(() => {
    const raw =
      advisory.explanation?.top_shap_factors ||
      advisory.explanation?.top_factors ||
      advisory.explanation?.top_drivers ||
      [];
    return raw.map((item) => ({
      feature: item.feature,
      impact:
        'shap_impact' in item && typeof item.shap_impact === 'number'
          ? item.shap_impact
          : 'impact' in item && typeof item.impact === 'number'
          ? item.impact
          : 0,
    }));
  }, [advisory.explanation]);

  return (
    <div className="bg-[#0c1220]/90 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
      {/* Top Banner & Priority */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <StatusBadge status={advisory.priority} size="md" />
            <StatusBadge status={advisory.status} size="sm" />
            {advisory.spare_status && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Spare: {advisory.spare_status}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-500">{advisory.as_of_date}</span>
        </div>

        {/* Title / Action */}
        <h4 className="text-base font-semibold text-white font-mono flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{advisory.action}</span>
        </h4>

        {/* Component & Airframe info */}
        <div className="mt-2 text-xs font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Airframe:{' '}
            <strong className="text-slate-200">{advisory.tail_code || advisory.aircraft_id || 'N/A'}</strong>
          </span>
          <span>
            System: <strong className="text-slate-200">{advisory.system_name || 'N/A'}</strong>
          </span>
          <span className="flex items-center gap-1">
            Component:{' '}
            <button
              onClick={() => onNavigateComponent && onNavigateComponent(advisory.component_id)}
              className="text-blue-400 hover:underline flex items-center font-bold"
            >
              {advisory.component_name || advisory.component_id}
              <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </button>
          </span>
        </div>

        {/* Expected Downtime */}
        {advisory.expected_downtime_days !== null && advisory.expected_downtime_days !== undefined && (
          <div className="mt-2 text-xs font-mono text-slate-400">
            Estimated turnaround loss:{' '}
            <span className="text-amber-400 font-bold">{advisory.expected_downtime_days} days</span>
          </div>
        )}

        {/* SHAP Drivers / Explanation */}
        {!compact && explanationDrivers.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider font-mono text-slate-400 font-semibold block mb-1.5 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Primary Degradation Drivers (ML Attribution)
            </span>
            <div className="space-y-1">
              {explanationDrivers.slice(0, 3).map((driver, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 truncate max-w-[200px]">{driver.feature}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.abs(driver.impact) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-cyan-300 w-8 text-right">
                      {driver.impact > 0 ? `+${driver.impact.toFixed(2)}` : driver.impact.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {advisory.dismiss_reason && (
          <div className="mt-2 p-2 bg-rose-950/30 border border-rose-800/40 rounded text-xs font-mono text-rose-300">
            <strong>Dismissal Reason:</strong> {advisory.dismiss_reason}
          </div>
        )}

        {actionError && (
          <div className="mt-2 p-2 bg-rose-950/50 border border-rose-500/50 rounded text-xs text-rose-200">
            {actionError}
          </div>
        )}
      </div>

      {/* Action Buttons (Human-in-the-loop workflow) */}
      {advisory.status === 'proposed' && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          {canAction ? (
            <>
              <button
                onClick={handleAccept}
                disabled={updateMutation.isPending}
                className="flex-1 py-1.5 px-3 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-xs font-mono font-semibold flex items-center justify-center gap-1 transition"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Accept
              </button>

              <button
                onClick={() => (onSchedule ? onSchedule(advisory) : undefined)}
                className="flex-1 py-1.5 px-3 bg-blue-600/80 hover:bg-blue-500 text-white rounded text-xs font-mono font-semibold flex items-center justify-center gap-1 transition"
              >
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>

              <button
                onClick={() => setShowDismissModal(true)}
                disabled={updateMutation.isPending}
                className="py-1.5 px-2.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 rounded text-xs font-mono transition"
                title="Dismiss with reason"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <span className="text-[11px] font-mono text-slate-500 italic">
              Read-only view (Requires Planner / Commander role to accept or schedule)
            </span>
          )}
        </div>
      )}

      {/* Dismiss Reason Modal */}
      {showDismissModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleDismissSubmit}
            className="bg-[#0e1629] border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold text-sm font-mono uppercase tracking-wider text-white">
                Mandatory Dismissal Audit Log
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              Provide an engineering justification for overriding predictive advisory #{advisory.advisory_id}:
            </p>
            <textarea
              required
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Component inspected visually and verified nominal; sensor drift suspected."
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowDismissModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!dismissReason.trim() || updateMutation.isPending}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded text-xs font-mono font-semibold"
              >
                Confirm Dismissal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

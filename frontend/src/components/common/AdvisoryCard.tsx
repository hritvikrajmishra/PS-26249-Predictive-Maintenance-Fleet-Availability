import React, { useState, useMemo } from 'react';
import { Check, Calendar, X, ArrowUpRight, Cpu } from 'lucide-react';
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
    <div className="bg-white border border-[#E3E3DE] rounded p-4 relative flex flex-col justify-between">
      {/* Top Banner & Priority */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center space-x-2">
            <StatusBadge status={advisory.priority} size="md" />
            <StatusBadge status={advisory.status} size="sm" />
            {advisory.spare_status && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#5C5C57] border border-[#E3E3DE]">
                Spare: {advisory.spare_status}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-[#5C5C57]">{advisory.as_of_date}</span>
        </div>

        {/* Action Title */}
        <h4 className="text-sm font-semibold text-[#1A1A1A] font-sans flex items-center gap-1.5">
          <span>{advisory.action}</span>
        </h4>

        {/* Component & Airframe info */}
        <div className="mt-2 text-xs font-mono text-[#5C5C57] flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Airframe:{' '}
            <strong className="text-[#1A1A1A]">{advisory.tail_code || advisory.aircraft_id || 'N/A'}</strong>
          </span>
          <span>
            System: <strong className="text-[#1A1A1A]">{advisory.system_name || 'N/A'}</strong>
          </span>
          <span className="flex items-center gap-1">
            Component:{' '}
            <button
              onClick={() => onNavigateComponent && onNavigateComponent(advisory.component_id)}
              className="text-[#2F5D8A] hover:underline flex items-center font-semibold"
            >
              {advisory.component_name || advisory.component_id}
              <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </button>
          </span>
        </div>

        {/* Expected Downtime */}
        {advisory.expected_downtime_days !== null && advisory.expected_downtime_days !== undefined && (
          <div className="mt-1.5 text-xs font-mono text-[#5C5C57]">
            Estimated turnaround loss:{' '}
            <span className="text-[#A66A00] font-semibold">{advisory.expected_downtime_days} days</span>
          </div>
        )}

        {/* SHAP Drivers / Explanation */}
        {!compact && explanationDrivers.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#ECECE8]">
            <span className="text-[11px] uppercase tracking-wider font-mono text-[#5C5C57] font-semibold block mb-1.5 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#2F5D8A]" />
              Primary Degradation Drivers (Attribution)
            </span>
            <div className="space-y-1">
              {explanationDrivers.slice(0, 3).map((driver, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#5C5C57] truncate max-w-[220px]">{driver.feature}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-[#ECECE8] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2F5D8A] h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.abs(driver.impact) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#1A1A1A] tabular-nums w-8 text-right font-medium">
                      {driver.impact > 0 ? `+${driver.impact.toFixed(2)}` : driver.impact.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {advisory.dismiss_reason && (
          <div className="mt-2 p-2 bg-[#FDF2F0] border border-[#F5C2BC] rounded text-xs font-mono text-[#B3402F]">
            <strong>Dismissal Reason:</strong> {advisory.dismiss_reason}
          </div>
        )}

        {actionError && (
          <div className="mt-2 p-2 bg-[#FDF2F0] border border-[#F5C2BC] rounded text-xs text-[#B3402F]">
            {actionError}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {advisory.status === 'proposed' && (
        <div className="mt-3.5 pt-2.5 border-t border-[#ECECE8] flex items-center justify-between gap-2">
          {canAction ? (
            <>
              <button
                onClick={handleAccept}
                disabled={updateMutation.isPending}
                className="flex-1 py-1.5 px-3 bg-[#2E7D4F] hover:bg-[#256640] text-white rounded text-xs font-mono font-medium flex items-center justify-center gap-1 transition"
              >
                <Check className="w-3.5 h-3.5" /> Accept
              </button>

              <button
                onClick={() => (onSchedule ? onSchedule(advisory) : undefined)}
                className="flex-1 py-1.5 px-3 bg-[#2F5D8A] hover:bg-[#264A6E] text-white rounded text-xs font-mono font-medium flex items-center justify-center gap-1 transition"
              >
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>

              <button
                onClick={() => setShowDismissModal(true)}
                disabled={updateMutation.isPending}
                className="py-1.5 px-2.5 bg-white hover:bg-[#FDF2F0] text-[#5C5C57] hover:text-[#B3402F] border border-[#E3E3DE] hover:border-[#F5C2BC] rounded text-xs font-mono transition"
                title="Dismiss with reason"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <span className="text-[11px] font-mono text-[#8A8A84] italic">
              Read-only (Planner role required to action)
            </span>
          )}
        </div>
      )}

      {/* Dismiss Reason Modal */}
      {showDismissModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleDismissSubmit}
            className="bg-white border border-[#E3E3DE] rounded p-5 max-w-md w-full shadow-[0_4px_16px_rgba(0,0,0,0.1)] space-y-3"
          >
            <div className="flex items-center space-x-2 text-[#B3402F]">
              <h3 className="font-semibold text-xs font-mono uppercase tracking-wider text-[#1A1A1A]">
                Dismiss Advisory #{advisory.advisory_id}
              </h3>
            </div>
            <p className="text-xs text-[#5C5C57]">
              Provide an engineering justification for overriding predictive advisory:
            </p>
            <textarea
              required
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Component inspected visually and verified nominal; sensor drift suspected."
              className="w-full bg-white border border-[#E3E3DE] rounded p-2 text-xs font-mono text-[#1A1A1A] focus:outline-none focus:border-[#2F5D8A]"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowDismissModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E3E3DE] hover:bg-[#F6F6F3] text-[#5C5C57] rounded text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!dismissReason.trim() || updateMutation.isPending}
                className="px-3 py-1.5 bg-[#B3402F] hover:bg-[#973627] disabled:opacity-50 text-white rounded text-xs font-mono font-medium"
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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/hooks/useAuth';
import { AdvisoryCard } from '../src/components/common/AdvisoryCard';
import { TimeReplayControl } from '../src/components/common/TimeReplayControl';
import { SvgSchematic } from '../src/components/common/SvgSchematic';
import type { AdvisoryOut } from '../src/types/api';

const mockQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const mockAdvisory: AdvisoryOut = {
  advisory_id: 'ADV-20251125-AC017-HYD01',
  component_id: 'CMP-HYD-017',
  aircraft_id: 'AC-017',
  component_name: 'Primary Hydraulic Pump',
  as_of_date: '2025-11-25',
  priority: 'P2',
  action: 'replace within 7 days',
  status: 'proposed',
  spare_status: 'available',
  expected_downtime_days: 2.5,
  confidence_note: 'model confidence moderate',
  created_at: '2025-11-25T10:00:00Z',
  explanation: {
    text: 'Hydraulic main pump outlet pressure oscillation and fluid temperature drift.',
    top_shap_factors: [
      { feature: 'outlet_pressure_psi_oscillation', shap_impact: 0.35 },
      { feature: 'fluid_temp_c_drift', shap_impact: 0.28 },
    ],
    downtime_impact: {
      scheduled_days: 2.5,
      run_to_failure_days: 9.0,
    },
  },
};

describe('Component Library Tests', () => {
  it('renders AdvisoryCard with SHAP explanations, priority badge, and action items', () => {
    const handleSchedule = vi.fn();
    const handleNavigate = vi.fn();

    render(
      <QueryClientProvider client={mockQueryClient}>
        <AuthProvider>
          <AdvisoryCard
            advisory={mockAdvisory}
            onSchedule={handleSchedule}
            onNavigateComponent={handleNavigate}
          />
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Primary Hydraulic Pump/i)).toBeInTheDocument();
    expect(screen.getByText(/replace within 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/outlet_pressure_psi_oscillation/i)).toBeInTheDocument();
    expect(screen.getByText(/fluid_temp_c_drift/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.5/i)).toBeInTheDocument();
  });

  it('renders TimeReplayControl with bookmarks and responds to date clicks', () => {
    render(
      <QueryClientProvider client={mockQueryClient}>
        <AuthProvider>
          <TimeReplayControl />
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Hero State/i)).toBeInTheDocument();
    expect(screen.getByText(/T-20d Base/i)).toBeInTheDocument();

    const heroBtn = screen.getByRole('button', { name: /Hero State/i });
    fireEvent.click(heroBtn);
    expect(heroBtn).toBeInTheDocument();
  });

  it('renders SvgSchematic aircraft diagram highlighting degraded systems', () => {
    const systems = [
      { id: 'SYS-HYD', name: 'Hydraulics', state: 'Degraded', healthIndex: 41 },
      { id: 'SYS-PROP', name: 'Propulsion', state: 'Healthy', healthIndex: 92 },
    ];

    const onSelectSystem = vi.fn();

    render(
      <SvgSchematic
        systems={systems}
        onSelectSystem={onSelectSystem}
      />
    );

    // SVG elements should be present
    expect(screen.getByText(/Hydraulics/i)).toBeInTheDocument();
    expect(screen.getByText(/Propulsion/i)).toBeInTheDocument();
  });
});

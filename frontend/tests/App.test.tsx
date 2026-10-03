import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

describe('App Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders synthetic data notice banner', async () => {
    // Mock successful health response
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'healthy',
        backend: 'ok',
        database: 'connected',
        environment: 'development',
        synthetic_data: true,
        version: '0.1.0',
      }),
    } as Response);

    render(<App />);

    expect(screen.getByText(/SYNTHETIC DATA ONLY/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Predictive Maintenance & Fleet Availability/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Backend OK/i)).toBeInTheDocument();
      expect(screen.getByText(/Database OK/i)).toBeInTheDocument();
    });
  });

  it('displays degraded state if database is disconnected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'degraded',
        backend: 'ok',
        database: 'disconnected',
        database_detail: 'Connection refused',
        environment: 'development',
        synthetic_data: true,
        version: '0.1.0',
      }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Backend OK/i)).toBeInTheDocument();
      expect(screen.getByText(/Disconnected/i)).toBeInTheDocument();
    });
  });
});

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { FleetDashboardPage } from './pages/FleetDashboardPage';
import { AircraftDetailPage } from './pages/AircraftDetailPage';
import { ComponentHealthPage } from './pages/ComponentHealthPage';
import { PredictiveQueuePage } from './pages/PredictiveQueuePage';
import { PlanningPage } from './pages/PlanningPage';
import { SparesPage } from './pages/SparesPage';
import { SimulatorPage } from './pages/SimulatorPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const ProtectedLayout: React.FC = () => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center font-mono text-slate-400">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs uppercase tracking-wider">Initializing AeroPulse Session...</span>
      </div>
    );
  }

  // If unauthenticated, redirect to login
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
};

export default function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<ProtectedLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<FleetDashboardPage />} />
              <Route path="aircraft" element={<AircraftDetailPage />} />
              <Route path="components" element={<ComponentHealthPage />} />
              <Route path="components/:id" element={<ComponentHealthPage />} />
              <Route path="advisories" element={<PredictiveQueuePage />} />
              <Route path="planning" element={<PlanningPage />} />
              <Route path="spares" element={<SparesPage />} />
              <Route path="scenarios" element={<SimulatorPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

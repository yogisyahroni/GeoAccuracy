import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';

import { useAuthStore } from '@/store/useAuthStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
// FIX BUG-12: Import ErrorBoundary to prevent "White Screen of Death" on render errors.
import { ErrorBoundary } from '@/components/ErrorBoundary';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import HistoryPage from '@/pages/History';
import AnalyticsPage from '@/pages/Analytics';
import SettingsPage from '@/pages/Settings';
import DataIntegrationPage from '@/pages/DataIntegration';
import AreasPage from '@/pages/Areas';
import AdvancedAnalyticsPage from '@/pages/AdvancedAnalytics';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

function AppRoutes() {
  const hydrate = useAuthStore(s => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected — all inside AppShell */}
      <Route element={<AppShell />}>
        {/*
          FIX BUG-12: Each protected page is wrapped in its own <ErrorBoundary>.
          Without this, any uncaught JavaScript error in a page's render cycle
          tears down the ENTIRE React tree and shows a blank white page in production.
          With per-page boundaries, only the crashing page shows a recovery UI;
          the sidebar navigation and header remain usable.
        */}
        <Route
          path="/"
          element={
            <ErrorBoundary sectionLabel="Dashboard">
              <Dashboard />
            </ErrorBoundary>
          }
        />
        <Route
          path="/history"
          element={
            <ErrorBoundary sectionLabel="Riwayat">
              <HistoryPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/analytics"
          element={
            <ErrorBoundary sectionLabel="Analytics">
              <AnalyticsPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/advanced-analytics"
          element={
            <ErrorBoundary sectionLabel="Advanced Analytics">
              <AdvancedAnalyticsPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/integration"
          element={
            <ErrorBoundary sectionLabel="Data Integration">
              <DataIntegrationPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/areas"
          element={
            <ErrorBoundary sectionLabel="Area Management">
              <AreasPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/settings"
          element={
            <ErrorBoundary sectionLabel="Pengaturan">
              <SettingsPage />
            </ErrorBoundary>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/*
          Top-level boundary as a last resort — catches any error outside page routes
          (e.g. in AppShell itself or the routing layer).
        */}
        <ErrorBoundary sectionLabel="aplikasi">
          <AppRoutes />
        </ErrorBoundary>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

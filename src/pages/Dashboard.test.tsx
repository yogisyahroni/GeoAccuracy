import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('sonner', () => ({
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/lib/api')>();
    return {
        ...mod,
        batchApi: {
            listBatches: vi.fn().mockResolvedValue([]),
            getBatchResults: vi.fn().mockResolvedValue([]),
        }
    };
});

describe('Dashboard Component (Analytics)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock default User
        useAuthStore.setState({
            user: { id: 1, name: 'Admin', email: 'admin@t.com', role: 'admin', tenant_id: 1 },
            isAuthenticated: true,
        });

        // Mock ResizeObserver for Recharts
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
    });

    const renderDashboard = () => render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>
    );

    it('renders instruction banner for normal users', async () => {
        renderDashboard();
        expect(screen.getByText('Cara Penggunaan')).toBeInTheDocument();
        expect(screen.queryByText(/Akses Terbatas/i)).not.toBeInTheDocument();
    });

    it('renders correctly for Observer role and hides DatabaseConnector', async () => {
        useAuthStore.setState({
            user: { id: 99, name: 'Obs', email: 'obs@t.com', role: 'observer', tenant_id: 1 },
        });

        renderDashboard();

        // Should see restricted banner
        expect(screen.getByText('Mode Akses Terbatas (Observer)')).toBeInTheDocument();

        // Should wait to let useEffect finish
        await waitFor(() => {
            expect(screen.queryByText('DatabaseConnector Component Text')).not.toBeInTheDocument();
        });
    });
});

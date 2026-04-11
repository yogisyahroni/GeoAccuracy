import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DataIntegration from './DataIntegration';
import { integrationApi } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        promise: vi.fn(),
    },
}));

vi.mock('@/lib/api', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/lib/api')>();
    return {
        ...mod,
        integrationApi: {
            getDataSources: vi.fn().mockResolvedValue([]),
            getTables: vi.fn().mockResolvedValue([]),
            saveDataSource: vi.fn().mockResolvedValue({ id: 1, name: 'DS' }),
            getPipelines: vi.fn().mockResolvedValue([]),
        }
    };
});

describe('DataIntegration Component (Pipeline Builder)', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient();
        vi.clearAllMocks();
    });

    const renderWithProvider = (component: React.ReactElement) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    {component}
                </MemoryRouter>
            </QueryClientProvider>
        );
    };

    it('renders tabs and correctly displays default Connections tab', async () => {
        renderWithProvider(<DataIntegration />);

        expect(screen.getByText(/Data Orchestrator/i)).toBeInTheDocument();

        // Assert elements on DataSource tab
        await waitFor(() => {
            expect(screen.getByText(/Repository/i)).toBeInTheDocument();
        });
    });

    it('switches to Pipeline builder tab successfully', async () => {
        renderWithProvider(<DataIntegration />);

        const pipelineTabs = screen.getAllByText(/Local Pipeline/i);
        fireEvent.click(pipelineTabs[1] || pipelineTabs[0]); // The tab button

        await waitFor(() => {
            // Check if pipeline builder empty state or form is visible
            expect(screen.getByText(/MANAGING PIPELINES/i)).toBeInTheDocument();
        });
    });
});

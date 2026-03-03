import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';

// Mock dependecies
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/api', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/lib/api')>();
    return {
        ...mod,
        authApi: {
            login: vi.fn(),
        },
    };
});

// Avoid triggering ResizeObserver errors in some environments if any components use it
const ResizeObserverMock = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('Login Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset auth store
        useAuthStore.getState().logout();
    });

    it('renders login form correctly', () => {
        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        expect(screen.getByText('Masuk ke akun Anda')).toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Masuk/i })).toBeInTheDocument();
    });

    it('shows validation errors when submitting empty form', async () => {
        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        const submitButton = screen.getByRole('button', { name: /Masuk/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Email wajib diisi')).toBeInTheDocument();
            expect(screen.getByText('Password minimal 8 karakter')).toBeInTheDocument();
        });

        expect(authApi.login).not.toHaveBeenCalled();
    });

    it('calls authApi.login and updates global state on successful login', async () => {
        const mockUser = {
            id: 1,
            name: 'Test Admin',
            email: 'admin@test.com',
            role: 'admin',
            tenant_id: 1,
        };
        const mockToken = 'mock-jwt-token';

        (authApi.login as any).mockResolvedValueOnce({
            user: mockUser,
            access_token: mockToken,
            refresh_token: 'mock-refresh',
        });

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        const emailInput = screen.getByLabelText('Email');
        const passwordInput = screen.getByLabelText('Password');
        const submitButton = screen.getByRole('button', { name: /Masuk/i });

        fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(authApi.login).toHaveBeenCalledWith({
                email: 'admin@test.com',
                password: 'password123',
            });
        });

        await waitFor(() => {
            const state = useAuthStore.getState();
            expect(state.isAuthenticated).toBe(true);
            expect(state.user).toEqual(mockUser);
            expect(state.token).toEqual(mockToken);
        });

        expect(toast.success).toHaveBeenCalledWith('Selamat datang, Test Admin! 👋');
    });

    it('displays toast error when login fails', async () => {
        (authApi.login as any).mockRejectedValueOnce(
            new Error('Invalid credentials')
        );

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fail@test.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
        fireEvent.click(screen.getByRole('button', { name: /Masuk/i }));

        await waitFor(() => {
            expect(authApi.login).toHaveBeenCalled();
            expect(toast.error).toHaveBeenCalled();
        });

        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
    });
});

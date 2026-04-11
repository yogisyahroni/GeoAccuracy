import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_BASE_URL, ApiError, authApi, comparisonApi, geocodeApi } from '../lib/api';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    // api.ts uses localStorage (not sessionStorage) for token storage
    localStorage.clear();
    mockFetch.mockReset();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

// ─── authApi.login tests ──────────────────────────────────────────────────────

describe('authApi.login', () => {
    it('should POST to /api/auth/login and return token + user on 200', async () => {
        const fakeUser = { id: 1, name: 'Budi', email: 'budi@test.com', role: 'user' };
        mockFetch.mockResolvedValueOnce(
            mockResponse(200, { access_token: 'tok123', user: fakeUser }),
        );

        const result = await authApi.login({ email: 'budi@test.com', password: 'Password1' });

        expect(mockFetch).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/auth/login`,
            expect.objectContaining({ method: 'POST' }),
        );
        expect(result.access_token).toBe('tok123');
        expect(result.user).toEqual(fakeUser);
    });

    it('should throw ApiError with status 401 on invalid credentials', async () => {
        mockFetch.mockResolvedValueOnce(
            mockResponse(401, { message: 'Invalid credentials' }),
        );

        await expect(
            authApi.login({ email: 'x@x.com', password: 'wrongpass' }),
        ).rejects.toMatchObject({ status: 401, name: 'ApiError' });
    });

    it('should throw ApiError with status 0 on network failure', async () => {
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        await expect(
            authApi.login({ email: 'x@x.com', password: 'test' }),
        ).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    });
});

// ─── authApi.register tests ───────────────────────────────────────────────────

describe('authApi.register', () => {
    it('should POST to /api/auth/register and return token + user on 201', async () => {
        const fakeUser = { id: 2, name: 'Sari', email: 'sari@test.com', role: 'user' };
        mockFetch.mockResolvedValueOnce(
            mockResponse(201, { access_token: 'newTok', user: fakeUser }),
        );

        const result = await authApi.register({
            name: 'Sari',
            email: 'sari@test.com',
            password: 'Password1',
        });

        expect(result.user.name).toBe('Sari');
        expect(result.access_token).toBe('newTok');
    });

    it('should throw ApiError 409 when email already exists', async () => {
        mockFetch.mockResolvedValueOnce(
            mockResponse(409, { message: 'Email already registered' }),
        );

        await expect(
            authApi.register({ name: 'Test', email: 'dup@test.com', password: 'Password1' }),
        ).rejects.toMatchObject({ status: 409 });
    });
});

// ─── comparisonApi.compareBatch tests ────────────────────────────────────────

describe('comparisonApi.compareBatch', () => {
    it('should include credentials in the request', async () => {
        mockFetch.mockResolvedValueOnce(
            mockResponse(200, { results: [] }),
        );

        await comparisonApi.compareBatch({ items: [] });

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callArgs.credentials).toBe('include');
        // Authorization header should NOT be present (Grade S++ Cookie Auth)
        expect((callArgs.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });
});

// ─── geocodeApi.geocode tests ─────────────────────────────────────────────────

describe('geocodeApi.geocode', () => {
    it('should POST to /api/geocode with credentials', async () => {
        mockFetch.mockResolvedValueOnce(
            mockResponse(200, { lat: -6.2, lng: 106.816, display_name: 'Jakarta', cached: false }),
        );

        const result = await geocodeApi.geocode({
            address: 'Jl. Sudirman',
            city: 'Jakarta',
            province: 'DKI Jakarta',
        });

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callArgs.credentials).toBe('include');
        expect(result.lat).toBe(-6.2);
    });
});

// ─── ApiError shape ───────────────────────────────────────────────────────────

describe('ApiError', () => {
    it('should carry status, code, and message', () => {
        const err = new ApiError(422, 'VALIDATION', 'Invalid input');
        expect(err.status).toBe(422);
        expect(err.code).toBe('VALIDATION');
        expect(err.message).toBe('Invalid input');
        expect(err instanceof Error).toBe(true);
    });
});

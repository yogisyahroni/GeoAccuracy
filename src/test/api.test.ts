import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_BASE_URL, ApiError, authApi, comparisonApi, geocodeApi } from '../lib/api';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    // Reset sessionStorage before each test
    sessionStorage.clear();
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
            mockResponse(200, { token: 'tok123', user: fakeUser }),
        );

        const result = await authApi.login({ email: 'budi@test.com', password: 'Password1' });

        expect(mockFetch).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/auth/login`,
            expect.objectContaining({ method: 'POST' }),
        );
        expect(result.token).toBe('tok123');
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
            mockResponse(201, { token: 'newTok', user: fakeUser }),
        );

        const result = await authApi.register({
            name: 'Sari',
            email: 'sari@test.com',
            password: 'Password1',
        });

        expect(result.user.name).toBe('Sari');
        expect(result.token).toBe('newTok');
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
    it('should throw ApiError 401 if token is missing', async () => {
        // No token in sessionStorage
        await expect(
            comparisonApi.compareBatch({ records: [] }),
        ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    });

    it('should inject Authorization header when token is present', async () => {
        sessionStorage.setItem('geoaccuracy_token', 'valid-jwt');
        mockFetch.mockResolvedValueOnce(
            mockResponse(200, { results: [], total: 0, processed: 0, errors: 0 }),
        );

        await comparisonApi.compareBatch({ records: [] });

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
        expect((callArgs.headers as Record<string, string>)['Authorization']).toBe('Bearer valid-jwt');
    });
});

// ─── geocodeApi.geocode tests ─────────────────────────────────────────────────

describe('geocodeApi.geocode', () => {
    it('should POST to /api/geocode when authenticated', async () => {
        sessionStorage.setItem('geoaccuracy_token', 'valid-jwt');
        mockFetch.mockResolvedValueOnce(
            mockResponse(200, { lat: -6.2, lng: 106.816, display_name: 'Jakarta', cached: false }),
        );

        const result = await geocodeApi.geocode({
            address: 'Jl. Sudirman',
            city: 'Jakarta',
            province: 'DKI Jakarta',
        });

        expect(result.lat).toBe(-6.2);
        expect(result.cached).toBe(false);
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

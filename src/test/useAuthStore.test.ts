import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '../store/useAuthStore';
import type { AuthUser } from '../lib/api';

const fakeUser: AuthUser = {
    id: 1,
    name: 'Budi',
    email: 'budi@test.com',
    role: 'user',
};

beforeEach(() => {
    // Reset Zustand store to initial state and clear localStorage
    // (api.ts persists token/user to localStorage, not sessionStorage)
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
});

describe('useAuthStore', () => {
    it('initialises as unauthenticated', () => {
        const { result } = renderHook(() => useAuthStore());
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
    });

    it('login() sets auth state and persists user to localStorage', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.login(fakeUser);
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(fakeUser);
        expect(localStorage.getItem('geoaccuracy_user')).toContain('budi@test.com');
    });

    it('logout() clears auth state and localStorage', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.login(fakeUser);
        });
        act(() => {
            result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(localStorage.getItem('geoaccuracy_user')).toBeNull();
    });

    it('hydrate() restores user session from localStorage', () => {
        localStorage.setItem('geoaccuracy_user', JSON.stringify(fakeUser));

        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(fakeUser);
    });

    it('hydrate() does nothing when localStorage is empty', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
    });

    it('hydrate() does nothing when localStorage user JSON is corrupt', () => {
        localStorage.setItem('geoaccuracy_user', '{corrupt json}');

        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(false);
    });
});

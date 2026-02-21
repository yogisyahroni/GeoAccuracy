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
    // Reset Zustand store to initial state and clear sessionStorage
    sessionStorage.clear();
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
});

describe('useAuthStore', () => {
    it('initialises as unauthenticated', () => {
        const { result } = renderHook(() => useAuthStore());
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.token).toBeNull();
    });

    it('login() sets auth state and persists to sessionStorage', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.login(fakeUser, 'tok123');
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(fakeUser);
        expect(result.current.token).toBe('tok123');
        expect(sessionStorage.getItem('geoaccuracy_token')).toBe('tok123');
    });

    it('logout() clears auth state and sessionStorage', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.login(fakeUser, 'tok123');
        });
        act(() => {
            result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.token).toBeNull();
        expect(sessionStorage.getItem('geoaccuracy_token')).toBeNull();
    });

    it('hydrate() restores session from sessionStorage', () => {
        sessionStorage.setItem('geoaccuracy_token', 'restored-tok');
        sessionStorage.setItem('geoaccuracy_user', JSON.stringify(fakeUser));

        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.token).toBe('restored-tok');
        expect(result.current.user).toEqual(fakeUser);
    });

    it('hydrate() does nothing when sessionStorage is empty', () => {
        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
    });

    it('hydrate() does nothing when sessionStorage user JSON is corrupt', () => {
        sessionStorage.setItem('geoaccuracy_token', 'tok');
        sessionStorage.setItem('geoaccuracy_user', '{corrupt json}');

        const { result } = renderHook(() => useAuthStore());

        act(() => {
            result.current.hydrate();
        });

        expect(result.current.isAuthenticated).toBe(false);
    });
});

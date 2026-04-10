import { create } from 'zustand';
import {
  type AuthUser,
  setStoredUser,
  clearStoredAuth,
  getStoredUser,
  authApi,
} from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /**
   * True until hydrate() has been called at least once.
   * ProtectedRoute must wait for this to be false before deciding to redirect,
   * otherwise a page refresh always boots the user to /login.
   */
  isHydrating: boolean;
  /** Call once on app mount to restore session from sessionStorage */
  hydrate: () => void;
  login: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true, // assume hydrating until proven otherwise

  hydrate: () => {
    const user = getStoredUser();
    // In Grade S++ cookie-based auth, we use the user object in localStorage
    // as a hint. The actual validation happens via HTTP HttpOnly cookies.
    if (user) {
      set({ user, isAuthenticated: true, isHydrating: false });
    } else {
      // No stored session — still mark hydration as done so ProtectedRoute can redirect
      set({ isHydrating: false });
    }
  },

  login: (user: AuthUser) => {
    setStoredUser(user);
    set({ user, isAuthenticated: true, isHydrating: false });
  },

  logout: () => {
    // Fire and forget logout on backend to clear HttpOnly cookies
    authApi.logout().catch(err => console.error('[useAuthStore] Logout API failed:', err));

    clearStoredAuth();
    set({ user: null, isAuthenticated: false });
  },
}));


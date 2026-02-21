import { create } from 'zustand';
import {
  type AuthUser,
  setStoredToken,
  setStoredUser,
  clearStoredToken,
  getStoredToken,
  getStoredUser,
} from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /**
   * True until hydrate() has been called at least once.
   * ProtectedRoute must wait for this to be false before deciding to redirect,
   * otherwise a page refresh always boots the user to /login.
   */
  isHydrating: boolean;
  /** Call once on app mount to restore session from sessionStorage */
  hydrate: () => void;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isHydrating: true, // assume hydrating until proven otherwise

  hydrate: () => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (token && user) {
      set({ user, token, isAuthenticated: true, isHydrating: false });
    } else {
      // No stored session — still mark hydration as done so ProtectedRoute can redirect
      set({ isHydrating: false });
    }
  },

  login: (user: AuthUser, token: string) => {
    setStoredToken(token);
    setStoredUser(user);
    set({ user, token, isAuthenticated: true, isHydrating: false });
  },

  logout: () => {
    clearStoredToken();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

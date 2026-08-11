// frontend/src/stores/auth.store.ts
/**
 * Zustand auth store — access token held in memory and persisted to
 * localStorage so the session survives tab close, new tabs, idle tab discards
 * and browser restarts (the JWT's own exp still bounds its lifetime). Previously
 * this used sessionStorage, which is wiped per-tab and caused "left the browser
 * a bit → logged out". Refresh token is stored in an httpOnly cookie.
 *
 * Session is read synchronously at module load time (not in a useEffect) so
 * the very first render already has the correct auth state — this eliminates
 * the "Loading…" flash on every cold mount of the admin layout.
 */
import { create } from "zustand";
import { setAccessToken } from "@/lib/api-client";
import type { UserProfile } from "@/types/user.types";


const SESSION_KEY = "af_session";

interface PersistedSession {
  token: string;
  user: UserProfile;
}

function readSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Synchronous init — runs at module import time, before any React render.
// On the server (SSR), window is undefined so we skip and default to loading.
// On the client, we read localStorage synchronously so the first render
// already has the correct auth state (no useEffect round-trip delay).
// ---------------------------------------------------------------------------
interface SyncAuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
}

function buildSyncState(): SyncAuthState {
  if (typeof window === "undefined") {
    // SSR: no session available; AuthInitializer will resolve after hydration
    return { accessToken: null, user: null, isLoading: true };
  }
  const session = readSession();
  if (!session) {
    return { accessToken: null, user: null, isLoading: true };
  }
  const payload = decodeJwtPayload(session.token);
  const exp = payload.exp as number | undefined;
  const isExpired = exp ? (Date.now() / 1000) > exp - 30 : false;
  if (isExpired) {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    return { accessToken: null, user: null, isLoading: true };
  }
  // Valid session — set token immediately so API calls work from the first render
  setAccessToken(session.token);
  return {
    accessToken: session.token,
    user: { ...session.user, is_admin: !!payload.is_admin, is_staff: !!payload.is_staff },
    isLoading: false,
  };
}

const _sync = buildSyncState();

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;

  // Actions
  setAuth: (token: string, user: UserProfile) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  /** Restore session from localStorage on app init. Returns true if a session was found. */
  initAuth: () => boolean;

  // Derived helpers
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  /** View-only admin access — may open the panel but cannot change anything. */
  isStaff: () => boolean;
  /** Anyone allowed into the admin panel at all (admin or staff). */
  canUseAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Use the synchronously-computed initial state so the first render is correct
  accessToken: _sync.accessToken,
  user: _sync.user,
  isLoading: _sync.isLoading,

  setAuth: (token, user) => {
    setAccessToken(token);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
    } catch {}
    set({ accessToken: token, user, isLoading: false });
  },

  clearAuth: () => {
    setAccessToken(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    set({ accessToken: null, user: null, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  initAuth: () => {
    // If sync init already resolved the session, nothing to do
    if (get().accessToken !== null) {
      return true;
    }
    // Otherwise try to read session now (e.g. if module was imported on server)
    const session = readSession();
    if (session) {
      const payload = decodeJwtPayload(session.token);
      const user = { ...session.user, is_admin: !!payload.is_admin, is_staff: !!payload.is_staff };
      const exp = payload.exp as number | undefined;
      const isExpired = exp ? (Date.now() / 1000) > exp - 30 : false;
      if (isExpired) {
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        set({ isLoading: true });
        return false;
      }
      setAccessToken(session.token);
      set({ accessToken: session.token, user, isLoading: false });
      return true;
    }
    set({ isLoading: true });
    return false;
  },

  isAuthenticated: () => get().accessToken !== null,
  isAdmin: () => get().user?.is_admin === true,
  isStaff: () => get().user?.is_staff === true && get().user?.is_admin !== true,
  canUseAdmin: () => get().user?.is_admin === true || get().user?.is_staff === true,
}));

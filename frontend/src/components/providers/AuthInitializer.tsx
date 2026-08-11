"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient, setAccessToken, setTokenRefreshCallback, setAuthExpiredCallback } from "@/lib/api-client";
import type { UserProfile } from "@/types/user.types";

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

export function AuthInitializer() {
  useEffect(() => {
    setTokenRefreshCallback((newToken) => {
      const store = useAuthStore.getState();
      if (store.user) {
        store.setAuth(newToken, store.user);
      }
    });

    setAuthExpiredCallback(() => {
      const store = useAuthStore.getState();
      if (store.user) {
        store.clearAuth();
        window.location.href = "/login";
      }
    });
    const found = useAuthStore.getState().initAuth();

    if (found) {
      // The stored session carries the role its token was minted with, and tokens
      // last 30 days — so a promotion or demotion wouldn't show until the user
      // next signed in. Re-read the role from the server on every load so the
      // menus match what the API will actually allow.
      apiClient
        .get<UserProfile & { is_admin?: boolean; is_staff?: boolean }>("/api/v1/account/profile")
        .then(profile => {
          const store = useAuthStore.getState();
          if (!store.user || !store.accessToken) return;
          const nextAdmin = !!profile.is_admin;
          const nextStaff = !!profile.is_staff;
          if (store.user.is_admin !== nextAdmin || store.user.is_staff !== nextStaff) {
            store.setAuth(store.accessToken, { ...store.user, is_admin: nextAdmin, is_staff: nextStaff });
          }
        })
        .catch(() => { /* offline or expired — existing guards handle it */ });
    }

    if (!found) {
      // No session in sessionStorage — try to restore from httpOnly refresh cookie.
      apiClient
        .post<{ access_token: string }>("/api/v1/refresh", undefined, { skipAuth: true })
        .then(async ({ access_token }) => {
          // Set token in memory so the subsequent profile request is authenticated.
          setAccessToken(access_token);
          try {
            const profile = await apiClient.get<UserProfile>("/api/v1/account/profile");
            const payload = decodeJwtPayload(access_token);
            useAuthStore.getState().setAuth(access_token, {
              ...profile,
              is_admin: !!payload.is_admin,
            });
          } catch {
            useAuthStore.getState().clearAuth();
          }
        })
        .catch(() => {
          // No valid refresh cookie — user must log in.
          useAuthStore.getState().clearAuth();
        })
        .finally(() => {
          // Safety net: ensure isLoading never stays true if any code path missed it.
          useAuthStore.getState().setLoading(false);
        });
    }
  }, []);

  // Inactivity auto-logout has been removed by request: the session is long-lived
  // (30-day token + silent refresh cookie), so users stay signed in and are never
  // logged out just for leaving the tab idle. Sign-out is now explicit only.

  return null;
}

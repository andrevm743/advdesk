import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserProfile } from "@/types";

interface AuthState {
  user: UserProfile | null;
  tenantId: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenantId: null,
      isLoading: true,
      isInitialized: false,
      setUser: (user) => set({ user, tenantId: user?.tenantId ?? null }),
      setLoading: (isLoading) => set({ isLoading }),
      setInitialized: (isInitialized) => set({ isInitialized }),
      clear: () => set({ user: null, tenantId: null, isLoading: false }),
    }),
    {
      name: "advdesk-auth",
      partialize: (state) => ({ user: state.user, tenantId: state.tenantId }),
    }
  )
);

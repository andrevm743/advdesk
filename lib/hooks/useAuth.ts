"use client";

import { useEffect } from "react";
import { onAuthChange, getUserProfile } from "@/lib/firebase/auth";
import { useAuthStore } from "@/lib/stores/authStore";

export function useAuth() {
  const { user, tenantId, isLoading, isInitialized, setUser, setLoading, setInitialized, clear } =
    useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          const profile = await getUserProfile(firebaseUser.uid);
          setUser(profile);
        } else {
          clear();
        }
      } catch {
        clear();
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    });

    return () => unsubscribe();
  }, [setUser, setLoading, setInitialized, clear]);

  return { user, tenantId, isLoading, isInitialized };
}

"use client";

import { useEffect } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthChange, getUserProfile, createUserProfile } from "@/lib/firebase/auth";
import { useAuthStore } from "@/lib/stores/authStore";
import { db } from "@/lib/firebase/config";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setInitialized, clear } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          // Persistir session cookie para o middleware Next.js
          const token = await firebaseUser.getIdToken();
          document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict`;

          // Buscar perfil existente via userIndex
          const profile = await getUserProfile(firebaseUser.uid);

          if (profile) {
            setUser(profile);
          } else {
            // Primeiro login: criar tenant + perfil (bootstrap)
            const tenantId = `tenant_${firebaseUser.uid}`;

            // 1. Criar documento do tenant
            await setDoc(doc(db, "tenants", tenantId), {
              name: process.env.NEXT_PUBLIC_OFFICE_NAME ?? "ADVDESK",
              plan: "free",
              createdAt: serverTimestamp(),
            });

            // 2. Criar perfil do usuário + userIndex
            const newProfile = await createUserProfile(firebaseUser.uid, tenantId, {
              email: firebaseUser.email ?? "",
              displayName:
                firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "Admin",
              role: "admin",
            });

            setUser({ uid: firebaseUser.uid, ...newProfile });
          }
        } else {
          // Limpar session cookie ao sair
          document.cookie = "__session=; path=/; max-age=0";
          clear();
        }
      } catch (err) {
        console.error("[AuthProvider] Erro:", err);
        clear();
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    });

    return () => unsubscribe();
  }, [setUser, setLoading, setInitialized, clear]);

  return <>{children}</>;
}

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";
import type { UserProfile } from "@/types";

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  // Search across tenants — for single-tenant initial setup, use the default tenant
  // In a full multi-tenant setup, you'd look up by UID index
  const snapshot = await getDoc(doc(db, "userIndex", uid));
  if (!snapshot.exists()) return null;

  const { tenantId } = snapshot.data() as { tenantId: string };
  const profileSnap = await getDoc(doc(db, "tenants", tenantId, "users", uid));
  if (!profileSnap.exists()) return null;

  return { uid, ...profileSnap.data() } as UserProfile;
}

export async function createUserProfile(
  uid: string,
  tenantId: string,
  data: Omit<UserProfile, "uid" | "tenantId" | "createdAt">
) {
  const profile: Omit<UserProfile, "uid"> = {
    tenantId,
    createdAt: new Date(),
    ...data,
  };
  await setDoc(doc(db, "tenants", tenantId, "users", uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });
  // Create index for fast lookup
  await setDoc(doc(db, "userIndex", uid), { tenantId });
  return profile;
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  type QueryConstraint,
  type DocumentSnapshot,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import type {
  Petition, JudgeReview, ChatSession, ChatMessage,
  OfficeSettings, AIPrompts, KnowledgeDocument, UserProfile,
} from "@/types";

// ─── Generic helpers ───────────────────────────────────────────────────────────
function tenantCol(tenantId: string, col: string) {
  return collection(db, "tenants", tenantId, col);
}

function tenantDoc(tenantId: string, col: string, id: string) {
  return doc(db, "tenants", tenantId, col, id);
}

// ─── Petitions ─────────────────────────────────────────────────────────────────
export async function createPetition(
  tenantId: string,
  userId: string,
  data: Partial<Petition>
): Promise<string> {
  const ref = await addDoc(tenantCol(tenantId, "petitions"), {
    ...data,
    tenantId,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePetition(
  tenantId: string,
  petitionId: string,
  data: Partial<Petition>
) {
  await updateDoc(tenantDoc(tenantId, "petitions", petitionId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getPetition(
  tenantId: string,
  petitionId: string
): Promise<Petition | null> {
  const snap = await getDoc(tenantDoc(tenantId, "petitions", petitionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Petition;
}

export async function listPetitions(
  tenantId: string,
  userId: string,
  pageSize = 20,
  lastDoc?: DocumentSnapshot
): Promise<Petition[]> {
  const constraints: QueryConstraint[] = [
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  ];
  if (lastDoc) constraints.push(startAfter(lastDoc));

  const snap = await getDocs(query(tenantCol(tenantId, "petitions"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Petition);
}

// ─── Judge Reviews ─────────────────────────────────────────────────────────────
export async function createJudgeReview(
  tenantId: string,
  userId: string,
  data: Partial<JudgeReview>
): Promise<string> {
  const ref = await addDoc(tenantCol(tenantId, "judgeReviews"), {
    ...data,
    tenantId,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateJudgeReview(
  tenantId: string,
  reviewId: string,
  data: Partial<JudgeReview>
) {
  await updateDoc(tenantDoc(tenantId, "judgeReviews", reviewId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getJudgeReview(
  tenantId: string,
  reviewId: string
): Promise<JudgeReview | null> {
  const snap = await getDoc(tenantDoc(tenantId, "judgeReviews", reviewId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as JudgeReview;
}

export async function listJudgeReviews(
  tenantId: string,
  userId: string,
  pageSize = 20
): Promise<JudgeReview[]> {
  const snap = await getDocs(
    query(
      tenantCol(tenantId, "judgeReviews"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JudgeReview);
}

// ─── Chat Sessions ─────────────────────────────────────────────────────────────
export async function createChatSession(
  tenantId: string,
  userId: string,
  data: Partial<ChatSession>
): Promise<string> {
  const ref = await addDoc(tenantCol(tenantId, "chatSessions"), {
    ...data,
    tenantId,
    userId,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateChatSession(
  tenantId: string,
  sessionId: string,
  data: Partial<ChatSession>
) {
  await updateDoc(tenantDoc(tenantId, "chatSessions", sessionId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function listChatSessions(
  tenantId: string,
  userId: string
): Promise<ChatSession[]> {
  const snap = await getDocs(
    query(
      tenantCol(tenantId, "chatSessions"),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSession);
}

export function subscribeChatSessions(
  tenantId: string,
  userId: string,
  callback: (sessions: ChatSession[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      tenantCol(tenantId, "chatSessions"),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    ),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSession));
    }
  );
}

// ─── Chat Messages ─────────────────────────────────────────────────────────────
export async function addChatMessage(
  tenantId: string,
  sessionId: string,
  data: Omit<ChatMessage, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(
    collection(db, "tenants", tenantId, "chatSessions", sessionId, "messages"),
    { ...data, createdAt: serverTimestamp() }
  );
  return ref.id;
}

export async function listChatMessages(
  tenantId: string,
  sessionId: string,
  msgLimit = 50
): Promise<ChatMessage[]> {
  const snap = await getDocs(
    query(
      collection(db, "tenants", tenantId, "chatSessions", sessionId, "messages"),
      orderBy("createdAt", "asc"),
      limit(msgLimit)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
}

export function subscribeChatMessages(
  tenantId: string,
  sessionId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "tenants", tenantId, "chatSessions", sessionId, "messages"),
      orderBy("createdAt", "asc")
    ),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
    }
  );
}

// ─── Office Settings ───────────────────────────────────────────────────────────
export async function getOfficeSettings(tenantId: string): Promise<OfficeSettings | null> {
  const snap = await getDoc(doc(db, "tenants", tenantId, "settings", "office"));
  if (!snap.exists()) return null;
  return snap.data() as OfficeSettings;
}

export async function saveOfficeSettings(tenantId: string, data: OfficeSettings): Promise<void> {
  await setDoc(doc(db, "tenants", tenantId, "settings", "office"), data, { merge: true });
}

// ─── AI Prompts ────────────────────────────────────────────────────────────────
export async function getAIPrompts(tenantId: string): Promise<AIPrompts | null> {
  const snap = await getDoc(doc(db, "tenants", tenantId, "settings", "prompts"));
  if (!snap.exists()) return null;
  return snap.data() as AIPrompts;
}

export async function saveAIPrompts(tenantId: string, data: AIPrompts): Promise<void> {
  await setDoc(doc(db, "tenants", tenantId, "settings", "prompts"), data, { merge: true });
}

// ─── Knowledge Base ────────────────────────────────────────────────────────────
export async function listKnowledgeDocs(tenantId: string): Promise<KnowledgeDocument[]> {
  const snap = await getDocs(
    query(
      collection(db, "tenants", tenantId, "knowledgeBase"),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KnowledgeDocument);
}

export async function addKnowledgeDoc(
  tenantId: string,
  userId: string,
  data: Omit<KnowledgeDocument, "id" | "tenantId" | "userId" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "tenants", tenantId, "knowledgeBase"), {
    ...data,
    tenantId,
    userId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteKnowledgeDoc(tenantId: string, docId: string): Promise<void> {
  await deleteDoc(doc(db, "tenants", tenantId, "knowledgeBase", docId));
}

// ─── Tenant Users ──────────────────────────────────────────────────────────────
export async function listTenantUsers(tenantId: string): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "tenants", tenantId, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
}

export async function updateUserRole(
  tenantId: string,
  userId: string,
  role: "admin" | "lawyer" | "assistant"
): Promise<void> {
  await updateDoc(doc(db, "tenants", tenantId, "users", userId), { role });
}

export async function deactivateUser(tenantId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, "tenants", tenantId, "users", userId), { active: false });
}

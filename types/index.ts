// ─── Tenant ───────────────────────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  plan: "free" | "pro" | "enterprise";
  createdAt: Date;
  settings?: {
    officeName?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: "admin" | "lawyer" | "assistant";
  photoURL?: string;
  createdAt: Date;
}

// ─── Legal Areas & Types ───────────────────────────────────────────────────────
export type LegalArea =
  | "civel"
  | "trabalhista"
  | "criminal"
  | "previdenciario"
  | "tributario"
  | "familia"
  | "empresarial"
  | "consumidor"
  | "outras";

export const LEGAL_AREA_LABELS: Record<LegalArea, string> = {
  civel: "Cível",
  trabalhista: "Trabalhista",
  criminal: "Criminal",
  previdenciario: "Previdenciário",
  tributario: "Tributário",
  familia: "Família e Sucessões",
  empresarial: "Empresarial",
  consumidor: "Consumidor",
  outras: "Outras",
};

export const PETITION_TYPES: Record<LegalArea, string[]> = {
  civel: [
    "Petição Inicial",
    "Contestação",
    "Réplica",
    "Recurso de Apelação",
    "Agravo de Instrumento",
    "Embargos de Declaração",
    "Impugnação",
    "Exceção de Incompetência",
    "Denunciação à Lide",
    "Ação Monitória",
    "Ação Cautelar",
  ],
  trabalhista: [
    "Reclamação Trabalhista",
    "Defesa/Contestação",
    "Recurso Ordinário",
    "Agravo de Petição",
    "Embargos à Execução",
    "Impugnação à Sentença de Liquidação",
  ],
  criminal: [
    "Queixa-Crime",
    "Resposta à Acusação",
    "Alegações Finais",
    "Habeas Corpus",
    "Recurso em Sentido Estrito",
    "Apelação Criminal",
    "Revisão Criminal",
  ],
  previdenciario: [
    "Requerimento Administrativo",
    "Petição Inicial Previdenciária",
    "Recurso ao CRPS",
    "Mandado de Segurança Previdenciário",
  ],
  tributario: [
    "Impugnação a Auto de Infração",
    "Recurso Voluntário",
    "Mandado de Segurança Tributário",
    "Ação Anulatória",
  ],
  familia: [
    "Ação de Divórcio",
    "Ação de Alimentos",
    "Guarda e Visitação",
    "Inventário",
    "Reconhecimento de Paternidade",
  ],
  empresarial: [
    "Recuperação Judicial",
    "Dissolução de Sociedade",
    "Ação de Responsabilidade",
    "Contrato Empresarial",
  ],
  consumidor: [
    "Ação de Indenização",
    "Ação de Obrigação de Fazer",
    "Reclamação Consumerista",
  ],
  outras: ["Tipo personalizado"],
};

// ─── Petition ─────────────────────────────────────────────────────────────────
export type PetitionStatus =
  | "draft"
  | "analyzing"
  | "questions"
  | "structuring"
  | "generating"
  | "completed"
  | "error";

export interface StrategicQuestion {
  id: number;
  pergunta: string;
  tipo: "text" | "radio" | "checkbox";
  opcoes?: string[];
}

export interface PetitionTopic {
  id: string;
  titulo: string;
  resumo: string;
  subtopicos?: string[];
}

export interface PetitionStructure {
  endereçamento: string;
  partes: {
    autor?: string;
    reu?: string;
    [key: string]: string | undefined;
  };
  topicos: PetitionTopic[];
  pedidos: string[];
}

export interface InitialAnalysis {
  resumo: string;
  teses: string[];
  perguntas: StrategicQuestion[];
}

export interface Petition {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  area: LegalArea;
  type: string;
  status: PetitionStatus;
  facts: string;
  fileUrls: string[];
  initialAnalysis?: InitialAnalysis;
  strategicAnswers?: Record<string, string | string[]>;
  structure?: PetitionStructure;
  content?: string;
  docxUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Judge Review ─────────────────────────────────────────────────────────────
export type ReviewStatus = "analyzing" | "questions" | "generating" | "completed" | "error";
export type SuccessProbability = "Alta" | "Média" | "Baixa";

export interface JudgeReview {
  id: string;
  tenantId: string;
  userId: string;
  description: string;
  petitionId?: string;
  petitionContent?: string;
  fileUrls: string[];
  status: ReviewStatus;
  initialAnalysis?: {
    resumo_peticao: string;
    impressao_inicial: string;
    perguntas: StrategicQuestion[];
  };
  strategicAnswers?: Record<string, string | string[]>;
  report?: {
    pontos_fortes: string[];
    pontos_fracos: string[];
    lacunas_probatorias: string[];
    riscos: string[];
    probabilidade_exito: SuccessProbability;
    justificativa_probabilidade: string;
    sugestoes: Array<{ titulo: string; texto: string }>;
  };
  docxUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatSession {
  id: string;
  tenantId: string;
  userId: string;
  clientName: string;
  area: LegalArea;
  description?: string;
  status: "active" | "closed";
  lastMessage?: string;
  lastMessageAt?: Date;
  reportUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: Date;
}

// ─── Configurações — Perfil do Escritório ──────────────────────────────────────
export interface OfficeSettings {
  name?: string;
  logoUrl?: string;
  logoStoragePath?: string;
  address?: string;
  oabNumber?: string;
  email?: string;
  phone?: string;
}

// ─── Configurações — Prompts de IA ─────────────────────────────────────────────
export interface AIPrompts {
  petitionPrompt?: string;
  judgePrompt?: string;
  chatPrompt?: string;
}

// ─── Configurações — Base de Conhecimento ──────────────────────────────────────
export type KnowledgeCategory =
  | "modelos"
  | "jurisprudencia"
  | "honorarios"
  | "procedimentos"
  | "outro";

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  modelos: "Modelos de Petição",
  jurisprudencia: "Jurisprudência",
  honorarios: "Honorários",
  procedimentos: "Procedimentos",
  outro: "Outro",
};

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  category: KnowledgeCategory;
  storagePath: string;
  fileUrl?: string;
  size: number;
  mimeType: string;
  createdAt: Date | { seconds: number };
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────
export interface DashboardStats {
  petitionsThisMonth: number;
  reviewsTotal: number;
  activeChats: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: "petition" | "review" | "chat";
  description: string;
  createdAt: Date;
}

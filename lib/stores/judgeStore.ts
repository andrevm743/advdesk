import { create } from "zustand";
import type { StrategicQuestion } from "@/types";

export type JudgeStep = "input" | "questions" | "report";

interface JudgeInitialAnalysis {
  resumo_peticao: string;
  impressao_inicial: string;
  perguntas: StrategicQuestion[];
}

interface JudgeReport {
  pontos_fortes: string[];
  pontos_fracos: string[];
  lacunas_probatorias: string[];
  riscos: string[];
  probabilidade_exito: "Alta" | "Média" | "Baixa";
  justificativa_probabilidade: string;
  sugestoes: Array<{ titulo: string; texto: string }>;
}

interface JudgeState {
  step: JudgeStep;
  reviewId: string | null;
  description: string;
  petitionContent: string;
  storagePaths: string[];
  initialAnalysis: JudgeInitialAnalysis | null;
  strategicAnswers: Record<string, string | string[]>;
  report: JudgeReport | null;
  docxUrl: string | null;
  isLoading: boolean;
  loadingMessage: string;

  setStep: (step: JudgeStep) => void;
  setReviewId: (id: string) => void;
  setDescription: (desc: string) => void;
  setPetitionContent: (content: string) => void;
  setStoragePaths: (paths: string[]) => void;
  setInitialAnalysis: (analysis: JudgeInitialAnalysis) => void;
  setStrategicAnswer: (id: string, answer: string | string[]) => void;
  setReport: (report: JudgeReport) => void;
  setDocxUrl: (url: string) => void;
  setLoading: (loading: boolean, message?: string) => void;
  reset: () => void;
}

const initialState = {
  step: "input" as JudgeStep,
  reviewId: null,
  description: "",
  petitionContent: "",
  storagePaths: [],
  initialAnalysis: null,
  strategicAnswers: {},
  report: null,
  docxUrl: null,
  isLoading: false,
  loadingMessage: "",
};

export const useJudgeStore = create<JudgeState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setReviewId: (reviewId) => set({ reviewId }),
  setDescription: (description) => set({ description }),
  setPetitionContent: (petitionContent) => set({ petitionContent }),
  setStoragePaths: (storagePaths) => set({ storagePaths }),
  setInitialAnalysis: (initialAnalysis) => set({ initialAnalysis }),
  setStrategicAnswer: (id, answer) =>
    set((state) => ({ strategicAnswers: { ...state.strategicAnswers, [id]: answer } })),
  setReport: (report) => set({ report }),
  setDocxUrl: (docxUrl) => set({ docxUrl }),
  setLoading: (isLoading, loadingMessage = "") => set({ isLoading, loadingMessage }),
  reset: () => set(initialState),
}));

import { create } from "zustand";
import type { LegalArea, InitialAnalysis, PetitionStructure } from "@/types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface PetitionWizardState {
  // Current petition ID (saved in Firestore)
  petitionId: string | null;

  // Step 1
  area: LegalArea | null;
  petitionType: string | null;

  // Step 2
  facts: string;
  files: File[];
  uploadedFilePaths: string[];

  // Step 3
  initialAnalysis: InitialAnalysis | null;
  strategicAnswers: Record<string, string | string[]>;

  // Step 4
  structure: PetitionStructure | null;

  // Step 5
  petitionContent: string | null;
  docxUrl: string | null;

  // UI state
  currentStep: WizardStep;
  isLoading: boolean;
  loadingMessage: string;

  // Actions
  setStep: (step: WizardStep) => void;
  setArea: (area: LegalArea) => void;
  setPetitionType: (type: string) => void;
  setFacts: (facts: string) => void;
  setFiles: (files: File[]) => void;
  setUploadedFilePaths: (paths: string[]) => void;
  setPetitionId: (id: string) => void;
  setInitialAnalysis: (analysis: InitialAnalysis) => void;
  setStrategicAnswer: (questionId: string, answer: string | string[]) => void;
  setStructure: (structure: PetitionStructure) => void;
  setPetitionContent: (content: string) => void;
  setDocxUrl: (url: string) => void;
  setLoading: (loading: boolean, message?: string) => void;
  reset: () => void;
}

const initialState = {
  petitionId: null,
  area: null,
  petitionType: null,
  facts: "",
  files: [],
  uploadedFilePaths: [],
  initialAnalysis: null,
  strategicAnswers: {},
  structure: null,
  petitionContent: null,
  docxUrl: null,
  currentStep: 1 as WizardStep,
  isLoading: false,
  loadingMessage: "",
};

export const usePetitionStore = create<PetitionWizardState>((set) => ({
  ...initialState,
  setStep: (step) => set({ currentStep: step }),
  setArea: (area) => set({ area, petitionType: null }),
  setPetitionType: (petitionType) => set({ petitionType }),
  setFacts: (facts) => set({ facts }),
  setFiles: (files) => set({ files }),
  setUploadedFilePaths: (uploadedFilePaths) => set({ uploadedFilePaths }),
  setPetitionId: (petitionId) => set({ petitionId }),
  setInitialAnalysis: (initialAnalysis) => set({ initialAnalysis }),
  setStrategicAnswer: (questionId, answer) =>
    set((state) => ({
      strategicAnswers: { ...state.strategicAnswers, [questionId]: answer },
    })),
  setStructure: (structure) => set({ structure }),
  setPetitionContent: (petitionContent) => set({ petitionContent }),
  setDocxUrl: (docxUrl) => set({ docxUrl }),
  setLoading: (isLoading, loadingMessage = "") => set({ isLoading, loadingMessage }),
  reset: () => set(initialState),
}));

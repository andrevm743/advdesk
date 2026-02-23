"use client";

import { useEffect } from "react";
import { usePetitionStore } from "@/lib/stores/petitionStore";
import { WizardProgress } from "@/components/petition/WizardProgress";
import { Step1AreaType } from "@/components/petition/Step1AreaType";
import { Step2FactsDocs } from "@/components/petition/Step2FactsDocs";
import { Step3Questions } from "@/components/petition/Step3Questions";
import { Step4Structure } from "@/components/petition/Step4Structure";
import { Step5Result } from "@/components/petition/Step5Result";

export default function NovaPeticaoPage() {
  const { currentStep } = usePetitionStore();

  // Reset wizard when navigating away and coming back (except if in progress)
  useEffect(() => {
    return () => {
      // Don't reset on unmount to preserve state during navigation
    };
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nova Petição</h1>
        <p className="text-muted-foreground mt-1">
          Gere petições jurídicas completas com auxílio de inteligência artificial
        </p>
      </div>

      <WizardProgress currentStep={currentStep} />

      {currentStep === 1 && <Step1AreaType />}
      {currentStep === 2 && <Step2FactsDocs />}
      {currentStep === 3 && <Step3Questions />}
      {currentStep === 4 && <Step4Structure />}
      {currentStep === 5 && <Step5Result />}
    </div>
  );
}

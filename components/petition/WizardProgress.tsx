import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { WizardStep } from "@/lib/stores/petitionStore";

const STEPS = [
  { number: 1, label: "Área e Tipo" },
  { number: 2, label: "Fatos e Docs" },
  { number: 3, label: "Perguntas" },
  { number: 4, label: "Estrutura" },
  { number: 5, label: "Petição" },
];

export function WizardProgress({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const isCompleted = currentStep > step.number;
        const isActive = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                  isCompleted && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !isCompleted && !isActive && "bg-secondary text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.number}
              </div>
              <span
                className={cn(
                  "text-xs mt-1.5 hidden sm:block whitespace-nowrap",
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-16 h-0.5 mx-1 -mt-4 sm:-mt-5 transition-colors",
                  currentStep > step.number ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

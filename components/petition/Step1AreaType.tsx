"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { usePetitionStore } from "@/lib/stores/petitionStore";
import { LEGAL_AREA_LABELS, PETITION_TYPES, type LegalArea } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";

const AREA_ICONS: Record<LegalArea, string> = {
  civel: "⚖️",
  trabalhista: "👷",
  criminal: "🔒",
  previdenciario: "🛡️",
  tributario: "📊",
  familia: "👨‍👩‍👧",
  empresarial: "🏢",
  consumidor: "🛒",
  outras: "📋",
};

export function Step1AreaType() {
  const { area, petitionType, setArea, setPetitionType, setStep } = usePetitionStore();
  const [customType, setCustomType] = useState("");

  const areas = Object.keys(LEGAL_AREA_LABELS) as LegalArea[];
  const types = area ? PETITION_TYPES[area] : [];
  const isCustom = area === "outras";

  function handleNext() {
    const finalType = isCustom ? customType : petitionType;
    if (!area || !finalType) return;
    if (isCustom) setPetitionType(customType);
    setStep(2);
  }

  const canProceed = area && (isCustom ? customType.length > 3 : petitionType);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Area selection */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Selecione a área do direito</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium",
                area === a
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-primary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="text-2xl">{AREA_ICONS[a]}</span>
              <span>{LEGAL_AREA_LABELS[a]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Type selection (appears after area) */}
      {area && (
        <div className="animate-fade-in">
          <h2 className="text-lg font-semibold mb-4">Selecione o tipo de peça</h2>

          {isCustom ? (
            <div className="space-y-2">
              <Label htmlFor="customType">Descreva o tipo de peça</Label>
              <Input
                id="customType"
                placeholder="Ex: Mandado de Segurança, Ação Popular..."
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => setPetitionType(type)}
                  className={cn(
                    "text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all",
                    petitionType === type
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:border-primary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canProceed && (
        <div className="flex justify-end animate-fade-in">
          <Button onClick={handleNext} size="lg">
            Continuar
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

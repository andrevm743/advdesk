"use client";

import { usePetitionStore } from "@/lib/stores/petitionStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Plus, CheckCircle2, FileText } from "lucide-react";
import { LEGAL_AREA_LABELS } from "@/types";
import { toast } from "sonner";

export function Step5Result() {
  const { petitionContent, docxUrl, area, petitionType, reset } = usePetitionStore();

  async function handleDownload() {
    if (!docxUrl) {
      toast.error("URL do arquivo não disponível");
      return;
    }
    window.open(docxUrl, "_blank");
  }

  function handleNew() {
    reset();
  }

  // Parse content into sections for display
  const sections = petitionContent
    ? petitionContent.split(/\n(?=## )/).map((section) => {
        const lines = section.split("\n");
        const heading = lines[0]?.replace(/^##\s*/, "") ?? "";
        const content = lines.slice(1).join("\n").trim();
        return { heading, content };
      })
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Success banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-5 flex items-center gap-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
          <div>
            <h2 className="font-semibold text-emerald-400">Petição gerada com sucesso!</h2>
            <p className="text-sm text-muted-foreground">
              Esta petição foi salva no seu Histórico e está disponível para download.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>{LEGAL_AREA_LABELS[area!]}</span>
        <span>·</span>
        <span>{petitionType}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleDownload} disabled={!docxUrl} className="gap-2">
          <Download className="h-4 w-4" />
          Baixar Petição (.docx)
        </Button>
        <Button variant="outline" onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Petição
        </Button>
      </div>

      {/* Petition content */}
      <Card>
        <CardContent className="p-6">
          <div className="prose prose-sm max-w-none text-foreground">
            {sections.length > 0 ? (
              sections.map((section, i) => (
                <div key={i} className="mb-6">
                  {section.heading && (
                    <h3 className="text-base font-bold text-foreground border-b border-border pb-2 mb-3 uppercase tracking-wide">
                      {section.heading}
                    </h3>
                  )}
                  {section.content && (
                    <div className="space-y-3">
                      {section.content.split("\n\n").map((para, j) =>
                        para.trim() ? (
                          <p key={j} className="text-sm text-foreground/90 leading-relaxed text-justify">
                            {para.trim()}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed font-sans">
                {petitionContent}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

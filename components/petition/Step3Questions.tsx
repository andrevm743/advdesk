"use client";

import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { usePetitionStore } from "@/lib/stores/petitionStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingOverlay } from "./LoadingOverlay";
import { ArrowLeft, BookOpen } from "lucide-react";
import { LEGAL_AREA_LABELS } from "@/types";
import app from "@/lib/firebase/config";

const LOADING_MESSAGES = [
  "Organizando a estrutura jurídica...",
  "Definindo os pedidos...",
  "Montando os tópicos da petição...",
];

export function Step3Questions() {
  const {
    area, petitionType, facts, petitionId,
    initialAnalysis, strategicAnswers,
    setStrategicAnswer, setStructure, setStep,
    setLoading, isLoading,
  } = usePetitionStore();

  if (!initialAnalysis) return null;

  const analysis = initialAnalysis;
  const questions = analysis.perguntas;
  const answeredCount = questions.filter((q) => {
    const answer = strategicAnswers[String(q.id)];
    return answer && (typeof answer === "string" ? answer.trim() : answer.length > 0);
  }).length;
  const progress = (answeredCount / questions.length) * 100;
  const allAnswered = answeredCount === questions.length;

  async function handleBuildStructure() {
    if (!allAnswered || !petitionId || !area) return;

    setLoading(true, LOADING_MESSAGES[0]);

    try {
      const functions = getFunctions(app, "us-central1");
      const build = httpsCallable(functions, "buildPetitionStructureFn");

      const result = await build({
        petitionId,
        facts,
        area: LEGAL_AREA_LABELS[area!],
        petitionType,
        initialAnalysis: {
          resumo: analysis.resumo,
          teses: analysis.teses,
        },
        strategicAnswers,
      });

      const data = (result.data as { success: boolean; data: unknown }).data;
      setStructure(data as Parameters<typeof setStructure>[0]);
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar estrutura";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {isLoading && <LoadingOverlay messages={LOADING_MESSAGES} />}

      <div className="space-y-6 animate-fade-in">
        {/* Summary card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Resumo do Caso</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {analysis.resumo}
            </p>
            {analysis.teses.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-foreground mb-2">Teses identificadas:</p>
                <ul className="space-y-1">
                  {analysis.teses.map((tese, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{tese}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Perguntas respondidas</span>
            <span className="font-medium">
              {answeredCount} / {questions.length}
            </span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Questions */}
        <div className="space-y-5">
          {questions.map((question, i) => (
            <Card key={question.id} className="border-border">
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-3">
                  <span className="text-primary mr-2">{i + 1}.</span>
                  {question.pergunta}
                </p>

                {question.tipo === "text" && (
                  <Textarea
                    placeholder="Sua resposta..."
                    className="min-h-[80px]"
                    value={(strategicAnswers[String(question.id)] as string) ?? ""}
                    onChange={(e) => setStrategicAnswer(String(question.id), e.target.value)}
                  />
                )}

                {question.tipo === "radio" && question.opcoes && (
                  <div className="space-y-2">
                    {question.opcoes.map((opcao) => (
                      <label
                        key={opcao}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors"
                      >
                        <input
                          type="radio"
                          name={`q_${question.id}`}
                          value={opcao}
                          checked={strategicAnswers[String(question.id)] === opcao}
                          onChange={() => setStrategicAnswer(String(question.id), opcao)}
                          className="accent-primary"
                        />
                        <span className="text-sm">{opcao}</span>
                      </label>
                    ))}
                  </div>
                )}

                {question.tipo === "checkbox" && question.opcoes && (
                  <div className="space-y-2">
                    {question.opcoes.map((opcao) => {
                      const current = (strategicAnswers[String(question.id)] as string[]) ?? [];
                      const checked = current.includes(opcao);
                      return (
                        <label
                          key={opcao}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? current.filter((o) => o !== opcao)
                                : [...current, opcao];
                              setStrategicAnswer(String(question.id), next);
                            }}
                            className="accent-primary"
                          />
                          <span className="text-sm">{opcao}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(2)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button onClick={handleBuildStructure} disabled={!allAnswered || isLoading} size="lg">
            Criar Estrutura da Petição →
          </Button>
        </div>
      </div>
    </>
  );
}

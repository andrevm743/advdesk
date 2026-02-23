"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Copy, CheckCircle2, Download, Plus, Search, ArrowLeft, TrendingUp, AlertTriangle, ShieldAlert, Lightbulb, Star, RotateCcw, FileText, Upload, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingOverlay } from "@/components/petition/LoadingOverlay";
import { useAuthStore } from "@/lib/stores/authStore";
import { useJudgeStore } from "@/lib/stores/judgeStore";
import { createJudgeReview } from "@/lib/firebase/firestore";
import { listPetitions } from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import app from "@/lib/firebase/config";

const ANALYZE_MESSAGES = [
  "Lendo e compreendendo a petição...",
  "Analisando os argumentos jurídicos...",
  "Identificando pontos de melhoria...",
  "Preparando perguntas para aprofundamento...",
];

const REPORT_MESSAGES = [
  "Elaborando o relatório de análise...",
  "Formulando sugestões de melhoria...",
  "Finalizando o parecer crítico...",
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
      {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export default function AnalisePeticaoPage() {
  const { user, tenantId } = useAuthStore();
  const {
    step, reviewId, description, petitionContent, initialAnalysis, strategicAnswers, report, docxUrl,
    setStep, setReviewId, setDescription, setPetitionContent, setStoragePaths,
    setInitialAnalysis, setStrategicAnswer, setReport, setDocxUrl, setLoading, isLoading, reset,
  } = useJudgeStore();

  const [files, setFiles] = useState<File[]>([]);
  const [petitionFile, setPetitionFile] = useState<File | null>(null);
  const [selectedPetitionId, setSelectedPetitionId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const petitionFileInputRef = useRef<HTMLInputElement>(null);

  const { data: petitions = [] } = useQuery({
    queryKey: ["petitions", tenantId, user?.uid],
    queryFn: () => listPetitions(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const completedPetitions = petitions.filter((p) => p.status === "completed" && p.content);

  async function handleAnalyze() {
    if (!description.trim()) {
      toast.error("Descreva o caso e o objetivo da análise");
      return;
    }

    let finalContent = petitionContent;

    // Use selected petition's content
    if (selectedPetitionId) {
      const petition = completedPetitions.find((p) => p.id === selectedPetitionId);
      if (petition?.content) finalContent = petition.content;
    }

    if (!finalContent.trim() && !petitionFile) {
      toast.error("Adicione o conteúdo da petição para análise (texto ou arquivo)");
      return;
    }

    if (!tenantId || !user) return;
    setLoading(true, ANALYZE_MESSAGES[0]);

    try {
      // Create review in Firestore
      const id = await createJudgeReview(tenantId, user.uid, {
        description,
        petitionContent: finalContent,
        status: "analyzing",
      });
      setReviewId(id);

      // Upload main petition file (if provided via upload tab)
      let petitionFileStoragePath: string | undefined;
      if (petitionFile) {
        const { path } = await uploadFile(tenantId, `judge-reviews/${id}/petition`, petitionFile);
        petitionFileStoragePath = path;
      }

      // Upload supplementary files
      const paths: string[] = [];
      for (const file of files) {
        const { path } = await uploadFile(tenantId, `judge-reviews/${id}/docs`, file);
        paths.push(path);
      }
      setStoragePaths(paths);

      // Call Cloud Function
      const functions = getFunctions(app, "us-central1");
      const analyze = httpsCallable(functions, "analyzeForJudgeFn");

      const result = await analyze({
        reviewId: id,
        description,
        petitionContent: finalContent,
        storagePaths: paths,
        petitionFileStoragePath,
      });

      const data = (result.data as { success: boolean; data: unknown }).data;
      setInitialAnalysis(data as Parameters<typeof setInitialAnalysis>[0]);
      setPetitionContent(finalContent);
      setStep("questions");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao analisar a petição";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (!reviewId || !initialAnalysis) return;

    const allAnswered = initialAnalysis.perguntas.every((q) => {
      const answer = strategicAnswers[String(q.id)];
      return answer && (typeof answer === "string" ? answer.trim() : answer.length > 0);
    });

    if (!allAnswered) {
      toast.error("Responda todas as perguntas antes de gerar o relatório");
      return;
    }

    setLoading(true, REPORT_MESSAGES[0]);

    try {
      const functions = getFunctions(app, "us-central1");
      const generate = httpsCallable(functions, "generateJudgeReportFn");

      const result = await generate({
        reviewId,
        petitionContent,
        description,
        initialAnalysis: {
          resumo_peticao: initialAnalysis.resumo_peticao,
          impressao_inicial: initialAnalysis.impressao_inicial,
        },
        strategicAnswers,
      });

      const data = result.data as { success: boolean; report: unknown; docxUrl: string };
      setReport(data.report as Parameters<typeof setReport>[0]);
      setDocxUrl(data.docxUrl);
      setStep("report");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar relatório";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (step === "report" && report) {
    const probColor =
      report.probabilidade_exito === "Alta"
        ? "success"
        : report.probabilidade_exito === "Média"
        ? "warning"
        : "destructive";

    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        {isLoading && <LoadingOverlay messages={REPORT_MESSAGES} />}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Relatório do Agente Julgador</h1>
            <p className="text-muted-foreground text-sm mt-1">{description}</p>
          </div>
          <div className="flex gap-2">
            {docxUrl && (
              <Button variant="outline" onClick={() => window.open(docxUrl, "_blank")}>
                <Download className="h-4 w-4 mr-2" />
                Baixar Relatório
              </Button>
            )}
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Nova Análise
            </Button>
          </div>
        </div>

        {/* Probability banner */}
        <Card className={`border-2 ${probColor === "success" ? "border-emerald-500/40 bg-emerald-500/5" : probColor === "warning" ? "border-amber-500/40 bg-amber-500/5" : "border-red-500/40 bg-red-500/5"}`}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Probabilidade de Êxito</p>
              <p className={`text-3xl font-bold mt-1 ${probColor === "success" ? "text-emerald-400" : probColor === "warning" ? "text-amber-400" : "text-red-400"}`}>
                {report.probabilidade_exito}
              </p>
            </div>
            <div className="text-right max-w-sm">
              <p className="text-sm text-muted-foreground">{report.justificativa_probabilidade}</p>
            </div>
          </CardContent>
        </Card>

        <Accordion type="multiple" defaultValue={["fortes", "fracos"]} className="space-y-3">
          <AccordionItem value="fortes" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-emerald-400" />
                <span>Pontos Fortes</span>
                <Badge variant="success">{report.pontos_fortes.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {report.pontos_fortes.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="fracos" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Pontos Fracos</span>
                <Badge variant="warning">{report.pontos_fracos.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {report.pontos_fracos.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="lacunas" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-400" />
                <span>Lacunas Probatórias</span>
                <Badge variant="info">{report.lacunas_probatorias.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {report.lacunas_probatorias.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-blue-400 shrink-0 mt-0.5">○</span>
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="riscos" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <span>Riscos de Insucesso</span>
                <Badge variant="destructive">{report.riscos.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {report.riscos.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sugestoes" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span>Sugestões de Melhoria</span>
                <Badge>{report.sugestoes.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {report.sugestoes.map((s, i) => (
                  <div key={i} className="rounded-lg bg-secondary p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold">{s.titulo}</h4>
                      <CopyButton text={s.texto} />
                    </div>
                    <p className="text-sm text-muted-foreground italic leading-relaxed">{s.texto}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  if (step === "questions" && initialAnalysis) {
    const questions = initialAnalysis.perguntas;
    const answeredCount = questions.filter((q) => {
      const answer = strategicAnswers[String(q.id)];
      return answer && (typeof answer === "string" ? answer.trim() : answer.length > 0);
    }).length;

    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        {isLoading && <LoadingOverlay messages={REPORT_MESSAGES} />}

        <div>
          <h1 className="text-2xl font-bold">Perguntas Estratégicas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Responda para o julgador ter uma visão completa do caso
          </p>
        </div>

        {/* Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Resumo da Petição</p>
              <p className="text-sm leading-relaxed">{initialAnalysis.resumo_peticao}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Impressão Inicial</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{initialAnalysis.impressao_inicial}</p>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((question, i) => (
            <Card key={question.id}>
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-3">
                  <span className="text-primary mr-2">{i + 1}.</span>
                  {question.pergunta}
                </p>
                {question.tipo === "text" && (
                  <Textarea
                    placeholder="Sua resposta..."
                    value={(strategicAnswers[String(question.id)] as string) ?? ""}
                    onChange={(e) => setStrategicAnswer(String(question.id), e.target.value)}
                  />
                )}
                {question.tipo === "radio" && question.opcoes && (
                  <div className="space-y-2">
                    {question.opcoes.map((opcao) => (
                      <label key={opcao} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-secondary">
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
                      return (
                        <label key={opcao} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-secondary">
                          <input
                            type="checkbox"
                            checked={current.includes(opcao)}
                            onChange={() => {
                              const next = current.includes(opcao)
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

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep("input")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button
            onClick={handleGenerateReport}
            disabled={answeredCount < questions.length || isLoading}
            size="lg"
          >
            Gerar Relatório ({answeredCount}/{questions.length}) →
          </Button>
        </div>
      </div>
    );
  }

  // Default: input step
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {isLoading && <LoadingOverlay messages={ANALYZE_MESSAGES} />}

      <div>
        <h1 className="text-2xl font-bold">Análise de Petições</h1>
        <p className="text-muted-foreground mt-1">Visão crítica e imparcial simulando a perspectiva do julgador</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição do caso e objetivo da análise *</Label>
        <Textarea
          id="description"
          placeholder="Descreva o caso, o tipo de petição e o que você quer que o agente avalie especificamente..."
          className="min-h-[120px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Petition source */}
      <Tabs defaultValue="existente">
        <TabsList>
          <TabsTrigger value="existente">Selecionar petição existente</TabsTrigger>
          <TabsTrigger value="upload">Colar texto / Anexar arquivo</TabsTrigger>
        </TabsList>
        <TabsContent value="existente" className="mt-3">
          {completedPetitions.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nenhuma petição concluída encontrada no histórico.
              </CardContent>
            </Card>
          ) : (
            <Select value={selectedPetitionId} onValueChange={setSelectedPetitionId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma petição do histórico..." />
              </SelectTrigger>
              <SelectContent>
                {completedPetitions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TabsContent>
        <TabsContent value="upload" className="mt-3 space-y-4">
          {/* Main petition file upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Carregar arquivo da petição (PDF ou DOCX)</Label>
            {petitionFile ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <span className="flex-1 text-sm truncate">{petitionFile.name}</span>
                <button
                  onClick={() => { setPetitionFile(null); setPetitionContent(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => petitionFileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                <p className="text-xs text-muted-foreground mt-1">PDF ou DOCX</p>
              </button>
            )}
            <input
              ref={petitionFileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPetitionFile(f);
                if (f) setPetitionContent("");
              }}
            />
          </div>
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou cole o texto</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {/* Text paste */}
          <Textarea
            placeholder="Cole aqui o texto completo da petição..."
            className="min-h-[200px]"
            value={petitionContent}
            onChange={(e) => { setPetitionContent(e.target.value); if (e.target.value) setPetitionFile(null); }}
          />
        </TabsContent>
      </Tabs>

      {/* Supplementary docs */}
      <div className="space-y-2">
        <Label>Documentos complementares (opcional)</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="h-4 w-4 mr-2" />
          Anexar documentos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.mp3,.m4a,.wav"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <p className="text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s)</p>
        )}
      </div>

      <Button
        onClick={handleAnalyze}
        disabled={!description.trim() || isLoading}
        size="lg"
        className="w-full"
      >
        Analisar este Caso ⚖️
      </Button>
    </div>
  );
}

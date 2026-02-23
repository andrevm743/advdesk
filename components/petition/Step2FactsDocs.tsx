"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { usePetitionStore } from "@/lib/stores/petitionStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { createPetition } from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingOverlay } from "./LoadingOverlay";
import { Upload, X, FileText, Image as ImageIcon, Music, ArrowLeft } from "lucide-react";
import { LEGAL_AREA_LABELS } from "@/types";
import app from "@/lib/firebase/config";

const LOADING_MESSAGES = [
  "Analisando os fatos do caso...",
  "Processando os documentos anexados...",
  "Identificando argumentos jurídicos relevantes...",
  "Preparando perguntas estratégicas...",
];

const ACCEPTED_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
};

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-400" />;
  if (type.startsWith("audio/")) return <Music className="h-4 w-4 text-purple-400" />;
  return <FileText className="h-4 w-4 text-amber-400" />;
}

export function Step2FactsDocs() {
  const {
    area, petitionType, facts, files,
    setFacts, setFiles, setPetitionId,
    setInitialAnalysis, setStep, setLoading, isLoading,
  } = usePetitionStore();
  const { user, tenantId } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const current = files;
    const toAdd = Array.from(newFiles).filter((f) => {
      if (current.length >= 10) {
        toast.error("Máximo de 10 arquivos permitidos");
        return false;
      }
      if (f.size > 50 * 1024 * 1024) {
        toast.error(`${f.name} excede o limite de 50MB`);
        return false;
      }
      if (!Object.keys(ACCEPTED_TYPES).includes(f.type)) {
        toast.error(`Tipo de arquivo não suportado: ${f.name}`);
        return false;
      }
      return true;
    });
    setFiles([...current, ...toAdd]);
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, i) => i !== index));
  }

  async function handleAnalyze() {
    if (!facts.trim() || facts.trim().length < 200) {
      toast.error("Descreva os fatos com pelo menos 200 caracteres");
      return;
    }
    if (!area || !petitionType || !tenantId || !user) return;

    setLoading(true, LOADING_MESSAGES[0]);

    try {
      // 1. Create petition in Firestore
      const petitionId = await createPetition(tenantId, user.uid, {
        title: `${petitionType} — ${LEGAL_AREA_LABELS[area]}`,
        area,
        type: petitionType,
        status: "analyzing",
        facts,
      });
      setPetitionId(petitionId);

      // 2. Upload files to Storage
      const storagePaths: string[] = [];
      for (const file of files) {
        const { path } = await uploadFile(tenantId, `petitions/${petitionId}/docs`, file);
        storagePaths.push(path);
      }

      // 3. Call Cloud Function
      const functions = getFunctions(app, "us-central1");
      const analyze = httpsCallable(functions, "analyzeInitialCaseFn");

      const result = await analyze({
        petitionId,
        facts,
        storagePaths,
        area: LEGAL_AREA_LABELS[area],
        petitionType,
      });

      const data = (result.data as { success: boolean; data: unknown }).data;
      setInitialAnalysis(data as Parameters<typeof setInitialAnalysis>[0]);
      setStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao analisar o caso";
      toast.error(message, { action: { label: "Tentar novamente", onClick: handleAnalyze } });
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze = facts.trim().length >= 200 && !isLoading;

  return (
    <>
      {isLoading && <LoadingOverlay messages={LOADING_MESSAGES} />}

      <div className="space-y-6 animate-fade-in">
        {/* Context header */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="text-2xl">⚖️</div>
            <div>
              <p className="text-sm font-medium">{LEGAL_AREA_LABELS[area!]}</p>
              <p className="text-xs text-muted-foreground">{petitionType}</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Alterar
            </button>
          </CardContent>
        </Card>

        {/* Facts */}
        <div className="space-y-2">
          <Label htmlFor="facts">
            Descreva os fatos e o objetivo da petição{" "}
            <span className="text-muted-foreground text-xs">(mínimo 200 caracteres)</span>
          </Label>
          <Textarea
            id="facts"
            placeholder="Descreva detalhadamente os fatos do caso, as partes envolvidas, os eventos ocorridos, as provas existentes e o resultado que se espera obter com esta petição..."
            className="min-h-[180px]"
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
          />
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">
              {facts.length < 200 ? `Faltam ${200 - facts.length} caracteres` : "✓ Mínimo atingido"}
            </span>
            <span className="text-xs text-muted-foreground">{facts.length} caracteres</span>
          </div>
        </div>

        {/* File upload */}
        <div className="space-y-3">
          <Label>Documentos (opcional)</Label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/50"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Arraste arquivos ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, JPG, PNG, WEBP, MP3, M4A, WAV · Máx. 10 arquivos · 50MB cada
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={Object.values(ACCEPTED_TYPES).join(",")}
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border"
                >
                  {fileIcon(file.type)}
                  <span className="text-sm flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button onClick={handleAnalyze} disabled={!canAnalyze} size="lg">
            Iniciar Análise com IA ✨
          </Button>
        </div>
      </div>
    </>
  );
}

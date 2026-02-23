"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePetitionStore } from "@/lib/stores/petitionStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingOverlay } from "./LoadingOverlay";
import {
  GripVertical, X, Plus, ChevronDown, ChevronUp, ArrowLeft, Sparkles,
} from "lucide-react";
import { LEGAL_AREA_LABELS, type PetitionTopic } from "@/types";
import app from "@/lib/firebase/config";

const LOADING_MESSAGES = [
  "Redigindo a petição conforme os padrões jurídicos...",
  "Fundamentando os argumentos...",
  "Revisando coerência e completude...",
  "Quase pronto...",
];

interface SortableTopicProps {
  topic: PetitionTopic;
  onRemove: (id: string) => void;
  onEdit: (id: string, field: keyof PetitionTopic, value: string) => void;
}

function SortableTopic({ topic, onRemove, onEdit }: SortableTopicProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: topic.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <button
              {...attributes}
              {...listeners}
              className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="flex-1 space-y-2">
              <Input
                value={topic.titulo}
                onChange={(e) => onEdit(topic.id, "titulo", e.target.value)}
                className="font-medium h-8"
                placeholder="Título do tópico"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">{topic.resumo}</p>
              {topic.subtopicos && topic.subtopicos.length > 0 && (
                <div className="text-xs text-muted-foreground pl-3 border-l-2 border-border space-y-1">
                  {topic.subtopicos.map((sub, i) => (
                    <p key={i}>• {sub}</p>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => onRemove(topic.id)}
              className="text-muted-foreground hover:text-destructive transition-colors mt-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Step4Structure() {
  const {
    area, petitionType, facts, petitionId,
    initialAnalysis, strategicAnswers, structure,
    setStructure, setPetitionContent, setDocxUrl, setStep,
    setLoading, isLoading,
  } = usePetitionStore();

  const [topics, setTopics] = useState<PetitionTopic[]>(structure?.topicos ?? []);
  const [pedidos, setPedidos] = useState<string[]>(structure?.pedidos ?? []);
  const [showPartes, setShowPartes] = useState(false);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [newTopic, setNewTopic] = useState({ titulo: "", resumo: "" });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTopics((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function removeTopic(id: string) {
    setTopics((t) => t.filter((topic) => topic.id !== id));
  }

  function editTopic(id: string, field: keyof PetitionTopic, value: string) {
    setTopics((t) => t.map((topic) => (topic.id === id ? { ...topic, [field]: value } : topic)));
  }

  function addTopic() {
    if (!newTopic.titulo.trim()) return;
    setTopics((t) => [...t, { id: `custom_${Date.now()}`, ...newTopic, subtopicos: [] }]);
    setNewTopic({ titulo: "", resumo: "" });
    setAddTopicOpen(false);
  }

  async function handleGenerate() {
    if (!petitionId || !area || !initialAnalysis) return;

    // Save final structure to store
    const finalStructure = { ...structure!, topicos: topics, pedidos };
    setStructure(finalStructure);

    setLoading(true, LOADING_MESSAGES[0]);

    try {
      const functions = getFunctions(app, "us-central1");
      const generate = httpsCallable(functions, "generatePetitionFn");

      const result = await generate({
        petitionId,
        area: LEGAL_AREA_LABELS[area!],
        petitionType,
        facts,
        initialAnalysis: { resumo: initialAnalysis.resumo, teses: initialAnalysis.teses },
        strategicAnswers,
        structure: finalStructure,
      });

      const data = result.data as { success: boolean; content: string; docxUrl: string };
      setPetitionContent(data.content);
      setDocxUrl(data.docxUrl);
      setStep(5);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar petição";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!structure) return null;

  return (
    <>
      {isLoading && <LoadingOverlay messages={LOADING_MESSAGES} />}

      <div className="space-y-6 animate-fade-in">
        {/* Endereçamento e partes */}
        <Card className="border-border">
          <CardContent className="p-4">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowPartes(!showPartes)}
            >
              <span className="text-sm font-medium">Endereçamento e Partes</span>
              {showPartes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showPartes && (
              <div className="mt-3 space-y-2 text-sm text-muted-foreground animate-fade-in">
                <p><strong>Endereçamento:</strong> {structure.endereçamento}</p>
                {Object.entries(structure.partes).map(([k, v]) => (
                  <p key={k}><strong>{k.charAt(0).toUpperCase() + k.slice(1)}:</strong> {v}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Topics */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tópicos da Petição</h2>
            <Button variant="outline" size="sm" onClick={() => setAddTopicOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar tópico
            </Button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={topics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {topics.map((topic) => (
                  <SortableTopic
                    key={topic.id}
                    topic={topic}
                    onRemove={removeTopic}
                    onEdit={editTopic}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Pedidos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pedidos.map((pedido, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-primary text-sm mt-2 shrink-0">{i + 1}.</span>
                  <Textarea
                    value={pedido}
                    onChange={(e) =>
                      setPedidos(pedidos.map((p, idx) => (idx === i ? e.target.value : p)))
                    }
                    className="min-h-[60px] text-sm"
                  />
                  <button
                    onClick={() => setPedidos(pedidos.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive mt-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPedidos([...pedidos, ""])}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar pedido
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(3)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button onClick={handleGenerate} disabled={isLoading || topics.length === 0} size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Gerar Petição
          </Button>
        </div>
      </div>

      {/* Add topic dialog */}
      <Dialog open={addTopicOpen} onOpenChange={setAddTopicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Tópico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                placeholder="Ex: Da Prescrição"
                value={newTopic.titulo}
                onChange={(e) => setNewTopic((t) => ({ ...t, titulo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição do conteúdo</Label>
              <Textarea
                placeholder="Descreva o que este tópico deve abordar..."
                value={newTopic.resumo}
                onChange={(e) => setNewTopic((t) => ({ ...t, resumo: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTopicOpen(false)}>Cancelar</Button>
            <Button onClick={addTopic} disabled={!newTopic.titulo.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

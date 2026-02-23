"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Search, MessageSquare, Download, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/lib/stores/authStore";
import { listPetitions, listJudgeReviews, listChatSessions } from "@/lib/firebase/firestore";
import { LEGAL_AREA_LABELS, type LegalArea } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  analyzing: "Analisando",
  questions: "Perguntas",
  structuring: "Estruturando",
  generating: "Gerando",
  completed: "Concluída",
  error: "Erro",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "info"> = {
  completed: "success",
  error: "destructive",
  generating: "default",
  analyzing: "info",
};

function formatDate(date: Date | { seconds: number } | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date((date as { seconds: number }).seconds * 1000);
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export default function HistoricoPage() {
  const { user, tenantId } = useAuthStore();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "peticoes";

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const { data: petitions = [], isLoading: loadingPetitions } = useQuery({
    queryKey: ["petitions", tenantId, user?.uid],
    queryFn: () => listPetitions(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const { data: reviews = [], isLoading: loadingReviews } = useQuery({
    queryKey: ["reviews", tenantId, user?.uid],
    queryFn: () => listJudgeReviews(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const { data: chats = [], isLoading: loadingChats } = useQuery({
    queryKey: ["chats", tenantId, user?.uid],
    queryFn: () => listChatSessions(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const filteredPetitions = petitions.filter((p) => {
    const matchSearch = search
      ? p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.type.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchArea = areaFilter !== "all" ? p.area === areaFilter : true;
    return matchSearch && matchArea;
  });

  const filteredReviews = reviews.filter((r) =>
    search ? r.description.toLowerCase().includes(search.toLowerCase()) : true
  );

  const filteredChats = chats.filter((c) =>
    search ? c.clientName.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Histórico</h1>
        <p className="text-muted-foreground mt-1">Todas as suas petições, análises e atendimentos</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {(Object.entries(LEGAL_AREA_LABELS) as [LegalArea, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="peticoes" className="gap-2">
            <FileText className="h-4 w-4" />
            Petições ({petitions.length})
          </TabsTrigger>
          <TabsTrigger value="analises" className="gap-2">
            <Search className="h-4 w-4" />
            Análises ({reviews.length})
          </TabsTrigger>
          <TabsTrigger value="atendimentos" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Atendimentos ({chats.length})
          </TabsTrigger>
        </TabsList>

        {/* Petitions tab */}
        <TabsContent value="peticoes" className="mt-4">
          {loadingPetitions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
              ))}
            </div>
          ) : filteredPetitions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground">Nenhuma petição encontrada</p>
                <Link href="/nova-peticao" className="mt-3 inline-block">
                  <Button size="sm">Criar petição</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPetitions.map((p) => (
                <Card key={p.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {LEGAL_AREA_LABELS[p.area]} · {p.type}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={(STATUS_VARIANT[p.status] ?? "secondary") as "default" | "secondary" | "success" | "destructive" | "warning" | "info"}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                      {p.docxUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(p.docxUrl!, "_blank")}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          DOCX
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reviews tab */}
        <TabsContent value="analises" className="mt-4">
          {loadingReviews ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
              ))}
            </div>
          ) : filteredReviews.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground">Nenhuma análise encontrada</p>
                <Link href="/analise-peticao" className="mt-3 inline-block">
                  <Button size="sm">Analisar petição</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((r) => {
                const prob = r.report?.probabilidade_exito;
                const probVariant = prob === "Alta" ? "success" : prob === "Média" ? "warning" : prob === "Baixa" ? "destructive" : "secondary";
                return (
                  <Card key={r.id} className="hover:border-emerald-500/40 transition-colors">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="p-2.5 rounded-lg bg-emerald-400/10 shrink-0">
                        <Search className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{r.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(r.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {prob && (
                          <Badge variant={probVariant as "default" | "secondary" | "success" | "destructive" | "warning"}>
                            Êxito: {prob}
                          </Badge>
                        )}
                        {r.docxUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(r.docxUrl!, "_blank")}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Relatório
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Chats tab */}
        <TabsContent value="atendimentos" className="mt-4">
          {loadingChats ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground">Nenhum atendimento encontrado</p>
                <Link href="/atendimento" className="mt-3 inline-block">
                  <Button size="sm">Iniciar atendimento</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredChats.map((c) => (
                <Card key={c.id} className="hover:border-amber-500/40 transition-colors">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-amber-400/10 shrink-0">
                      <MessageSquare className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{c.clientName}</p>
                      <p className="text-sm text-muted-foreground">
                        {LEGAL_AREA_LABELS[c.area]}
                        {c.description ? ` · ${c.description}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={c.status === "active" ? "success" : "secondary"}>
                        {c.status === "active" ? "Ativo" : "Encerrado"}
                      </Badge>
                      <Link href={`/atendimento?session=${c.id}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Abrir
                        </Button>
                      </Link>
                      {c.reportUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(c.reportUrl!, "_blank")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

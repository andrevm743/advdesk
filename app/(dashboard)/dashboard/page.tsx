"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FileText, Search, MessageSquare, TrendingUp, Clock, ArrowRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/stores/authStore";
import { listPetitions } from "@/lib/firebase/firestore";
import { listJudgeReviews } from "@/lib/firebase/firestore";
import { listChatSessions } from "@/lib/firebase/firestore";
import { LEGAL_AREA_LABELS } from "@/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DashboardPage() {
  const { user, tenantId } = useAuthStore();

  const { data: petitions = [] } = useQuery({
    queryKey: ["petitions", tenantId, user?.uid],
    queryFn: () => listPetitions(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", tenantId, user?.uid],
    queryFn: () => listJudgeReviews(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const { data: chats = [] } = useQuery({
    queryKey: ["chats", tenantId, user?.uid],
    queryFn: () => listChatSessions(tenantId!, user!.uid),
    enabled: !!tenantId && !!user?.uid,
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const petitionsThisMonth = petitions.filter((p) => {
    const date = p.createdAt instanceof Date ? p.createdAt : new Date((p.createdAt as { seconds: number }).seconds * 1000);
    return date >= startOfMonth;
  }).length;

  const activeChats = chats.filter((c) => c.status === "active").length;

  const recentItems = [
    ...petitions.slice(0, 3).map((p) => ({ ...p, _type: "petition" as const })),
    ...reviews.slice(0, 2).map((r) => ({ ...r, _type: "review" as const })),
    ...chats.slice(0, 2).map((c) => ({ ...c, _type: "chat" as const })),
  ]
    .sort((a, b) => {
      const aDate = a.updatedAt instanceof Date ? a.updatedAt : new Date((a.updatedAt as { seconds: number }).seconds * 1000);
      const bDate = b.updatedAt instanceof Date ? b.updatedAt : new Date((b.updatedAt as { seconds: number }).seconds * 1000);
      return bDate.getTime() - aDate.getTime();
    })
    .slice(0, 6);

  const stats = [
    {
      label: "Petições este mês",
      value: petitionsThisMonth,
      icon: FileText,
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/nova-peticao",
    },
    {
      label: "Análises realizadas",
      value: reviews.length,
      icon: Search,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      href: "/analise-peticao",
    },
    {
      label: "Atendimentos ativos",
      value: activeChats,
      icon: MessageSquare,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      href: "/atendimento",
    },
    {
      label: "Total de peças",
      value: petitions.length,
      icon: TrendingUp,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      href: "/historico",
    },
  ];

  const quickActions = [
    { label: "Nova Petição", href: "/nova-peticao", icon: FileText, description: "Gerar peça com IA" },
    { label: "Analisar Petição", href: "/analise-peticao", icon: Search, description: "Visão do julgador" },
    { label: "Novo Atendimento", href: "/atendimento", icon: MessageSquare, description: "Chat jurídico" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Bom dia, {user?.displayName?.split(" ")[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ações rápidas
          </h2>
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{action.label}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Atividade recente
            </h2>
            <Link href="/historico">
              <Button variant="ghost" size="sm" className="text-xs">
                Ver tudo <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>

          {recentItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma atividade ainda</p>
                <Link href="/nova-peticao" className="mt-3 inline-block">
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar primeira petição
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentItems.map((item) => {
                const date =
                  item.updatedAt instanceof Date
                    ? item.updatedAt
                    : new Date((item.updatedAt as { seconds: number }).seconds * 1000);

                if (item._type === "petition") {
                  return (
                    <Link key={item.id} href={`/historico?tab=peticoes`}>
                      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {LEGAL_AREA_LABELS[item.area]} · {item.type}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={item.status === "completed" ? "success" : "secondary"}>
                              {item.status === "completed" ? "Concluída" : "Em andamento"}
                            </Badge>
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(date, "dd/MM/yy")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                }

                if (item._type === "review") {
                  return (
                    <Link key={item.id} href={`/historico?tab=analises`}>
                      <Card className="hover:border-emerald-500/50 transition-colors cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-400/10">
                            <Search className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.description}</p>
                            <p className="text-xs text-muted-foreground">Análise de petição</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {format(date, "dd/MM/yy")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                }

                return (
                  <Link key={item.id} href={`/atendimento?session=${item.id}`}>
                    <Card className="hover:border-amber-500/50 transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-400/10">
                          <MessageSquare className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {(item as { clientName: string }).clientName}
                          </p>
                          <p className="text-xs text-muted-foreground">Atendimento</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={(item as { status: string }).status === "active" ? "success" : "secondary"}>
                            {(item as { status: string }).status === "active" ? "Ativo" : "Encerrado"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(date, "dd/MM/yy")}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

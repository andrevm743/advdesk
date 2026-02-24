"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { format } from "date-fns";
import {
  Plus, Search, Send, Upload, X, MessageSquare,
  FileText, Loader2, Download, LogOut, Bot, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  createChatSession, updateChatSession,
  subscribeChatMessages, subscribeChatSessions,
} from "@/lib/firebase/firestore";
import { uploadFile } from "@/lib/firebase/storage";
import { LEGAL_AREA_LABELS, type LegalArea, type ChatSession, type ChatMessage } from "@/types";
import { cn } from "@/lib/utils/cn";
import app from "@/lib/firebase/config";

export default function AtendimentoPage() {
  const { user, tenantId } = useAuthStore();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSession, setNewSession] = useState({ clientName: "" });

  // Subscribe to sessions
  useEffect(() => {
    if (!tenantId || !user?.uid) return;
    const unsubscribe = subscribeChatSessions(tenantId, user.uid, setSessions);
    return () => unsubscribe();
  }, [tenantId, user?.uid]);

  // Open session from URL param
  useEffect(() => {
    const sessionId = searchParams.get("session");
    if (sessionId && sessions.length > 0) {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) setActiveSession(session);
    }
  }, [searchParams, sessions]);

  // Subscribe to messages of active session
  useEffect(() => {
    if (!activeSession || !tenantId) return;
    const unsubscribe = subscribeChatMessages(tenantId, activeSession.id, setMessages);
    return () => unsubscribe();
  }, [activeSession, tenantId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleCreateSession() {
    if (!newSession.clientName.trim() || !tenantId || !user) return;
    try {
      const id = await createChatSession(tenantId, user.uid, {
        clientName: newSession.clientName,
        area: "outras" as LegalArea,
        description: "",
        status: "active",
      });

      // Selecionar a sessão criada imediatamente (sem esperar subscription)
      const stubSession: ChatSession = {
        id,
        tenantId,
        userId: user.uid,
        clientName: newSession.clientName,
        area: "outras" as LegalArea,
        description: "",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setActiveSession(stubSession);
      setNewSession({ clientName: "" });
      setNewSessionOpen(false);
    } catch {
      toast.error("Erro ao criar atendimento");
    }
  }

  async function handleSendMessage() {
    if ((!messageInput.trim() && !attachedFile) || !activeSession || !tenantId || isSending) return;

    setIsSending(true);
    const messageText = messageInput.trim();
    setMessageInput("");

    try {
      let fileStoragePath: string | undefined;

      if (attachedFile) {
        const { path } = await uploadFile(
          tenantId,
          `chat/${activeSession.id}`,
          attachedFile
        );
        fileStoragePath = path;
        setAttachedFile(null);
      }

      // Optimistic: add user message locally
      const optimisticMsg: ChatMessage = {
        id: `temp_${Date.now()}`,
        sessionId: activeSession.id,
        role: "user",
        content: messageText || `[Arquivo: ${attachedFile?.name}]`,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      // Call Cloud Function
      const functions = getFunctions(app, "us-central1");
      const sendMessage = httpsCallable(functions, "sendChatMessageFn");

      const historyForApi = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await sendMessage({
        sessionId: activeSession.id,
        message: messageText,
        history: historyForApi,
        clientName: activeSession.clientName,
        area: LEGAL_AREA_LABELS[activeSession.area],
        fileStoragePath,
      });

      // Messages will update via Firestore subscription
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar mensagem";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }

  async function handleGenerateReport() {
    if (!activeSession || !tenantId) return;
    setIsGeneratingReport(true);
    try {
      const functions = getFunctions(app, "us-central1");
      const generateReport = httpsCallable(functions, "generateChatReportFn");

      const reportResult = await generateReport({
        sessionId: activeSession.id,
        clientName: activeSession.clientName,
        area: LEGAL_AREA_LABELS[activeSession.area],
      });

      const { docxUrl } = reportResult.data as { docxUrl: string };
      toast.success("Relatório gerado!", {
        action: { label: "Baixar", onClick: () => window.open(docxUrl, "_blank") },
      });
    } catch {
      toast.error("Erro ao gerar relatório");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleEndSession() {
    if (!activeSession || !tenantId) return;
    await updateChatSession(tenantId, activeSession.id, { status: "closed" });
    toast.success("Atendimento encerrado");
  }

  const filteredSessions = sessions.filter((s) =>
    s.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — sessions list */}
      <div className="w-72 border-r border-border flex flex-col bg-sidebar shrink-0">
        <div className="p-4 border-b border-sidebar-border space-y-3">
          <Button className="w-full gap-2" onClick={() => setNewSessionOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo Atendimento
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar atendimentos..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {searchQuery ? "Nenhum resultado" : "Nenhum atendimento ainda"}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const date = session.updatedAt
                ? (session.updatedAt instanceof Date
                    ? session.updatedAt
                    : new Date((session.updatedAt as { seconds: number }).seconds * 1000))
                : new Date();
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session)}
                  className={cn(
                    "w-full text-left p-4 border-b border-sidebar-border hover:bg-sidebar-accent transition-colors",
                    activeSession?.id === session.id && "bg-sidebar-accent"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{session.clientName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={session.status === "active" ? "success" : "secondary"} className="text-[10px]">
                        {session.status === "active" ? "Ativo" : "Encerrado"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {session.lastMessage ?? LEGAL_AREA_LABELS[session.area]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(date, "dd/MM HH:mm")}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      {activeSession ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
            <div>
              <h2 className="font-semibold">{activeSession.clientName}</h2>
              <p className="text-xs text-muted-foreground">{LEGAL_AREA_LABELS[activeSession.area]}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
              >
                {isGeneratingReport ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Gerar Relatório
              </Button>
              {activeSession.status === "active" && (
                <Button variant="outline" size="sm" onClick={handleEndSession}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Encerrar
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Inicie o atendimento enviando uma mensagem</p>
              </div>
            )}
            {messages.map((msg) => {
              const date = msg.createdAt
                ? (msg.createdAt instanceof Date
                    ? msg.createdAt
                    : new Date((msg.createdAt as { seconds: number }).seconds * 1000))
                : new Date();
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-secondary text-foreground rounded-tl-sm"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <p className={cn("text-xs mt-1", msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {format(date, "HH:mm")}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
            {isSending && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {activeSession.status === "active" && (
            <div className="border-t border-border p-4">
              {attachedFile && (
                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-secondary text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="flex-1 truncate">{attachedFile.name}</span>
                  <button onClick={() => setAttachedFile(null)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-muted-foreground hover:text-foreground transition-colors p-2"
                >
                  <Upload className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.mp3,.m4a,.wav"
                  onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)}
                />
                <Textarea
                  placeholder="Digite sua mensagem..."
                  className="flex-1 min-h-[44px] max-h-[160px] resize-none"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && !attachedFile) || isSending}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecione um atendimento</p>
            <p className="text-sm mt-1">ou inicie um novo atendimento</p>
            <Button className="mt-4" onClick={() => setNewSessionOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Atendimento
            </Button>
          </div>
        </div>
      )}

      {/* New session dialog */}
      <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Atendimento</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-2">
              <Label>Nome do cliente *</Label>
              <Input
                placeholder="Ex: João Silva"
                value={newSession.clientName}
                onChange={(e) => setNewSession({ clientName: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSessionOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateSession}
              disabled={!newSession.clientName.trim()}
            >
              Iniciar Atendimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

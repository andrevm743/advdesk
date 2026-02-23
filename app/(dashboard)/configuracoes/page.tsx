"use client";

import { useEffect, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  Settings,
  Upload,
  Trash2,
  UserPlus,
  UserX,
  Copy,
  Check,
  FileText,
  Shield,
  Brain,
  BookOpen,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  getOfficeSettings,
  saveOfficeSettings,
  getAIPrompts,
  saveAIPrompts,
  listKnowledgeDocs,
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  listTenantUsers,
} from "@/lib/firebase/firestore";
import { uploadFile, deleteFile } from "@/lib/firebase/storage";
import { auth } from "@/lib/firebase/config";
import app from "@/lib/firebase/config";
import type { OfficeSettings, AIPrompts, KnowledgeDocument, UserProfile, KnowledgeCategory } from "@/types";
import { KNOWLEDGE_CATEGORY_LABELS } from "@/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Aba 1 — Perfil do Escritório ─────────────────────────────────────────────
function TabPerfil({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<OfficeSettings>({});
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getOfficeSettings(tenantId).then((s) => {
      if (s) {
        setSettings(s);
        if (s.logoUrl) setLogoPreview(s.logoUrl);
      }
    });
  }, [tenantId]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let updated = { ...settings };
      if (logoFile) {
        const { url, path } = await uploadFile(tenantId, "office/logo", logoFile);
        updated = { ...updated, logoUrl: url, logoStoragePath: path };
        setLogoFile(null);
      }
      await saveOfficeSettings(tenantId, updated);
      setSettings(updated);
      toast.success("Perfil do escritório salvo.");
    } catch {
      toast.error("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Perfil do Escritório
        </CardTitle>
        <CardDescription>
          Estas informações aparecem no cabeçalho dos documentos gerados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo do Escritório</Label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo"
                className="h-16 w-16 rounded-lg object-contain border border-border bg-secondary"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-secondary">
                <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {logoPreview ? "Alterar logo" : "Carregar logo"}
            </Button>
            <input
              ref={logoInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleLogoChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome do Escritório</Label>
            <Input
              value={settings.name ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
              placeholder="Ex: Advocacia Silva & Associados"
            />
          </div>
          <div className="space-y-2">
            <Label>N° OAB</Label>
            <Input
              value={settings.oabNumber ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, oabNumber: e.target.value }))}
              placeholder="Ex: SP 123.456"
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={settings.email ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
              placeholder="contato@escritorio.com.br"
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={settings.phone ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={settings.address ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))}
              placeholder="Rua, número, bairro, cidade — UF"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Aba 2 — Prompts da IA ────────────────────────────────────────────────────
const PROMPT_DEFAULTS = {
  petitionPrompt: "",
  judgePrompt: "",
  chatPrompt: "",
};

const PROMPT_PLACEHOLDERS = {
  petitionPrompt:
    "Ex: Sempre mencione a legislação municipal de São Paulo quando aplicável. Inclua jurisprudência do TJSP prioritariamente.",
  judgePrompt:
    "Ex: Avalie com especial atenção os aspectos processuais formais. Nosso escritório atua principalmente no TJSP.",
  chatPrompt:
    "Ex: Mencione que o escritório atua há 15 anos na área trabalhista. Seja objetivo na análise de riscos processuais.",
};

function TabPrompts({ tenantId }: { tenantId: string }) {
  const [prompts, setPrompts] = useState<AIPrompts>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAIPrompts(tenantId).then((p) => {
      if (p) setPrompts(p);
    });
  }, [tenantId]);

  async function handleSave(key: keyof AIPrompts) {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await saveAIPrompts(tenantId, { [key]: prompts[key] ?? "" });
      toast.success("Prompt salvo.");
    } catch {
      toast.error("Erro ao salvar prompt.");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  function handleRestore(key: keyof AIPrompts) {
    setPrompts((p) => ({ ...p, [key]: PROMPT_DEFAULTS[key] }));
  }

  const promptItems: Array<{ key: keyof AIPrompts; label: string; description: string }> = [
    {
      key: "petitionPrompt",
      label: "Prompt — Geração de Petições",
      description:
        "Instrução adicional para o modelo ao redigir petições. Complementa o prompt padrão.",
    },
    {
      key: "judgePrompt",
      label: "Prompt — Análise de Petições",
      description:
        "Instrução adicional para o agente julgador ao revisar petições.",
    },
    {
      key: "chatPrompt",
      label: "Prompt — Atendimento ao Cliente",
      description:
        "Instrução adicional para o assistente durante o atendimento.",
    },
  ];

  return (
    <div className="space-y-6">
      {promptItems.map(({ key, label, description }) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              {label}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="min-h-[160px] text-sm"
              placeholder={PROMPT_PLACEHOLDERS[key]}
              value={prompts[key] ?? ""}
              onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRestore(key)}
                disabled={!prompts[key]}
              >
                Restaurar padrão
              </Button>
              <Button size="sm" onClick={() => handleSave(key)} disabled={saving[key]}>
                {saving[key] ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Aba 3 — Base de Conhecimento ─────────────────────────────────────────────
function TabKnowledge({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<{
    name: string;
    category: KnowledgeCategory;
    file: File | null;
  }>({ name: "", category: "modelos", file: null });
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listKnowledgeDocs(tenantId)
      .then(setDocs)
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function handleAdd() {
    if (!newDoc.file || !newDoc.name.trim()) {
      toast.error("Selecione um arquivo e informe o nome.");
      return;
    }
    setUploading(true);
    try {
      const { url, path } = await uploadFile(
        tenantId,
        `knowledge/${newDoc.category}`,
        newDoc.file
      );
      const id = await addKnowledgeDoc(tenantId, userId, {
        name: newDoc.name.trim(),
        category: newDoc.category,
        storagePath: path,
        fileUrl: url,
        size: newDoc.file.size,
        mimeType: newDoc.file.type,
      });
      const added: KnowledgeDocument = {
        id,
        tenantId,
        userId,
        name: newDoc.name.trim(),
        category: newDoc.category,
        storagePath: path,
        fileUrl: url,
        size: newDoc.file.size,
        mimeType: newDoc.file.type,
        createdAt: new Date(),
      };
      setDocs((d) => [added, ...d]);
      setNewDoc({ name: "", category: "modelos", file: null });
      setAddOpen(false);
      toast.success("Documento adicionado à base de conhecimento.");
    } catch {
      toast.error("Erro ao adicionar documento.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: KnowledgeDocument) {
    setDeleting(doc.id);
    try {
      await deleteFile(doc.storagePath);
      await deleteKnowledgeDoc(tenantId, doc.id);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
      toast.success("Documento removido.");
    } catch {
      toast.error("Erro ao remover documento.");
    } finally {
      setDeleting(null);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(createdAt: KnowledgeDocument["createdAt"]) {
    try {
      const d =
        createdAt instanceof Date
          ? createdAt
          : new Date((createdAt as { seconds: number }).seconds * 1000);
      return format(d, "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "—";
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Base de Conhecimento
          </CardTitle>
          <CardDescription>
            Documentos enviados são utilizados como contexto em todas as análises de IA.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando documentos...</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum documento na base de conhecimento.</p>
            <p className="text-xs mt-1">Adicione modelos, jurisprudências e procedimentos.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {KNOWLEDGE_CATEGORY_LABELS[doc.category]} · {formatSize(doc.size)} ·{" "}
                    {formatDate(doc.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {KNOWLEDGE_CATEGORY_LABELS[doc.category]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add doc dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Arquivo (PDF, DOCX ou TXT)</Label>
              {newDoc.file ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-secondary text-sm">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1 truncate">{newDoc.file.name}</span>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setNewDoc((d) => ({ ...d, file: null }))}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Selecionar arquivo
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) setNewDoc((d) => ({ ...d, file: f, name: d.name || f.name.replace(/\.[^.]+$/, "") }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do documento</Label>
              <Input
                placeholder="Ex: Modelo Reclamação Trabalhista"
                value={newDoc.name}
                onChange={(e) => setNewDoc((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={newDoc.category}
                onValueChange={(v) => setNewDoc((d) => ({ ...d, category: v as KnowledgeCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={uploading || !newDoc.file || !newDoc.name.trim()}>
              {uploading ? "Enviando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Aba 4 — Usuários ─────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  lawyer: "Advogado",
  assistant: "Assistente",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  lawyer: "secondary",
  assistant: "outline",
};

function TabUsers({ tenantId, currentUserId }: { tenantId: string; currentUserId: string }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", name: "", role: "lawyer" as const });
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    listTenantUsers(tenantId)
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function handleInvite() {
    if (!invite.email.trim() || !invite.name.trim()) {
      toast.error("Preencha e-mail e nome.");
      return;
    }
    setInviting(true);
    try {
      const functions = getFunctions(app, "us-central1");
      const inviteUserFn = httpsCallable<
        { email: string; name: string; role: string },
        { success: boolean; uid: string; resetLink: string }
      >(functions, "inviteUserFn");

      const result = await inviteUserFn({
        email: invite.email.trim(),
        name: invite.name.trim(),
        role: invite.role,
      });

      // Also send password reset email via client SDK
      try {
        await sendPasswordResetEmail(auth, invite.email.trim());
      } catch {
        // Non-fatal: link still available
      }

      setUsers((u) => [
        ...u,
        {
          uid: result.data.uid,
          tenantId,
          email: invite.email.trim(),
          displayName: invite.name.trim(),
          role: invite.role,
          active: true,
          createdAt: new Date(),
        } as UserProfile,
      ]);

      setCopiedLink(result.data.resetLink);
      setInvite({ email: "", name: "", role: "lawyer" });
      setInviteOpen(false);
      toast.success(`Convite enviado para ${invite.email.trim()}.`);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Erro ao convidar usuário.";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleDeactivate(userId: string) {
    setDeactivating(userId);
    try {
      const functions = getFunctions(app, "us-central1");
      const deactivateUserFn = httpsCallable(functions, "deactivateUserFn");
      await deactivateUserFn({ userId });
      setUsers((u) =>
        u.map((user) => (user.uid === userId ? { ...user, active: false } : user))
      );
      toast.success("Usuário desativado.");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Erro ao desativar usuário.";
      toast.error(msg);
    } finally {
      setDeactivating(null);
    }
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
    setCopiedLink(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Usuários do Escritório
          </CardTitle>
          <CardDescription>
            Gerencie os membros que têm acesso ao ADVDESK.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Convidar
        </Button>
      </CardHeader>
      <CardContent>
        {/* Pending invite link */}
        {copiedLink && (
          <div className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
            <p className="font-medium text-foreground mb-2">
              Convite criado! Compartilhe este link de acesso:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary rounded px-2 py-1 truncate">
                {copiedLink}
              </code>
              <Button size="sm" variant="outline" onClick={() => copyLink(copiedLink)}>
                <Copy className="h-3 w-3 mr-1" />
                Copiar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando usuários...</p>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div key={user.uid} className="flex items-center gap-3 py-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {user.displayName?.charAt(0).toUpperCase() ?? "?"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <Badge variant={ROLE_VARIANTS[user.role] ?? "outline"} className="shrink-0 text-xs">
                  {ROLE_LABELS[user.role] ?? user.role}
                </Badge>
                {(user as UserProfile & { active?: boolean }).active === false ? (
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    Inativo
                  </Badge>
                ) : null}
                {user.uid !== currentUserId && (user as UserProfile & { active?: boolean }).active !== false && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeactivate(user.uid)}
                    disabled={deactivating === user.uid}
                    title="Desativar usuário"
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                placeholder="Ex: Maria Souza"
                value={invite.name}
                onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                placeholder="maria@escritorio.com.br"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil de acesso</Label>
              <Select
                value={invite.role}
                onValueChange={(v) => setInvite((i) => ({ ...i, role: v as typeof invite.role }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="lawyer">Advogado</SelectItem>
                  <SelectItem value="assistant">Assistente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleInvite}
              disabled={inviting || !invite.email.trim() || !invite.name.trim()}
            >
              {inviting ? "Enviando convite..." : "Enviar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConfiguracoesPage() {
  const { user, tenantId } = useAuthStore();

  if (!tenantId || !user) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <Shield className="h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-foreground">Acesso restrito</p>
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem acessar as configurações.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Personalize o escritório, os prompts da IA, a base de conhecimento e os usuários.
        </p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="prompts">Prompts IA</TabsTrigger>
          <TabsTrigger value="conhecimento">Base de Conhecimento</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <TabPerfil tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <TabPrompts tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="conhecimento" className="mt-6">
          <TabKnowledge tenantId={tenantId} userId={user.uid} />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <TabUsers tenantId={tenantId} currentUserId={user.uid} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

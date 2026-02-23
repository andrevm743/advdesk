import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 300,
  memory: "1GiB",
  secrets: ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"],
});

import { analyzeInitialCase, buildPetitionStructure, analyzeForJudge, generateChatReport } from "./services/geminiService";
import { generatePetition, generateJudgeReport, generateChatResponse } from "./services/claudeService";
import { generatePetitionDocx, generateJudgeReportDocx, uploadDocxToStorage } from "./services/docxService";

// ─── Rate limit helper ─────────────────────────────────────────────────────────
const db = admin.firestore();

async function checkRateLimit(uid: string, action: string, maxPerHour: number): Promise<void> {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const ref = db.collection("rateLimits").doc(`${uid}_${action}`);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.data() ?? { calls: [] as number[] };
    const calls = (data.calls as number[]).filter((t: number) => t > windowStart);

    if (calls.length >= maxPerHour) {
      throw new HttpsError("resource-exhausted", `Limite de ${maxPerHour} ${action} por hora atingido. Tente novamente mais tarde.`);
    }

    calls.push(now);
    tx.set(ref, { calls });
  });
}

// ─── Validate auth & tenant ────────────────────────────────────────────────────
interface AuthContext {
  uid: string;
  tenantId: string;
}

async function validateAuth(auth?: { uid: string } | null): Promise<AuthContext> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Autenticação necessária");

  const indexDoc = await db.collection("userIndex").doc(auth.uid).get();
  if (!indexDoc.exists) throw new HttpsError("not-found", "Perfil de usuário não encontrado");

  const { tenantId } = indexDoc.data() as { tenantId: string };
  return { uid: auth.uid, tenantId };
}

// ─── Tenant settings helpers ───────────────────────────────────────────────────
interface TenantPrompts {
  petitionPrompt?: string;
  judgePrompt?: string;
  chatPrompt?: string;
}

interface TenantOfficeSettings {
  name?: string;
  oabNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
}

// ─── Knowledge base: area-filtered paths ──────────────────────────────────────
// Returns storage paths of KB docs matching the given legal area.
// Falls back to "geral" docs if no area-specific docs exist.
// If no area is given, returns the 5 most recent docs.
async function getKnowledgeBasePaths(tenantId: string, area?: string): Promise<string[]> {
  const kbRef = db.collection("tenants").doc(tenantId).collection("knowledgeBase");

  if (area) {
    // Try area-specific docs
    const areaSnap = await kbRef
      .where("areas", "array-contains", area)
      .limit(5)
      .get();

    if (!areaSnap.empty) {
      return areaSnap.docs.map((d) => d.data().storagePath as string).filter(Boolean);
    }

    // Fallback: "geral" docs (apply to all areas)
    const geralSnap = await kbRef
      .where("areas", "array-contains", "geral")
      .limit(5)
      .get();

    if (!geralSnap.empty) {
      return geralSnap.docs.map((d) => d.data().storagePath as string).filter(Boolean);
    }

    // Last resort: any docs without areas set (legacy / no areas tag)
    const legacySnap = await kbRef.orderBy("createdAt", "desc").limit(5).get();
    return legacySnap.docs.map((d) => d.data().storagePath as string).filter(Boolean);
  }

  // No area: return 5 most recent docs
  const snap = await kbRef.orderBy("createdAt", "desc").limit(5).get();
  return snap.docs.map((d) => d.data().storagePath as string).filter(Boolean);
}

async function getTenantSettings(tenantId: string): Promise<{
  prompts: TenantPrompts;
  office: TenantOfficeSettings | undefined;
}> {
  const [promptsDoc, officeDoc] = await Promise.all([
    db.collection("tenants").doc(tenantId).collection("settings").doc("prompts").get(),
    db.collection("tenants").doc(tenantId).collection("settings").doc("office").get(),
  ]);
  return {
    prompts: (promptsDoc.data() ?? {}) as TenantPrompts,
    office: officeDoc.data() as TenantOfficeSettings | undefined,
  };
}

// ─── PETITION: Analyze Initial Case ───────────────────────────────────────────
export const analyzeInitialCaseFn = onCall(
  { timeoutSeconds: 120, memory: "2GiB" },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "petition_analysis", 20);

    const { petitionId, facts, storagePaths, area, petitionType } = request.data as {
      petitionId: string;
      facts: string;
      storagePaths: string[];
      area: string;
      petitionType: string;
    };

    if (!petitionId || !facts || !area || !petitionType) {
      throw new HttpsError("invalid-argument", "Campos obrigatórios ausentes");
    }

    logger.info(`Analyzing case for petition ${petitionId} (tenant: ${tenantId})`);

    try {
      const [kbPaths, settings] = await Promise.all([
        getKnowledgeBasePaths(tenantId, area),
        getTenantSettings(tenantId),
      ]);

      const result = await analyzeInitialCase({
        facts,
        storagePaths,
        area,
        petitionType,
        knowledgeBasePaths: kbPaths,
        customSystemPrompt: settings.prompts.petitionPrompt,
      });

      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("petitions")
        .doc(petitionId)
        .update({
          initialAnalysis: result,
          status: "questions",
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, data: result };
    } catch (err) {
      logger.error("analyzeInitialCase error:", err);
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("petitions")
        .doc(petitionId)
        .update({ status: "error", updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError("internal", "Erro ao analisar o caso. Tente novamente.");
    }
  }
);

// ─── PETITION: Build Structure ─────────────────────────────────────────────────
export const buildPetitionStructureFn = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    const { tenantId } = await validateAuth(request.auth);

    const { petitionId, facts, area, petitionType, initialAnalysis, strategicAnswers } = request.data as {
      petitionId: string;
      facts: string;
      area: string;
      petitionType: string;
      initialAnalysis: { resumo: string; teses: string[] };
      strategicAnswers: Record<string, string | string[]>;
    };

    logger.info(`Building structure for petition ${petitionId}`);

    try {
      const [kbPaths, settings] = await Promise.all([
        getKnowledgeBasePaths(tenantId, area),
        getTenantSettings(tenantId),
      ]);

      const structure = await buildPetitionStructure({
        facts,
        area,
        petitionType,
        initialAnalysis: { resumo: initialAnalysis.resumo, teses: initialAnalysis.teses, perguntas: [] },
        strategicAnswers,
        knowledgeBasePaths: kbPaths,
        customSystemPrompt: settings.prompts.petitionPrompt,
      });

      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("petitions")
        .doc(petitionId)
        .update({
          structure,
          strategicAnswers,
          status: "structuring",
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, data: structure };
    } catch (err) {
      logger.error("buildPetitionStructure error:", err);
      throw new HttpsError("internal", "Erro ao gerar estrutura. Tente novamente.");
    }
  }
);

// ─── PETITION: Generate Full Petition ─────────────────────────────────────────
export const generatePetitionFn = onCall(
  { timeoutSeconds: 300, memory: "2GiB" },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "petition_generation", 10);

    const { petitionId, area, petitionType, facts, initialAnalysis, strategicAnswers, structure } =
      request.data as {
        petitionId: string;
        area: string;
        petitionType: string;
        facts: string;
        initialAnalysis: { resumo: string; teses: string[] };
        strategicAnswers: Record<string, string | string[]>;
        structure: {
          endereçamento: string;
          partes: Record<string, string>;
          topicos: Array<{ id: string; titulo: string; resumo: string; subtopicos?: string[] }>;
          pedidos: string[];
        };
      };

    logger.info(`Generating petition ${petitionId} (tenant: ${tenantId})`);

    try {
      const settings = await getTenantSettings(tenantId);

      // Generate petition text with Claude
      const petitionText = await generatePetition({
        area,
        petitionType,
        facts,
        initialAnalysisSummary: initialAnalysis.resumo,
        teses: initialAnalysis.teses,
        strategicAnswers,
        structure,
        customSystemPrompt: settings.prompts.petitionPrompt,
      });

      // Generate DOCX
      const title = `${petitionType} — ${area}`;
      const docxBuffer = await generatePetitionDocx(petitionText, title, area, petitionType, settings.office);

      // Upload DOCX to Storage — returns { url, path }
      const fileName = `peticao_${petitionId}_${Date.now()}.docx`;
      const { url: docxUrl, path: docxPath } = await uploadDocxToStorage(docxBuffer, tenantId, "petitions", fileName);

      // Update Firestore
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("petitions")
        .doc(petitionId)
        .update({
          content: petitionText,
          docxUrl,
          docxPath,
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, content: petitionText, docxUrl, docxPath };
    } catch (err) {
      logger.error("generatePetition error:", err);
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("petitions")
        .doc(petitionId)
        .update({ status: "error", updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError("internal", "Erro ao gerar a petição. Tente novamente.");
    }
  }
);

// ─── JUDGE: Analyze Petition ───────────────────────────────────────────────────
export const analyzeForJudgeFn = onCall(
  { timeoutSeconds: 120, memory: "2GiB" },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "judge_analysis", 10);

    const { reviewId, description, petitionContent, storagePaths, petitionFileStoragePath } = request.data as {
      reviewId: string;
      description: string;
      petitionContent: string;
      storagePaths: string[];
      petitionFileStoragePath?: string;
    };

    logger.info(`Analyzing petition for judge review ${reviewId}`);

    try {
      const [kbPaths, settings] = await Promise.all([
        getKnowledgeBasePaths(tenantId),
        getTenantSettings(tenantId),
      ]);

      const result = await analyzeForJudge({
        description,
        petitionContent,
        storagePaths,
        petitionFileStoragePath,
        knowledgeBasePaths: kbPaths,
        customSystemPrompt: settings.prompts.judgePrompt,
      });

      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("judgeReviews")
        .doc(reviewId)
        .update({
          initialAnalysis: result,
          status: "questions",
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, data: result };
    } catch (err) {
      logger.error("analyzeForJudge error:", err);
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("judgeReviews")
        .doc(reviewId)
        .update({ status: "error", updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError("internal", "Erro ao analisar a petição. Tente novamente.");
    }
  }
);

// ─── JUDGE: Generate Report ────────────────────────────────────────────────────
export const generateJudgeReportFn = onCall(
  { timeoutSeconds: 240, memory: "2GiB" },
  async (request) => {
    const { tenantId } = await validateAuth(request.auth);

    const { reviewId, petitionContent, description, initialAnalysis, strategicAnswers } =
      request.data as {
        reviewId: string;
        petitionContent: string;
        description: string;
        initialAnalysis: { resumo_peticao: string; impressao_inicial: string };
        strategicAnswers: Record<string, string | string[]>;
      };

    logger.info(`Generating judge report for review ${reviewId}`);

    try {
      const settings = await getTenantSettings(tenantId);

      const report = await generateJudgeReport({
        petitionContent,
        description,
        initialAnalysis,
        strategicAnswers,
        customSystemPrompt: settings.prompts.judgePrompt,
      });

      // Generate DOCX
      const docxBuffer = await generateJudgeReportDocx(report, description, settings.office);
      const fileName = `relatorio_${reviewId}_${Date.now()}.docx`;
      const { url: docxUrl, path: docxPath } = await uploadDocxToStorage(docxBuffer, tenantId, "judge-reports", fileName);

      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("judgeReviews")
        .doc(reviewId)
        .update({
          report,
          docxUrl,
          docxPath,
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, report, docxUrl, docxPath };
    } catch (err) {
      logger.error("generateJudgeReport error:", err);
      throw new HttpsError("internal", "Erro ao gerar o relatório. Tente novamente.");
    }
  }
);

// ─── CHAT: Send Message ────────────────────────────────────────────────────────
export const sendChatMessageFn = onCall(
  { timeoutSeconds: 60 },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "chat_message", 100);

    const { sessionId, message, history, clientName, area, fileStoragePath } = request.data as {
      sessionId: string;
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      clientName: string;
      area: string;
      fileStoragePath?: string;
    };

    logger.info(`Processing chat message for session ${sessionId}`);

    try {
      const [kbPaths, settings] = await Promise.all([
        getKnowledgeBasePaths(tenantId, area),
        getTenantSettings(tenantId),
      ]);

      let fileContext: string | undefined;

      // Process attached file with Gemini if present
      if (fileStoragePath) {
        const { transcribeAudio } = await import("./services/geminiService");
        const mimeType = fileStoragePath.toLowerCase().includes("mp3") ||
          fileStoragePath.toLowerCase().includes("m4a") ||
          fileStoragePath.toLowerCase().includes("wav")
          ? "audio/mpeg"
          : "application/pdf";

        if (mimeType.startsWith("audio/")) {
          fileContext = await transcribeAudio(fileStoragePath, mimeType);
        } else {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          const bucket = admin.storage().bucket();
          const [buffer] = await bucket.file(fileStoragePath).download();
          const result = await model.generateContent([
            "Extraia e resuma o conteúdo deste documento em português:",
            { inlineData: { mimeType, data: buffer.toString("base64") } },
          ]);
          fileContext = result.response.text();
        }
      }

      // Build KB context if available
      let kbContext: string | undefined;
      if (kbPaths.length > 0) {
        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          const bucket = admin.storage().bucket();
          const kbParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
          for (const path of kbPaths.slice(0, 3)) {
            try {
              const [buf] = await bucket.file(path).download();
              kbParts.push({ inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } });
            } catch {
              // Skip files that fail to download
            }
          }
          if (kbParts.length > 0) {
            const result = await model.generateContent([
              "Extraia o conteúdo relevante destes documentos da base de conhecimento do escritório, de forma resumida:",
              ...kbParts,
            ]);
            kbContext = result.response.text();
          }
        } catch (err) {
          logger.warn("Failed to process KB for chat:", err);
        }
      }

      const systemContext = `CONTEXTO DO ATENDIMENTO:
Cliente: ${clientName}
Área jurídica: ${area}
Data: ${new Date().toLocaleDateString("pt-BR")}${kbContext ? "\n\nBASE DE CONHECIMENTO DO ESCRITÓRIO:\n" + kbContext : ""}`;

      const response = await generateChatResponse(
        systemContext,
        history.slice(-20),
        message,
        fileContext,
        settings.prompts.chatPrompt
      );

      // Save messages to Firestore
      const messagesRef = db
        .collection("tenants")
        .doc(tenantId)
        .collection("chatSessions")
        .doc(sessionId)
        .collection("messages");

      await messagesRef.add({
        role: "user",
        content: message,
        fileStoragePath: fileStoragePath ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });

      const assistantMsgRef = await messagesRef.add({
        role: "assistant",
        content: response,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Update session's last message
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("chatSessions")
        .doc(sessionId)
        .update({
          lastMessage: response.slice(0, 100),
          lastMessageAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, response, messageId: assistantMsgRef.id };
    } catch (err) {
      logger.error("sendChatMessage error:", err);
      throw new HttpsError("internal", "Erro ao processar mensagem. Tente novamente.");
    }
  }
);

// ─── CHAT: Generate Report ─────────────────────────────────────────────────────
export const generateChatReportFn = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    const { tenantId } = await validateAuth(request.auth);

    const { sessionId, clientName, area } = request.data as {
      sessionId: string;
      clientName: string;
      area: string;
    };

    logger.info(`Generating chat report for session ${sessionId}`);

    try {
      const settings = await getTenantSettings(tenantId);

      // Fetch all messages
      const messagesSnap = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("chatSessions")
        .doc(sessionId)
        .collection("messages")
        .orderBy("createdAt", "asc")
        .get();

      const messages = messagesSnap.docs.map((d) => ({
        role: d.data().role as "user" | "assistant",
        content: d.data().content as string,
      }));

      const report = await generateChatReport(clientName, area, messages);

      // Generate simple DOCX for the report
      const reportText = `RELATÓRIO DE ATENDIMENTO

Cliente: ${report.clientName}
Área: ${report.area}
Data: ${new Date().toLocaleDateString("pt-BR")}

RESUMO DO CASO:
${report.resumo_caso}

ANÁLISE JURÍDICA PRELIMINAR:
${report.analise_juridica}

TESES IDENTIFICADAS:
${report.teses.map((t, i) => `${i + 1}. ${t}`).join("\n")}

${report.proposta_honorarios ? `PROPOSTA DE HONORÁRIOS:\n${report.proposta_honorarios}\n\n` : ""}PRÓXIMOS PASSOS:
${report.proximos_passos.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;

      const { generatePetitionDocx: generateDocx } = await import("./services/docxService");
      const docxBuffer = await generateDocx(
        reportText,
        `Relatório — ${clientName}`,
        area,
        "Relatório de Atendimento",
        settings.office
      );
      const fileName = `relatorio_atendimento_${sessionId}_${Date.now()}.docx`;
      const { url: reportUrl, path: reportPath } = await uploadDocxToStorage(docxBuffer, tenantId, "chat-reports", fileName);

      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("chatSessions")
        .doc(sessionId)
        .update({
          reportUrl,
          reportPath,
          updatedAt: FieldValue.serverTimestamp(),
        });

      return { success: true, report, docxUrl: reportUrl, reportPath };
    } catch (err) {
      logger.error("generateChatReport error:", err);
      throw new HttpsError("internal", "Erro ao gerar relatório. Tente novamente.");
    }
  }
);

// ─── USERS: Invite User ────────────────────────────────────────────────────────
export const inviteUserFn = onCall(
  { timeoutSeconds: 60 },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);

    // Verify caller is admin
    const callerDoc = await db
      .collection("tenants")
      .doc(tenantId)
      .collection("users")
      .doc(uid)
      .get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Apenas administradores podem convidar usuários.");
    }

    const { email, name, role } = request.data as {
      email: string;
      name: string;
      role: "admin" | "lawyer" | "assistant";
    };

    if (!email || !name || !role) {
      throw new HttpsError("invalid-argument", "email, name e role são obrigatórios.");
    }

    logger.info(`Inviting user ${email} to tenant ${tenantId}`);

    try {
      let userRecord: admin.auth.UserRecord;
      try {
        userRecord = await admin.auth().createUser({
          email,
          displayName: name,
          emailVerified: false,
        });
      } catch (err: unknown) {
        const firebaseErr = err as { code?: string };
        if (firebaseErr.code === "auth/email-already-exists") {
          userRecord = await admin.auth().getUserByEmail(email);
        } else {
          throw err;
        }
      }

      // Create Firestore profile
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("users")
        .doc(userRecord.uid)
        .set({
          uid: userRecord.uid,
          tenantId,
          email,
          displayName: name,
          role,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        });

      // Create userIndex entry
      await db.collection("userIndex").doc(userRecord.uid).set({ tenantId });

      // Generate password reset link (user will set their password via this link)
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      // ── Send branded email via nodemailer (optional SMTP) ──────────────────
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpUser && smtpPass) {
        try {
          const officeDoc = await db
            .collection("tenants")
            .doc(tenantId)
            .collection("settings")
            .doc("office")
            .get();
          const officeName: string = officeDoc.data()?.name ?? "ADVDESK";

          const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
          const smtpPort = parseInt(process.env.SMTP_PORT ?? "587");

          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });

          const roleLabels: Record<string, string> = {
            admin: "Administrador",
            lawyer: "Advogado",
            assistant: "Assistente",
          };

          await transporter.sendMail({
            from: `"${officeName}" <${smtpUser}>`,
            to: email,
            subject: `Você foi convidado para o ADVDESK — ${officeName}`,
            html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#6366F1;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${officeName}</h1>
            <p style="margin:8px 0 0;color:#c7d2fe;font-size:14px;">Sistema de Gestão Jurídica com IA</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Olá, ${name}!</h2>
            <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
              Você foi convidado para acessar o <strong>ADVDESK</strong> — ${officeName} como <strong>${roleLabels[role] ?? role}</strong>.
            </p>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
              Clique no botão abaixo para definir sua senha e acessar o sistema:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td style="background:#6366F1;border-radius:8px;padding:14px 28px;">
                  <a href="${resetLink}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                    Definir minha senha →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">
              Se o botão não funcionar, copie e cole este link no navegador:
            </p>
            <p style="margin:0;word-break:break-all;color:#6366F1;font-size:12px;">${resetLink}</p>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              Este convite foi gerado pelo sistema ADVDESK · ${officeName}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
          });

          logger.info(`Invite email sent to ${email}`);
        } catch (emailErr) {
          // Non-fatal: log and continue — link is still returned to admin
          logger.warn(`Failed to send invite email to ${email}:`, emailErr);
        }
      } else {
        logger.info("SMTP not configured; skipping invite email. Admin can share the reset link manually.");
      }

      return { success: true, uid: userRecord.uid, resetLink };
    } catch (err) {
      logger.error("inviteUser error:", err);
      throw new HttpsError("internal", "Erro ao convidar usuário. Tente novamente.");
    }
  }
);

// ─── USERS: Deactivate User ────────────────────────────────────────────────────
export const deactivateUserFn = onCall(
  { timeoutSeconds: 30 },
  async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);

    // Verify caller is admin
    const callerDoc = await db
      .collection("tenants")
      .doc(tenantId)
      .collection("users")
      .doc(uid)
      .get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Apenas administradores podem desativar usuários.");
    }

    const { userId } = request.data as { userId: string };

    if (!userId) throw new HttpsError("invalid-argument", "userId é obrigatório.");
    if (userId === uid) throw new HttpsError("invalid-argument", "Você não pode desativar sua própria conta.");

    logger.info(`Deactivating user ${userId} in tenant ${tenantId}`);

    try {
      await admin.auth().updateUser(userId, { disabled: true });
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("users")
        .doc(userId)
        .update({ active: false, updatedAt: FieldValue.serverTimestamp() });

      return { success: true };
    } catch (err) {
      logger.error("deactivateUser error:", err);
      throw new HttpsError("internal", "Erro ao desativar usuário. Tente novamente.");
    }
  }
);

// ─── DOWNLOAD: Get fresh signed URL ───────────────────────────────────────────
// Validates tenant ownership via path prefix, then generates a fresh 7-day signed URL.
export const getDownloadUrlFn = onCall(
  { timeoutSeconds: 30 },
  async (request) => {
    const { tenantId } = await validateAuth(request.auth);

    const { path } = request.data as { path: string };
    if (!path) throw new HttpsError("invalid-argument", "path é obrigatório.");

    // Security: ensure the file belongs to this tenant
    if (!path.startsWith(`tenants/${tenantId}/`)) {
      throw new HttpsError("permission-denied", "Acesso negado ao arquivo solicitado.");
    }

    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(path);

      const [exists] = await file.exists();
      if (!exists) throw new HttpsError("not-found", "Arquivo não encontrado.");

      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return { url: signedUrl };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("getDownloadUrl error:", err);
      throw new HttpsError("internal", "Erro ao gerar link de download.");
    }
  }
);

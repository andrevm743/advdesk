"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateUserFn = exports.inviteUserFn = exports.generateChatReportFn = exports.sendChatMessageFn = exports.generateJudgeReportFn = exports.analyzeForJudgeFn = exports.generatePetitionFn = exports.buildPetitionStructureFn = exports.analyzeInitialCaseFn = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const v2_2 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
admin.initializeApp();
(0, v2_1.setGlobalOptions)({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"],
});
const geminiService_1 = require("./services/geminiService");
const claudeService_1 = require("./services/claudeService");
const docxService_1 = require("./services/docxService");
// ─── Rate limit helper ─────────────────────────────────────────────────────────
const db = admin.firestore();
async function checkRateLimit(uid, action, maxPerHour) {
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    const ref = db.collection("rateLimits").doc(`${uid}_${action}`);
    await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        const data = doc.data() ?? { calls: [] };
        const calls = data.calls.filter((t) => t > windowStart);
        if (calls.length >= maxPerHour) {
            throw new https_1.HttpsError("resource-exhausted", `Limite de ${maxPerHour} ${action} por hora atingido. Tente novamente mais tarde.`);
        }
        calls.push(now);
        tx.set(ref, { calls });
    });
}
async function validateAuth(auth) {
    if (!auth?.uid)
        throw new https_1.HttpsError("unauthenticated", "Autenticação necessária");
    const indexDoc = await db.collection("userIndex").doc(auth.uid).get();
    if (!indexDoc.exists)
        throw new https_1.HttpsError("not-found", "Perfil de usuário não encontrado");
    const { tenantId } = indexDoc.data();
    return { uid: auth.uid, tenantId };
}
async function getKnowledgeBasePaths(tenantId) {
    const snap = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("knowledgeBase")
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();
    return snap.docs.map((d) => d.data().storagePath).filter(Boolean);
}
async function getTenantSettings(tenantId) {
    const [promptsDoc, officeDoc] = await Promise.all([
        db.collection("tenants").doc(tenantId).collection("settings").doc("prompts").get(),
        db.collection("tenants").doc(tenantId).collection("settings").doc("office").get(),
    ]);
    return {
        prompts: (promptsDoc.data() ?? {}),
        office: officeDoc.data(),
    };
}
// ─── PETITION: Analyze Initial Case ───────────────────────────────────────────
exports.analyzeInitialCaseFn = (0, https_1.onCall)({ timeoutSeconds: 120, memory: "2GiB" }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "petition_analysis", 20);
    const { petitionId, facts, storagePaths, area, petitionType } = request.data;
    if (!petitionId || !facts || !area || !petitionType) {
        throw new https_1.HttpsError("invalid-argument", "Campos obrigatórios ausentes");
    }
    v2_2.logger.info(`Analyzing case for petition ${petitionId} (tenant: ${tenantId})`);
    try {
        const [kbPaths, settings] = await Promise.all([
            getKnowledgeBasePaths(tenantId),
            getTenantSettings(tenantId),
        ]);
        const result = await (0, geminiService_1.analyzeInitialCase)({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, data: result };
    }
    catch (err) {
        v2_2.logger.error("analyzeInitialCase error:", err);
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("petitions")
            .doc(petitionId)
            .update({ status: "error", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        throw new https_1.HttpsError("internal", "Erro ao analisar o caso. Tente novamente.");
    }
});
// ─── PETITION: Build Structure ─────────────────────────────────────────────────
exports.buildPetitionStructureFn = (0, https_1.onCall)({ timeoutSeconds: 120 }, async (request) => {
    const { tenantId } = await validateAuth(request.auth);
    const { petitionId, facts, area, petitionType, initialAnalysis, strategicAnswers } = request.data;
    v2_2.logger.info(`Building structure for petition ${petitionId}`);
    try {
        const [kbPaths, settings] = await Promise.all([
            getKnowledgeBasePaths(tenantId),
            getTenantSettings(tenantId),
        ]);
        const structure = await (0, geminiService_1.buildPetitionStructure)({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, data: structure };
    }
    catch (err) {
        v2_2.logger.error("buildPetitionStructure error:", err);
        throw new https_1.HttpsError("internal", "Erro ao gerar estrutura. Tente novamente.");
    }
});
// ─── PETITION: Generate Full Petition ─────────────────────────────────────────
exports.generatePetitionFn = (0, https_1.onCall)({ timeoutSeconds: 300, memory: "2GiB" }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "petition_generation", 10);
    const { petitionId, area, petitionType, facts, initialAnalysis, strategicAnswers, structure } = request.data;
    v2_2.logger.info(`Generating petition ${petitionId} (tenant: ${tenantId})`);
    try {
        const settings = await getTenantSettings(tenantId);
        // Generate petition text with Claude
        const petitionText = await (0, claudeService_1.generatePetition)({
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
        const docxBuffer = await (0, docxService_1.generatePetitionDocx)(petitionText, title, area, petitionType, settings.office);
        // Upload DOCX to Storage
        const fileName = `peticao_${petitionId}_${Date.now()}.docx`;
        const docxUrl = await (0, docxService_1.uploadDocxToStorage)(docxBuffer, tenantId, "petitions", fileName);
        // Update Firestore
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("petitions")
            .doc(petitionId)
            .update({
            content: petitionText,
            docxUrl,
            status: "completed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, content: petitionText, docxUrl };
    }
    catch (err) {
        v2_2.logger.error("generatePetition error:", err);
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("petitions")
            .doc(petitionId)
            .update({ status: "error", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        throw new https_1.HttpsError("internal", "Erro ao gerar a petição. Tente novamente.");
    }
});
// ─── JUDGE: Analyze Petition ───────────────────────────────────────────────────
exports.analyzeForJudgeFn = (0, https_1.onCall)({ timeoutSeconds: 120, memory: "2GiB" }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "judge_analysis", 10);
    const { reviewId, description, petitionContent, storagePaths, petitionFileStoragePath } = request.data;
    v2_2.logger.info(`Analyzing petition for judge review ${reviewId}`);
    try {
        const [kbPaths, settings] = await Promise.all([
            getKnowledgeBasePaths(tenantId),
            getTenantSettings(tenantId),
        ]);
        const result = await (0, geminiService_1.analyzeForJudge)({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, data: result };
    }
    catch (err) {
        v2_2.logger.error("analyzeForJudge error:", err);
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("judgeReviews")
            .doc(reviewId)
            .update({ status: "error", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        throw new https_1.HttpsError("internal", "Erro ao analisar a petição. Tente novamente.");
    }
});
// ─── JUDGE: Generate Report ────────────────────────────────────────────────────
exports.generateJudgeReportFn = (0, https_1.onCall)({ timeoutSeconds: 240, memory: "2GiB" }, async (request) => {
    const { tenantId } = await validateAuth(request.auth);
    const { reviewId, petitionContent, description, initialAnalysis, strategicAnswers } = request.data;
    v2_2.logger.info(`Generating judge report for review ${reviewId}`);
    try {
        const settings = await getTenantSettings(tenantId);
        const report = await (0, claudeService_1.generateJudgeReport)({
            petitionContent,
            description,
            initialAnalysis,
            strategicAnswers,
            customSystemPrompt: settings.prompts.judgePrompt,
        });
        // Generate DOCX
        const docxBuffer = await (0, docxService_1.generateJudgeReportDocx)(report, description, settings.office);
        const fileName = `relatorio_${reviewId}_${Date.now()}.docx`;
        const docxUrl = await (0, docxService_1.uploadDocxToStorage)(docxBuffer, tenantId, "judge-reports", fileName);
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("judgeReviews")
            .doc(reviewId)
            .update({
            report,
            docxUrl,
            status: "completed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, report, docxUrl };
    }
    catch (err) {
        v2_2.logger.error("generateJudgeReport error:", err);
        throw new https_1.HttpsError("internal", "Erro ao gerar o relatório. Tente novamente.");
    }
});
// ─── CHAT: Send Message ────────────────────────────────────────────────────────
exports.sendChatMessageFn = (0, https_1.onCall)({ timeoutSeconds: 60 }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    await checkRateLimit(uid, "chat_message", 100);
    const { sessionId, message, history, clientName, area, fileStoragePath } = request.data;
    v2_2.logger.info(`Processing chat message for session ${sessionId}`);
    try {
        const [kbPaths, settings] = await Promise.all([
            getKnowledgeBasePaths(tenantId),
            getTenantSettings(tenantId),
        ]);
        let fileContext;
        // Process attached file with Gemini if present
        if (fileStoragePath) {
            const { transcribeAudio } = await Promise.resolve().then(() => __importStar(require("./services/geminiService")));
            const mimeType = fileStoragePath.toLowerCase().includes("mp3") ||
                fileStoragePath.toLowerCase().includes("m4a") ||
                fileStoragePath.toLowerCase().includes("wav")
                ? "audio/mpeg"
                : "application/pdf";
            if (mimeType.startsWith("audio/")) {
                fileContext = await transcribeAudio(fileStoragePath, mimeType);
            }
            else {
                const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require("@google/generative-ai")));
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
        let kbContext;
        if (kbPaths.length > 0) {
            try {
                const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require("@google/generative-ai")));
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                const bucket = admin.storage().bucket();
                const kbParts = [];
                for (const path of kbPaths.slice(0, 3)) {
                    try {
                        const [buf] = await bucket.file(path).download();
                        kbParts.push({ inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } });
                    }
                    catch {
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
            }
            catch (err) {
                v2_2.logger.warn("Failed to process KB for chat:", err);
            }
        }
        const systemContext = `CONTEXTO DO ATENDIMENTO:
Cliente: ${clientName}
Área jurídica: ${area}
Data: ${new Date().toLocaleDateString("pt-BR")}${kbContext ? "\n\nBASE DE CONHECIMENTO DO ESCRITÓRIO:\n" + kbContext : ""}`;
        const response = await (0, claudeService_1.generateChatResponse)(systemContext, history.slice(-20), message, fileContext, settings.prompts.chatPrompt);
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const assistantMsgRef = await messagesRef.add({
            role: "assistant",
            content: response,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Update session's last message
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("chatSessions")
            .doc(sessionId)
            .update({
            lastMessage: response.slice(0, 100),
            lastMessageAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, response, messageId: assistantMsgRef.id };
    }
    catch (err) {
        v2_2.logger.error("sendChatMessage error:", err);
        throw new https_1.HttpsError("internal", "Erro ao processar mensagem. Tente novamente.");
    }
});
// ─── CHAT: Generate Report ─────────────────────────────────────────────────────
exports.generateChatReportFn = (0, https_1.onCall)({ timeoutSeconds: 120 }, async (request) => {
    const { tenantId } = await validateAuth(request.auth);
    const { sessionId, clientName, area } = request.data;
    v2_2.logger.info(`Generating chat report for session ${sessionId}`);
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
            role: d.data().role,
            content: d.data().content,
        }));
        const report = await (0, geminiService_1.generateChatReport)(clientName, area, messages);
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
        const { generatePetitionDocx: generateDocx } = await Promise.resolve().then(() => __importStar(require("./services/docxService")));
        const docxBuffer = await generateDocx(reportText, `Relatório — ${clientName}`, area, "Relatório de Atendimento", settings.office);
        const fileName = `relatorio_atendimento_${sessionId}_${Date.now()}.docx`;
        const docxUrl = await (0, docxService_1.uploadDocxToStorage)(docxBuffer, tenantId, "chat-reports", fileName);
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("chatSessions")
            .doc(sessionId)
            .update({
            reportUrl: docxUrl,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, report, docxUrl };
    }
    catch (err) {
        v2_2.logger.error("generateChatReport error:", err);
        throw new https_1.HttpsError("internal", "Erro ao gerar relatório. Tente novamente.");
    }
});
// ─── USERS: Invite User ────────────────────────────────────────────────────────
exports.inviteUserFn = (0, https_1.onCall)({ timeoutSeconds: 60 }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    // Verify caller is admin
    const callerDoc = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("users")
        .doc(uid)
        .get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Apenas administradores podem convidar usuários.");
    }
    const { email, name, role } = request.data;
    if (!email || !name || !role) {
        throw new https_1.HttpsError("invalid-argument", "email, name e role são obrigatórios.");
    }
    v2_2.logger.info(`Inviting user ${email} to tenant ${tenantId}`);
    try {
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email,
                displayName: name,
                emailVerified: false,
            });
        }
        catch (err) {
            const firebaseErr = err;
            if (firebaseErr.code === "auth/email-already-exists") {
                userRecord = await admin.auth().getUserByEmail(email);
            }
            else {
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Create userIndex entry
        await db.collection("userIndex").doc(userRecord.uid).set({ tenantId });
        // Generate password reset link (user will set their password via this link)
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        return { success: true, uid: userRecord.uid, resetLink };
    }
    catch (err) {
        v2_2.logger.error("inviteUser error:", err);
        throw new https_1.HttpsError("internal", "Erro ao convidar usuário. Tente novamente.");
    }
});
// ─── USERS: Deactivate User ────────────────────────────────────────────────────
exports.deactivateUserFn = (0, https_1.onCall)({ timeoutSeconds: 30 }, async (request) => {
    const { uid, tenantId } = await validateAuth(request.auth);
    // Verify caller is admin
    const callerDoc = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("users")
        .doc(uid)
        .get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Apenas administradores podem desativar usuários.");
    }
    const { userId } = request.data;
    if (!userId)
        throw new https_1.HttpsError("invalid-argument", "userId é obrigatório.");
    if (userId === uid)
        throw new https_1.HttpsError("invalid-argument", "Você não pode desativar sua própria conta.");
    v2_2.logger.info(`Deactivating user ${userId} in tenant ${tenantId}`);
    try {
        await admin.auth().updateUser(userId, { disabled: true });
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("users")
            .doc(userId)
            .update({ active: false, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { success: true };
    }
    catch (err) {
        v2_2.logger.error("deactivateUser error:", err);
        throw new https_1.HttpsError("internal", "Erro ao desativar usuário. Tente novamente.");
    }
});
//# sourceMappingURL=index.js.map
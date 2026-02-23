import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";

let genAI: GoogleGenerativeAI;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

const FLASH_MODEL = "gemini-2.0-flash";

// ─── Download file from Storage and convert to base64 ─────────────────────────
async function fileToGeminiPart(storagePath: string, mimeType: string): Promise<Part> {
  const bucket = admin.storage().bucket();
  const [fileBuffer] = await bucket.file(storagePath).download();
  return {
    inlineData: {
      mimeType,
      data: fileBuffer.toString("base64"),
    },
  };
}

function getMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return "application/pdf";
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".mp3")) return "audio/mpeg";
  if (lower.includes(".m4a")) return "audio/mp4";
  if (lower.includes(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function isAudio(mimeType: string): boolean {
  return mimeType.startsWith("audio/");
}

// ─── Transcribe audio file via Gemini ─────────────────────────────────────────
export async function transcribeAudio(storagePath: string, mimeType: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: FLASH_MODEL });
  const audioPart = await fileToGeminiPart(storagePath, mimeType);

  const result = await model.generateContent([
    "Transcreva este áudio em português brasileiro com fidelidade. Retorne apenas o texto transcrito, sem comentários adicionais.",
    audioPart,
  ]);

  return result.response.text();
}

// ─── Analyze initial case ──────────────────────────────────────────────────────
interface AnalyzeInitialCaseInput {
  facts: string;
  storagePaths: string[];
  area: string;
  petitionType: string;
  knowledgeBasePaths?: string[];
  customSystemPrompt?: string;
}

interface StrategicQuestion {
  id: number;
  pergunta: string;
  tipo: "text" | "radio" | "checkbox";
  opcoes?: string[];
}

interface InitialAnalysisResult {
  resumo: string;
  teses: string[];
  perguntas: StrategicQuestion[];
}

export async function analyzeInitialCase(input: AnalyzeInitialCaseInput): Promise<InitialAnalysisResult> {
  const model = getGenAI().getGenerativeModel({
    model: FLASH_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const parts: Part[] = [];

  // Process knowledge base docs first (context for the AI)
  if (input.knowledgeBasePaths?.length) {
    for (const path of input.knowledgeBasePaths) {
      const mimeType = getMimeType(path);
      if (!isAudio(mimeType)) {
        try {
          const filePart = await fileToGeminiPart(path, mimeType);
          parts.push(filePart);
        } catch (err) {
          logger.warn(`Failed to process KB file ${path}:`, err);
        }
      }
    }
  }

  // Process case files
  for (const path of input.storagePaths) {
    const mimeType = getMimeType(path);
    if (isAudio(mimeType)) {
      const transcription = await transcribeAudio(path, mimeType);
      parts.push({ text: `[Transcrição de áudio]: ${transcription}` });
    } else {
      try {
        const filePart = await fileToGeminiPart(path, mimeType);
        parts.push(filePart);
      } catch (err) {
        logger.warn(`Failed to process file ${path}:`, err);
      }
    }
  }

  const baseSystemPrompt = `Você é um especialista jurídico brasileiro. Analise os fatos e documentos do caso de ${input.area}, referente a ${input.petitionType}.
Extraia todas as informações relevantes, identifique as teses jurídicas aplicáveis, e gere entre 5 e 8 perguntas estratégicas e objetivas que, quando respondidas pelo advogado, permitirão construir uma petição mais precisa, personalizada e com maior chance de êxito.
As perguntas devem ser formuladas em linguagem simples, direta, e jurídica quando necessário.
Retorne APENAS um JSON válido com esta estrutura: { "resumo": "string com resumo do caso", "teses": ["tese1", "tese2"], "perguntas": [{"id": 1, "pergunta": "string", "tipo": "text|radio|checkbox", "opcoes": ["opcao1"] }] }`;

  const systemPrompt = input.customSystemPrompt
    ? baseSystemPrompt + "\n\nINSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + input.customSystemPrompt
    : baseSystemPrompt;

  const result = await model.generateContent([
    systemPrompt,
    `\n\nFATOS DO CASO:\n${input.facts}`,
    ...parts,
  ]);

  const text = result.response.text();
  return JSON.parse(text) as InitialAnalysisResult;
}

// ─── Build petition structure ──────────────────────────────────────────────────
interface BuildStructureInput {
  facts: string;
  area: string;
  petitionType: string;
  initialAnalysis: InitialAnalysisResult;
  strategicAnswers: Record<string, string | string[]>;
  knowledgeBasePaths?: string[];
  customSystemPrompt?: string;
}

interface PetitionTopic {
  id: string;
  titulo: string;
  resumo: string;
  subtopicos?: string[];
}

interface PetitionStructureResult {
  endereçamento: string;
  partes: Record<string, string>;
  topicos: PetitionTopic[];
  pedidos: string[];
}

export async function buildPetitionStructure(input: BuildStructureInput): Promise<PetitionStructureResult> {
  const model = getGenAI().getGenerativeModel({
    model: FLASH_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const answersText = Object.entries(input.strategicAnswers)
    .map(([k, v]) => `Pergunta ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const kbParts: Part[] = [];
  if (input.knowledgeBasePaths?.length) {
    for (const path of input.knowledgeBasePaths) {
      const mimeType = getMimeType(path);
      if (!isAudio(mimeType)) {
        try {
          const filePart = await fileToGeminiPart(path, mimeType);
          kbParts.push(filePart);
        } catch (err) {
          logger.warn(`Failed to process KB file ${path}:`, err);
        }
      }
    }
  }

  const basePrompt = `Com base nos fatos, documentos analisados e respostas estratégicas abaixo, gere a estrutura completa da petição de ${input.petitionType} na área de ${input.area}.
Inclua: endereçamento, qualificação das partes, todos os tópicos com subtópicos relevantes e um resumo do que cada tópico conterá, e os pedidos finais.
Siga as normas processuais brasileiras.
${input.customSystemPrompt ? "INSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + input.customSystemPrompt + "\n\n" : ""}Retorne APENAS um JSON válido: { "endereçamento": "string", "partes": {"autor": "...", "reu": "..."}, "topicos": [{"id": "1", "titulo": "string", "resumo": "string", "subtopicos": ["..."]}], "pedidos": ["pedido1"] }

RESUMO DO CASO: ${input.initialAnalysis.resumo}
TESES IDENTIFICADAS: ${input.initialAnalysis.teses.join("; ")}
FATOS: ${input.facts}
RESPOSTAS ESTRATÉGICAS:
${answersText}`;

  const result = await model.generateContent([basePrompt, ...kbParts]);
  return JSON.parse(result.response.text()) as PetitionStructureResult;
}

// ─── Analyze petition for judge ────────────────────────────────────────────────
interface AnalyzeForJudgeInput {
  description: string;
  petitionContent: string;
  storagePaths: string[];
  petitionFileStoragePath?: string; // arquivo principal da petição (PDF/DOCX)
  knowledgeBasePaths?: string[];
  customSystemPrompt?: string;
}

interface JudgeInitialAnalysis {
  resumo_peticao: string;
  impressao_inicial: string;
  perguntas: StrategicQuestion[];
}

export async function analyzeForJudge(input: AnalyzeForJudgeInput): Promise<JudgeInitialAnalysis> {
  const model = getGenAI().getGenerativeModel({
    model: FLASH_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const parts: Part[] = [];

  // Se houver arquivo principal da petição, processar primeiro
  if (input.petitionFileStoragePath) {
    const mimeType = getMimeType(input.petitionFileStoragePath);
    try {
      const filePart = await fileToGeminiPart(input.petitionFileStoragePath, mimeType);
      parts.push(filePart);
    } catch (err) {
      logger.warn(`Failed to process petition file ${input.petitionFileStoragePath}:`, err);
    }
  }

  for (const path of input.storagePaths) {
    const mimeType = getMimeType(path);
    if (isAudio(mimeType)) {
      const transcription = await transcribeAudio(path, mimeType);
      parts.push({ text: `[Documento transcrito]: ${transcription}` });
    } else {
      try {
        const filePart = await fileToGeminiPart(path, mimeType);
        parts.push(filePart);
      } catch (err) {
        logger.warn(`Failed to process file ${path}:`, err);
      }
    }
  }

  const petitionSection = input.petitionContent
    ? `\nPETIÇÃO (texto):\n${input.petitionContent}`
    : input.petitionFileStoragePath
    ? "\n[A petição foi enviada como arquivo acima]"
    : "";

  // Append KB docs after the petition files
  if (input.knowledgeBasePaths?.length) {
    for (const path of input.knowledgeBasePaths) {
      const mimeType = getMimeType(path);
      if (!isAudio(mimeType)) {
        try {
          const filePart = await fileToGeminiPart(path, mimeType);
          parts.push(filePart);
        } catch (err) {
          logger.warn(`Failed to process KB file ${path}:`, err);
        }
      }
    }
  }

  const baseSystemPrompt = `Você é um julgador experiente e imparcial do sistema jurídico brasileiro. Analise a petição apresentada e os documentos do caso.
Avalie a coerência lógica, a fundamentação jurídica, a suficiência dos argumentos, as provas apresentadas e os pedidos formulados.
Com base nesta análise, gere entre 4 e 6 perguntas estratégicas que, quando respondidas pelo advogado, permitirão um relatório de análise mais preciso e útil.
Retorne APENAS um JSON válido: { "resumo_peticao": "string", "impressao_inicial": "string", "perguntas": [{"id": 1, "pergunta": "string", "tipo": "text|radio|checkbox", "opcoes": []}] }

DESCRIÇÃO DO CASO: ${input.description}${petitionSection}`;

  const systemPrompt = input.customSystemPrompt
    ? baseSystemPrompt + "\n\nINSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + input.customSystemPrompt
    : baseSystemPrompt;

  const result = await model.generateContent([systemPrompt, ...parts]);
  return JSON.parse(result.response.text()) as JudgeInitialAnalysis;
}

// ─── Generate chat report ──────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatReportResult {
  clientName: string;
  area: string;
  resumo_caso: string;
  analise_juridica: string;
  teses: string[];
  proposta_honorarios?: string;
  proximos_passos: string[];
}

export async function generateChatReport(
  clientName: string,
  area: string,
  messages: ChatMessage[]
): Promise<ChatReportResult> {
  const model = getGenAI().getGenerativeModel({
    model: FLASH_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const conversation = messages
    .map((m) => `${m.role === "user" ? "ADVOGADO" : "IA"}: ${m.content}`)
    .join("\n");

  const prompt = `Gere um relatório estruturado de atendimento jurídico com base na conversa abaixo.
Retorne APENAS um JSON válido: { "clientName": "string", "area": "string", "resumo_caso": "string", "analise_juridica": "string", "teses": ["string"], "proposta_honorarios": "string ou null", "proximos_passos": ["string"] }

CLIENTE: ${clientName}
ÁREA: ${area}
CONVERSA:
${conversation}`;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text()) as ChatReportResult;
}

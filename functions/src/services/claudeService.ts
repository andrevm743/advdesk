import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions/v2";

let client: Anthropic;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ─── Generate full petition text ───────────────────────────────────────────────
interface PetitionTopic {
  id: string;
  titulo: string;
  resumo: string;
  subtopicos?: string[];
}

interface GeneratePetitionInput {
  area: string;
  petitionType: string;
  facts: string;
  initialAnalysisSummary: string;
  teses: string[];
  strategicAnswers: Record<string, string | string[]>;
  structure: {
    endereçamento: string;
    partes: Record<string, string>;
    topicos: PetitionTopic[];
    pedidos: string[];
  };
  customSystemPrompt?: string;
}

export async function generatePetition(input: GeneratePetitionInput): Promise<string> {
  const answersText = Object.entries(input.strategicAnswers)
    .map(([k, v]) => `Pergunta ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const structureText = input.structure.topicos
    .map((t) => `${t.titulo}: ${t.resumo}${t.subtopicos?.length ? "\n  - " + t.subtopicos.join("\n  - ") : ""}`)
    .join("\n\n");

  const pedidosText = input.structure.pedidos.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const baseSystemPrompt = `Você é um advogado especialista em ${input.area} brasileiro, com 20 anos de experiência e excelência em redação de peças processuais.
Redija a petição conforme a estrutura fornecida, usando linguagem jurídica formal, precisa e persuasiva.
Fundamente cada argumento em doutrina e jurisprudência quando pertinente.
Siga o estilo e padrões das melhores petições brasileiras.
A petição deve ser completa, coesa e pronta para protocolo.
Área: ${input.area}. Tipo: ${input.petitionType}.

Use a estrutura de seções com marcações claras como:
## NOME DA SEÇÃO
para cada seção principal da petição.`;

  const systemPrompt = input.customSystemPrompt
    ? baseSystemPrompt + "\n\nINSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + input.customSystemPrompt
    : baseSystemPrompt;

  const userPrompt = `Redija a petição completa com base nas informações abaixo:

ENDEREÇAMENTO: ${input.structure.endereçamento}
PARTES: ${JSON.stringify(input.structure.partes, null, 2)}

FATOS DO CASO:
${input.facts}

RESUMO E TESES:
${input.initialAnalysisSummary}
Teses: ${input.teses.join("; ")}

INFORMAÇÕES COMPLEMENTARES:
${answersText}

ESTRUTURA DA PETIÇÃO:
${structureText}

PEDIDOS:
${pedidosText}

Redija a petição completa, detalhada e pronta para protocolo.`;

  logger.info("Generating petition with Claude Sonnet");

  const message = await getClient().messages.create({
    model: SONNET_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text;
}

// ─── Generate judge report ─────────────────────────────────────────────────────
interface GenerateJudgeReportInput {
  petitionContent: string;
  description: string;
  initialAnalysis: {
    resumo_peticao: string;
    impressao_inicial: string;
  };
  strategicAnswers: Record<string, string | string[]>;
  customSystemPrompt?: string;
}

interface JudgeReport {
  pontos_fortes: string[];
  pontos_fracos: string[];
  lacunas_probatorias: string[];
  riscos: string[];
  probabilidade_exito: "Alta" | "Média" | "Baixa";
  justificativa_probabilidade: string;
  sugestoes: Array<{ titulo: string; texto: string }>;
}

export async function generateJudgeReport(input: GenerateJudgeReportInput): Promise<JudgeReport> {
  const answersText = Object.entries(input.strategicAnswers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const baseSystemPrompt = `Você é um juiz federal brasileiro com 25 anos de experiência. Analise a petição e os documentos apresentados com rigor técnico e imparcialidade total.
Seu relatório deve identificar:
(1) Pontos fortes da petição
(2) Pontos fracos e falhas argumentativas
(3) Lacunas probatórias
(4) Riscos de insucesso e por quê
(5) Sugestões concretas de melhoria com trechos alternativos prontos para uso
(6) Avaliação geral de probabilidade de êxito (Alta/Média/Baixa) com justificativa

Seja direto, técnico e construtivo. O advogado usará este relatório para melhorar sua peça.
Retorne APENAS um JSON válido com esta estrutura:
{
  "pontos_fortes": ["string"],
  "pontos_fracos": ["string"],
  "lacunas_probatorias": ["string"],
  "riscos": ["string"],
  "probabilidade_exito": "Alta|Média|Baixa",
  "justificativa_probabilidade": "string",
  "sugestoes": [{"titulo": "string", "texto": "string"}]
}`;

  const systemPrompt = input.customSystemPrompt
    ? baseSystemPrompt + "\n\nINSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + input.customSystemPrompt
    : baseSystemPrompt;

  const userPrompt = `DESCRIÇÃO DO CASO: ${input.description}

RESUMO DA PETIÇÃO: ${input.initialAnalysis.resumo_peticao}
IMPRESSÃO INICIAL: ${input.initialAnalysis.impressao_inicial}

INFORMAÇÕES COMPLEMENTARES DO ADVOGADO:
${answersText}

PETIÇÃO COMPLETA:
${input.petitionContent}`;

  logger.info("Generating judge report with Claude Sonnet");

  const message = await getClient().messages.create({
    model: SONNET_MODEL,
    max_tokens: 6144,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const text = content.text;
  // Extract JSON from response (Claude might add explanation text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Claude response");
  return JSON.parse(jsonMatch[0]) as JudgeReport;
}

// ─── Chat message response (Haiku) ────────────────────────────────────────────
interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function generateChatResponse(
  systemContext: string,
  history: ChatHistoryMessage[],
  userMessage: string,
  fileContext?: string,
  customSystemPrompt?: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user",
      content: fileContext ? `${userMessage}\n\n[Documento anexado]:\n${fileContext}` : userMessage,
    },
  ];

  const baseSystemPrompt = `Você é um assistente jurídico especializado em escritórios de advocacia brasileiros. Você apoia o atendimento ao cliente e a equipe do escritório nas seguintes tarefas:
(1) Análise jurídica preliminar do caso apresentado
(2) Orientação sobre direitos do cliente conforme a legislação brasileira
(3) Identificação de teses jurídicas aplicáveis
(4) Elaboração de propostas de honorários profissionais
(5) Quebra de objeções para fechamento de contratos
(6) Esclarecimento de dúvidas jurídicas gerais
(7) Preparação de resumos e relatórios de atendimento
Áreas de atuação do escritório: Cível, Trabalhista, Criminal, Previdenciário, Tributário.
Seja profissional, claro e empático. Lembre-se que o usuário está atendendo um cliente real.

${systemContext}`;

  const systemPrompt = customSystemPrompt
    ? baseSystemPrompt + "\n\nINSTRUÇÕES ADICIONAIS DO ESCRITÓRIO:\n" + customSystemPrompt
    : baseSystemPrompt;

  const message = await getClient().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text;
}

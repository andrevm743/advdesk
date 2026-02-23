import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  Footer,
  Header,
  SectionType,
  convertInchesToTwip,
} from "docx";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";

const OFFICE_NAME = process.env.NEXT_PUBLIC_OFFICE_NAME ?? "ADVDESK";

interface OfficeSettings {
  name?: string;
  oabNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
}

// ─── Parse petition text into sections ────────────────────────────────────────
function parsePetitionText(text: string): Array<{ heading: string | null; content: string }> {
  const lines = text.split("\n");
  const sections: Array<{ heading: string | null; content: string }> = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentContent.length > 0 || currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
      }
      currentHeading = line.replace("## ", "").trim();
      currentContent = [];
    } else if (line.startsWith("# ")) {
      if (currentContent.length > 0 || currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
      }
      currentHeading = line.replace("# ", "").trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0 || currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
  }

  return sections;
}

// ─── Create petition DOCX ─────────────────────────────────────────────────────
export async function generatePetitionDocx(
  petitionText: string,
  title: string,
  area: string,
  petitionType: string,
  officeSettings?: OfficeSettings
): Promise<Buffer> {
  const sections = parsePetitionText(petitionText);

  const children: Paragraph[] = [
    // Title
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${area} — ${petitionType}`,
          size: 22,
          color: "666666",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];

  for (const section of sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          text: section.heading.toUpperCase(),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
          border: {
            bottom: { style: "single", size: 6, color: "6366F1" },
          },
        })
      );
    }

    if (section.content) {
      const paragraphs = section.content.split("\n\n").filter(Boolean);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // Check if it's a numbered list item
        if (/^\d+\./.test(trimmed)) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: trimmed, size: 24 })],
              indent: { left: convertInchesToTwip(0.5) },
              spacing: { after: 120 },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: trimmed, size: 24 })],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 200, line: 360 }, // 1.5 line spacing
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              top: convertInchesToTwip(1.18), // ~3cm
              bottom: convertInchesToTwip(1.18),
              left: convertInchesToTwip(1.18),
              right: convertInchesToTwip(1.18),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: officeSettings?.name ?? OFFICE_NAME,
                    bold: true,
                    size: 18,
                    color: "6366F1",
                  }),
                  ...(officeSettings?.oabNumber ? [new TextRun({ text: `   |   OAB: ${officeSettings.oabNumber}`, size: 18, color: "666666" })] : []),
                  new TextRun({ text: "   |   " + petitionType, size: 18, color: "666666" }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Página ", size: 18, color: "666666" }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: "666666",
                  }),
                  new TextRun({ text: " de ", size: 18, color: "666666" }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: "666666",
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 24 }, // 12pt
        },
        heading1: {
          run: { font: "Arial", size: 26, bold: true, color: "1E293B" },
        },
        title: {
          run: { font: "Arial", size: 32, bold: true, color: "0F172A" },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ─── Create judge report DOCX ──────────────────────────────────────────────────
interface JudgeReport {
  pontos_fortes: string[];
  pontos_fracos: string[];
  lacunas_probatorias: string[];
  riscos: string[];
  probabilidade_exito: "Alta" | "Média" | "Baixa";
  justificativa_probabilidade: string;
  sugestoes: Array<{ titulo: string; texto: string }>;
}

export async function generateJudgeReportDocx(
  report: JudgeReport,
  description: string,
  officeSettings?: OfficeSettings
): Promise<Buffer> {
  const probColor =
    report.probabilidade_exito === "Alta"
      ? "10B981"
      : report.probabilidade_exito === "Média"
      ? "F59E0B"
      : "EF4444";

  function sectionHeader(text: string): Paragraph {
    return new Paragraph({
      text: text.toUpperCase(),
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    });
  }

  function bulletItem(text: string): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text: `• ${text}`, size: 24 })],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 120, line: 360 },
      alignment: AlignmentType.JUSTIFIED,
    });
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: "RELATÓRIO DE ANÁLISE CRÍTICA",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Parecer do Agente Julgador — " + (officeSettings?.name ?? OFFICE_NAME), size: 20, color: "666666" }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Probabilidade de Êxito: ", bold: true, size: 26 }),
        new TextRun({
          text: report.probabilidade_exito,
          bold: true,
          size: 26,
          color: probColor,
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: report.justificativa_probabilidade, size: 22, color: "555555" })],
      spacing: { after: 400, line: 360 },
      alignment: AlignmentType.JUSTIFIED,
    }),

    sectionHeader("1. Pontos Fortes"),
    ...report.pontos_fortes.map(bulletItem),

    sectionHeader("2. Pontos Fracos"),
    ...report.pontos_fracos.map(bulletItem),

    sectionHeader("3. Lacunas Probatórias"),
    ...report.lacunas_probatorias.map(bulletItem),

    sectionHeader("4. Riscos de Insucesso"),
    ...report.riscos.map(bulletItem),

    sectionHeader("5. Sugestões de Melhoria"),
    ...report.sugestoes.flatMap((s) => [
      new Paragraph({
        children: [new TextRun({ text: s.titulo, bold: true, size: 24 })],
        spacing: { before: 200, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: s.texto, size: 24, italics: true, color: "334155" })],
        indent: { left: convertInchesToTwip(0.3) },
        spacing: { after: 200, line: 360 },
        alignment: AlignmentType.JUSTIFIED,
      }),
    ]),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.18),
              bottom: convertInchesToTwip(1.18),
              left: convertInchesToTwip(1.18),
              right: convertInchesToTwip(1.18),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: officeSettings?.name ?? OFFICE_NAME, bold: true, size: 18, color: "6366F1" }),
                  new TextRun({ text: "   |   Relatório de Análise", size: 18, color: "666666" }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Página ", size: 18, color: "888888" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888" }),
                  new TextRun({ text: " de ", size: 18, color: "888888" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "888888" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
    styles: {
      default: {
        document: { run: { font: "Arial", size: 24 } },
        heading1: { run: { font: "Arial", size: 26, bold: true, color: "1E293B" } },
        title: { run: { font: "Arial", size: 32, bold: true, color: "0F172A" } },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ─── Upload DOCX to Firebase Storage ──────────────────────────────────────────
export async function uploadDocxToStorage(
  buffer: Buffer,
  tenantId: string,
  folder: string,
  fileName: string
): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = `tenants/${tenantId}/${folder}/${fileName}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.info(`DOCX uploaded to ${path}`);
  return signedUrl;
}

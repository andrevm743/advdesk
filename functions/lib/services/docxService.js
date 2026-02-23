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
exports.generatePetitionDocx = generatePetitionDocx;
exports.generateJudgeReportDocx = generateJudgeReportDocx;
exports.uploadDocxToStorage = uploadDocxToStorage;
const docx_1 = require("docx");
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const OFFICE_NAME = process.env.NEXT_PUBLIC_OFFICE_NAME ?? "ADVDESK";
// ─── Parse petition text into sections ────────────────────────────────────────
function parsePetitionText(text) {
    const lines = text.split("\n");
    const sections = [];
    let currentHeading = null;
    let currentContent = [];
    for (const line of lines) {
        if (line.startsWith("## ")) {
            if (currentContent.length > 0 || currentHeading) {
                sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
            }
            currentHeading = line.replace("## ", "").trim();
            currentContent = [];
        }
        else if (line.startsWith("# ")) {
            if (currentContent.length > 0 || currentHeading) {
                sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
            }
            currentHeading = line.replace("# ", "").trim();
            currentContent = [];
        }
        else {
            currentContent.push(line);
        }
    }
    if (currentContent.length > 0 || currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
    }
    return sections;
}
// ─── Create petition DOCX ─────────────────────────────────────────────────────
async function generatePetitionDocx(petitionText, title, area, petitionType, officeSettings) {
    const sections = parsePetitionText(petitionText);
    const children = [
        // Title
        new docx_1.Paragraph({
            text: title,
            heading: docx_1.HeadingLevel.TITLE,
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 200 },
        }),
        new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text: `${area} — ${petitionType}`,
                    size: 22,
                    color: "666666",
                }),
            ],
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 400 },
        }),
    ];
    for (const section of sections) {
        if (section.heading) {
            children.push(new docx_1.Paragraph({
                text: section.heading.toUpperCase(),
                heading: docx_1.HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
                border: {
                    bottom: { style: "single", size: 6, color: "6366F1" },
                },
            }));
        }
        if (section.content) {
            const paragraphs = section.content.split("\n\n").filter(Boolean);
            for (const para of paragraphs) {
                const trimmed = para.trim();
                if (!trimmed)
                    continue;
                // Check if it's a numbered list item
                if (/^\d+\./.test(trimmed)) {
                    children.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: trimmed, size: 24 })],
                        indent: { left: (0, docx_1.convertInchesToTwip)(0.5) },
                        spacing: { after: 120 },
                    }));
                }
                else {
                    children.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: trimmed, size: 24 })],
                        alignment: docx_1.AlignmentType.JUSTIFIED,
                        spacing: { after: 200, line: 360 }, // 1.5 line spacing
                    }));
                }
            }
        }
    }
    const doc = new docx_1.Document({
        sections: [
            {
                properties: {
                    type: docx_1.SectionType.CONTINUOUS,
                    page: {
                        margin: {
                            top: (0, docx_1.convertInchesToTwip)(1.18), // ~3cm
                            bottom: (0, docx_1.convertInchesToTwip)(1.18),
                            left: (0, docx_1.convertInchesToTwip)(1.18),
                            right: (0, docx_1.convertInchesToTwip)(1.18),
                        },
                    },
                },
                headers: {
                    default: new docx_1.Header({
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: officeSettings?.name ?? OFFICE_NAME,
                                        bold: true,
                                        size: 18,
                                        color: "6366F1",
                                    }),
                                    ...(officeSettings?.oabNumber ? [new docx_1.TextRun({ text: `   |   OAB: ${officeSettings.oabNumber}`, size: 18, color: "666666" })] : []),
                                    new docx_1.TextRun({ text: "   |   " + petitionType, size: 18, color: "666666" }),
                                ],
                                alignment: docx_1.AlignmentType.RIGHT,
                            }),
                        ],
                    }),
                },
                footers: {
                    default: new docx_1.Footer({
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({ text: "Página ", size: 18, color: "666666" }),
                                    new docx_1.TextRun({
                                        children: [docx_1.PageNumber.CURRENT],
                                        size: 18,
                                        color: "666666",
                                    }),
                                    new docx_1.TextRun({ text: " de ", size: 18, color: "666666" }),
                                    new docx_1.TextRun({
                                        children: [docx_1.PageNumber.TOTAL_PAGES],
                                        size: 18,
                                        color: "666666",
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
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
    const buffer = await docx_1.Packer.toBuffer(doc);
    return Buffer.from(buffer);
}
async function generateJudgeReportDocx(report, description, officeSettings) {
    const probColor = report.probabilidade_exito === "Alta"
        ? "10B981"
        : report.probabilidade_exito === "Média"
            ? "F59E0B"
            : "EF4444";
    function sectionHeader(text) {
        return new docx_1.Paragraph({
            text: text.toUpperCase(),
            heading: docx_1.HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
        });
    }
    function bulletItem(text) {
        return new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: `• ${text}`, size: 24 })],
            indent: { left: (0, docx_1.convertInchesToTwip)(0.3) },
            spacing: { after: 120, line: 360 },
            alignment: docx_1.AlignmentType.JUSTIFIED,
        });
    }
    const children = [
        new docx_1.Paragraph({
            text: "RELATÓRIO DE ANÁLISE CRÍTICA",
            heading: docx_1.HeadingLevel.TITLE,
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 100 },
        }),
        new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
                new docx_1.TextRun({ text: "Parecer do Agente Julgador — " + (officeSettings?.name ?? OFFICE_NAME), size: 20, color: "666666" }),
            ],
        }),
        new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({ text: "Probabilidade de Êxito: ", bold: true, size: 26 }),
                new docx_1.TextRun({
                    text: report.probabilidade_exito,
                    bold: true,
                    size: 26,
                    color: probColor,
                }),
            ],
            spacing: { after: 100 },
        }),
        new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: report.justificativa_probabilidade, size: 22, color: "555555" })],
            spacing: { after: 400, line: 360 },
            alignment: docx_1.AlignmentType.JUSTIFIED,
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
            new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text: s.titulo, bold: true, size: 24 })],
                spacing: { before: 200, after: 100 },
            }),
            new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text: s.texto, size: 24, italics: true, color: "334155" })],
                indent: { left: (0, docx_1.convertInchesToTwip)(0.3) },
                spacing: { after: 200, line: 360 },
                alignment: docx_1.AlignmentType.JUSTIFIED,
            }),
        ]),
    ];
    const doc = new docx_1.Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: (0, docx_1.convertInchesToTwip)(1.18),
                            bottom: (0, docx_1.convertInchesToTwip)(1.18),
                            left: (0, docx_1.convertInchesToTwip)(1.18),
                            right: (0, docx_1.convertInchesToTwip)(1.18),
                        },
                    },
                },
                headers: {
                    default: new docx_1.Header({
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({ text: officeSettings?.name ?? OFFICE_NAME, bold: true, size: 18, color: "6366F1" }),
                                    new docx_1.TextRun({ text: "   |   Relatório de Análise", size: 18, color: "666666" }),
                                ],
                                alignment: docx_1.AlignmentType.RIGHT,
                            }),
                        ],
                    }),
                },
                footers: {
                    default: new docx_1.Footer({
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({ text: "Página ", size: 18, color: "888888" }),
                                    new docx_1.TextRun({ children: [docx_1.PageNumber.CURRENT], size: 18, color: "888888" }),
                                    new docx_1.TextRun({ text: " de ", size: 18, color: "888888" }),
                                    new docx_1.TextRun({ children: [docx_1.PageNumber.TOTAL_PAGES], size: 18, color: "888888" }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
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
    const buffer = await docx_1.Packer.toBuffer(doc);
    return Buffer.from(buffer);
}
// ─── Upload DOCX to Firebase Storage ──────────────────────────────────────────
async function uploadDocxToStorage(buffer, tenantId, folder, fileName) {
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
    v2_1.logger.info(`DOCX uploaded to ${path}`);
    return signedUrl;
}
//# sourceMappingURL=docxService.js.map
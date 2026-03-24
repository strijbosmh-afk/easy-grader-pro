import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
} from "docx";
import { saveAs } from "file-saver";
// @ts-ignore
import JSZip from "jszip";

interface ScoreData {
  final_score: number | null;
  ai_suggested_score: number | null;
  opmerkingen: string | null;
  ai_motivatie: string | null;
  criterium_id: string;
}

interface CriteriumData {
  id: string;
  criterium_naam: string;
  max_score: number;
}

function cleanMarkdown(text: string): string {
  return text
    // Remove score patterns like "(25/30):" or "(8/10)"
    .replace(/\(\d+\/\d+\)\s*:?/g, "")
    // Remove bold/italic markdown markers
    .replace(/\*{1,3}/g, "")
    // Remove heading markers
    .replace(/^#{1,4}\s*/gm, "")
    // Remove bullet markers at start of lines
    .replace(/^[-•]\s*/gm, "")
    // Clean up extra whitespace
    .replace(/  +/g, " ")
    .replace(/^ +/gm, "")
    .trim();
}

function getScore(scores: ScoreData[], criteriumId: string): number {
  const sc = scores.find((s) => s.criterium_id === criteriumId);
  return sc?.final_score ?? sc?.ai_suggested_score ?? 0;
}

function getMotivatie(scores: ScoreData[], criteriumId: string): string {
  const sc = scores.find((s) => s.criterium_id === criteriumId);
  return sc?.opmerkingen || sc?.ai_motivatie || "";
}

function parseVerslagSections(verslag: string | null): { sterktes: string[]; zwaktes: string[]; overig: string[] } {
  const sterktes: string[] = [];
  const zwaktes: string[] = [];
  const overig: string[] = [];

  if (!verslag) return { sterktes, zwaktes, overig };

  let currentSection = "overig";
  for (const line of verslag.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("sterkte") || lower.includes("sterk punt")) {
      currentSection = "sterktes";
      continue;
    }
    if (lower.includes("zwakte") || lower.includes("werkpunt") || lower.includes("aandachtspunt") || lower.includes("verbeterpunt")) {
      currentSection = "zwaktes";
      continue;
    }
    if ((line.startsWith("## ") || (line.startsWith("**") && line.endsWith("**"))) && currentSection !== "sterktes" && currentSection !== "zwaktes") {
      currentSection = "overig";
    }
    if (line.startsWith("## ") || (line.startsWith("**") && line.endsWith("**"))) {
      continue;
    }
    const cleaned = cleanMarkdown(line);
    if (!cleaned) continue;

    if (currentSection === "sterktes") sterktes.push(cleaned);
    else if (currentSection === "zwaktes") zwaktes.push(cleaned);
    else overig.push(cleaned);
  }
  return { sterktes, zwaktes, overig };
}

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function buildStudentDocument(
  student: any,
  project: any,
  criteria: CriteriumData[],
  scores: ScoreData[]
): Paragraph[] {
  const children: Paragraph[] = [];
  const { sterktes, zwaktes } = parseVerslagSections(student.verslag);

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Beoordelingsverslag", bold: true, size: 32, font: "Arial" })],
    })
  );
  children.push(new Paragraph({ children: [] }));

  // Student info
  children.push(new Paragraph({ children: [new TextRun({ text: "Student: ", bold: true, font: "Arial", size: 24 }), new TextRun({ text: student.naam, font: "Arial", size: 24 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Project: ", bold: true, font: "Arial", size: 24 }), new TextRun({ text: project.naam, font: "Arial", size: 24 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Datum: ", bold: true, font: "Arial", size: 24 }), new TextRun({ text: new Date().toLocaleDateString("nl-BE"), font: "Arial", size: 24 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Beoordelingsniveau: ", bold: true, font: "Arial", size: 24 }), new TextRun({ text: project.beoordelingsniveau || "streng", font: "Arial", size: 24 })] }));
  children.push(new Paragraph({ children: [] }));

  // Score table
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Scoreoverzicht", bold: true, size: 28, font: "Arial" })],
    })
  );
  children.push(new Paragraph({ children: [] }));

  // Table header
  const headerRow = new TableRow({
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: 5000, type: WidthType.DXA },
        shading: { fill: "2B4570", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: "Criterium", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: "2B4570", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Score", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: "2B4570", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Max", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1360, type: WidthType.DXA },
        shading: { fill: "2B4570", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "%", bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })],
      }),
    ],
  });

  let totalScore = 0;
  let totalMax = 0;
  const dataRows = criteria.map((c, i) => {
    const score = getScore(scores, c.id);
    const motivatie = getMotivatie(scores, c.id);
    totalScore += score;
    totalMax += Number(c.max_score);
    const pct = c.max_score > 0 ? Math.round((score / Number(c.max_score)) * 100) : 0;
    const rowFill = i % 2 === 0 ? "F7F9FC" : "FFFFFF";

    const cellChildren: Paragraph[] = [
      new Paragraph({ children: [new TextRun({ text: c.criterium_naam, bold: true, font: "Arial", size: 20 })] }),
    ];
    if (motivatie) {
      cellChildren.push(
        new Paragraph({ children: [new TextRun({ text: cleanMarkdown(motivatie), font: "Arial", size: 18, italics: true, color: "666666" })] })
      );
    }

    return new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: 5000, type: WidthType.DXA },
          shading: { fill: rowFill, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: cellChildren,
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 1500, type: WidthType.DXA },
          shading: { fill: rowFill, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: score.toString(), font: "Arial", size: 20 })] })],
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 1500, type: WidthType.DXA },
          shading: { fill: rowFill, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.max_score.toString(), font: "Arial", size: 20 })] })],
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 1360, type: WidthType.DXA },
          shading: { fill: rowFill, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${pct}%`, font: "Arial", size: 20 })] })],
        }),
      ],
    });
  });

  // Total row
  const totalPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const totalRow = new TableRow({
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: 5000, type: WidthType.DXA },
        shading: { fill: "E8EDF3", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: "TOTAAL", bold: true, font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: "E8EDF3", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: totalScore.toString(), bold: true, font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1500, type: WidthType.DXA },
        shading: { fill: "E8EDF3", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: totalMax.toString(), bold: true, font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 1360, type: WidthType.DXA },
        shading: { fill: "E8EDF3", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${totalPct}%`, bold: true, font: "Arial", size: 20 })] })],
      }),
    ],
  });

  const scoreTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [5000, 1500, 1500, 1360],
    rows: [headerRow, ...dataRows, totalRow],
  });

  children.push(scoreTable as unknown as Paragraph);
  children.push(new Paragraph({ children: [] }));

  // Sterktes
  if (sterktes.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Sterktes", bold: true, size: 28, font: "Arial", color: "2E7D32" })],
      })
    );
    for (const s of sterktes) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: s, font: "Arial", size: 22 })],
        })
      );
    }
    children.push(new Paragraph({ children: [] }));
  }

  // Zwaktes
  if (zwaktes.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Werkpunten", bold: true, size: 28, font: "Arial", color: "C62828" })],
      })
    );
    for (const z of zwaktes) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: z, font: "Arial", size: 22 })],
        })
      );
    }
    children.push(new Paragraph({ children: [] }));
  }

  // Analyse (was AI feedback - rename to remove AI reference)
  if (student.ai_feedback) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Analyse", bold: true, size: 28, font: "Arial" })],
      })
    );
    const cleanedFeedback = cleanMarkdown(student.ai_feedback);
    for (const line of cleanedFeedback.split("\n")) {
      if (line.trim()) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: line.trim(), font: "Arial", size: 22 })] })
        );
      }
    }
    children.push(new Paragraph({ children: [] }));
  }

  // Docent feedback
  if (student.docent_feedback) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Docent Feedback", bold: true, size: 28, font: "Arial" })],
      })
    );
    children.push(
      new Paragraph({ children: [new TextRun({ text: student.docent_feedback, font: "Arial", size: 22 })] })
    );
  }

  return children;
}

export async function exportStudentToWord(
  student: any,
  project: any,
  criteria: CriteriumData[],
  scores: ScoreData[]
) {
  const content = buildStudentDocument(student, project, criteria, scores);
  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: content,
    }],
  });

  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `${student.naam}_verslag.docx`);
}

export async function exportStudentsBatchToWord(
  students: any[],
  project: any,
  criteria: CriteriumData[],
  allScores: Map<string, ScoreData[]>
) {
  if (students.length === 1) {
    return exportStudentToWord(students[0], project, criteria, allScores.get(students[0].id) || []);
  }

  const zip = new JSZip();
  for (const student of students) {
    const scores = allScores.get(student.id) || [];
    const content = buildStudentDocument(student, project, criteria, scores);
    const doc = new Document({
      sections: [{
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children: content,
      }],
    });
    const blob = await Packer.toBlob(doc);
    zip.file(`${student.naam}_verslag.docx`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${project.naam}_verslagen.zip`);
}

/**
 * Extract a student name from a filename.
 * Handles patterns like:
 * - "Emma Ghijs - verslag.pdf" → "Emma Ghijs"
 * - "Emma_Ghijs_verslag.pdf" → "Emma Ghijs"
 * - "verslag_Emma Ghijs.pdf" → "Emma Ghijs" (less reliable)
 */
export function extractStudentName(filename: string): string {
  // Remove extension
  let name = filename.replace(/\.pdf$/i, "").trim();

  // Pattern 1: "Name - something" or "Name – something"
  if (name.includes(" - ") || name.includes(" – ")) {
    const parts = name.split(/\s[-–]\s/);
    // Take the part that looks most like a name (has capital letters, no numbers)
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && /^[A-ZÀ-Ž]/.test(trimmed) && !/\d/.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
        return trimmed;
      }
    }
    return parts[0].trim();
  }

  // Pattern 2: underscores as separators — "Emma_Ghijs_verslag" or "verslag_Emma_Ghijs"
  if (name.includes("_")) {
    // Try to find consecutive capitalized words
    const words = name.split("_");
    const nameWords: string[] = [];
    let foundName = false;
    for (const w of words) {
      if (/^[A-ZÀ-Ž][a-zà-ž]+$/.test(w)) {
        nameWords.push(w);
        foundName = true;
      } else if (foundName && nameWords.length >= 2) {
        break;
      } else if (foundName) {
        break;
      }
    }
    if (nameWords.length >= 2) {
      return nameWords.join(" ");
    }
    // Fallback: replace underscores with spaces
    return name.replace(/_/g, " ");
  }

  return name;
}

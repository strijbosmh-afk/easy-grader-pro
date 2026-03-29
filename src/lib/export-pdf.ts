import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const COLORS = {
  primary: [27, 79, 114] as [number, number, number],    // #1B4F72
  green: [39, 174, 96] as [number, number, number],
  orange: [243, 156, 18] as [number, number, number],
  red: [231, 76, 60] as [number, number, number],
  gray: [149, 165, 166] as [number, number, number],
  lightGray: [236, 240, 241] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function getScoreColor(score: number, max: number): [number, number, number] {
  if (max === 0) return COLORS.gray;
  const pct = score / max;
  if (pct >= 0.7) return COLORS.green;
  if (pct >= 0.5) return COLORS.orange;
  return COLORS.red;
}

function confidenceLabel(c: string | null | undefined): string {
  if (c === "high") return "Hoog";
  if (c === "medium") return "Gemiddeld";
  if (c === "low") return "Laag";
  return "–";
}

export function generateStudentReport(
  student: any,
  project: any,
  criteria: any[],
  scores: any[]
): jsPDF {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Header ──
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 42, "F");

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(22);
  doc.setFont(undefined!, "bold");
  doc.text("Beoordelingsrapport", margin, 18);

  doc.setFontSize(11);
  doc.setFont(undefined!, "normal");
  doc.text(`${project.naam}`, margin, 27);
  doc.text(`${student.naam}`, margin, 34);

  const dateStr = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.text(`Datum: ${dateStr}`, pageW - margin, 27, { align: "right" });

  if (project.education_context) {
    doc.setFontSize(8);
    doc.setTextColor(200, 220, 240);
    const ctxLines = doc.splitTextToSize(project.education_context, contentW * 0.5);
    doc.text(ctxLines.slice(0, 2), pageW - margin, 33, { align: "right" });
  }

  y = 52;
  doc.setTextColor(0);

  // ── Score Summary Table ──
  const subCriteria = criteria.filter((c) => !c.is_eindscore);
  const eindscoreCrit = criteria.find((c) => c.is_eindscore);
  const allCriteria = [...subCriteria, ...(eindscoreCrit ? [eindscoreCrit] : [])];

  const tableData = allCriteria.map((c) => {
    const sc = scores.find((s: any) => s.criterium_id === c.id);
    const score = sc?.final_score ?? sc?.ai_suggested_score ?? null;
    const max = Number(c.max_score);
    const conf = sc?.ai_confidence || "";
    return {
      naam: c.criterium_naam,
      score: score !== null ? Number(score) : null,
      max,
      confidence: conf,
      isEindscore: c.is_eindscore,
    };
  });

  const bodyRows = tableData.map((r) => [
    r.naam,
    r.score !== null ? r.score.toString() : "–",
    r.max.toString(),
    confidenceLabel(r.confidence),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Criterium", "Score", "Max", "Vertrouwen"]],
    body: bodyRows,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 10,
    },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: contentW * 0.5 },
      1: { halign: "center", cellWidth: contentW * 0.15 },
      2: { halign: "center", cellWidth: contentW * 0.15 },
      3: { halign: "center", cellWidth: contentW * 0.2 },
    },
    didParseCell: (data: any) => {
      if (data.section === "body") {
        const rowData = tableData[data.row.index];
        if (rowData?.isEindscore) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = COLORS.lightGray;
        }
        if (data.column.index === 1 && rowData?.score !== null) {
          data.cell.styles.textColor = getScoreColor(rowData.score, rowData.max);
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // ── Detailed Feedback ──
  const criteriaWithFeedback = allCriteria.filter((c) => {
    const sc = scores.find((s: any) => s.criterium_id === c.id);
    return sc?.ai_detail_feedback || sc?.ai_motivatie;
  });

  if (criteriaWithFeedback.length > 0) {
    doc.setFontSize(14);
    doc.setFont(undefined!, "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Gedetailleerde Feedback", margin, y);
    y += 8;

    for (const c of criteriaWithFeedback) {
      const sc = scores.find((s: any) => s.criterium_id === c.id);
      const score = sc?.final_score ?? sc?.ai_suggested_score ?? null;
      const feedback = sc?.ai_detail_feedback || sc?.ai_motivatie || "";

      if (y > 250) { doc.addPage(); y = margin; }

      // Criterion name
      doc.setFontSize(11);
      doc.setFont(undefined!, "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(c.criterium_naam, margin, y);

      // Score + confidence badge
      const scoreText = score !== null ? `${score} / ${c.max_score}` : "–";
      const confText = confidenceLabel(sc?.ai_confidence);
      doc.setFontSize(9);
      doc.setFont(undefined!, "normal");
      doc.setTextColor(...COLORS.gray);
      doc.text(`${scoreText}  •  Vertrouwen: ${confText}`, margin, y + 5);
      y += 10;

      // Feedback text
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(feedback, contentW);
      for (const line of lines) {
        if (y > 278) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 4.5;
      }
      y += 6;
    }
  }

  // ── AI Disclaimer Footer ──
  const footerText = "Dit rapport is gegenereerd met AI-ondersteuning (GradeAssist). De scores en feedback zijn gebaseerd op automatische analyse en dienen als ondersteuning voor de docent, niet als definitief oordeel.";
  
  // Always put footer on last page
  if (y > 260) { doc.addPage(); y = margin; }
  y = Math.max(y, 268);
  
  doc.setDrawColor(...COLORS.lightGray);
  doc.line(margin, y, pageW - margin, y);
  y += 4;
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gray);
  const footerLines = doc.splitTextToSize(footerText, contentW);
  doc.text(footerLines, margin, y);

  return doc;
}

export function downloadStudentReport(
  student: any,
  project: any,
  criteria: any[],
  scores: any[]
) {
  const doc = generateStudentReport(student, project, criteria, scores);
  const safeName = student.naam.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim();
  doc.save(`${safeName}-beoordelingsrapport.pdf`);
}

export async function downloadBatchReportsZip(
  students: any[],
  project: any,
  criteria: any[],
  onProgress?: (current: number, total: number, name: string) => void
): Promise<void> {
  const zip = new JSZip();
  const today = new Date().toISOString().slice(0, 10);
  const eligible = students.filter((s) => {
    const sc = s.student_scores || [];
    return sc.some((ss: any) => ss.final_score !== null || ss.ai_suggested_score !== null);
  });

  if (eligible.length === 0) {
    throw new Error("Geen studenten met scores gevonden");
  }

  for (let i = 0; i < eligible.length; i++) {
    const student = eligible[i];
    onProgress?.(i + 1, eligible.length, student.naam);

    const doc = generateStudentReport(student, project, criteria, student.student_scores || []);
    const pdfBlob = doc.output("arraybuffer");
    const safeName = student.naam.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim();
    zip.file(`${safeName}-beoordelingsrapport.pdf`, pdfBlob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const projectName = project.naam.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim();
  saveAs(zipBlob, `${projectName}-rapporten-${today}.zip`);
}

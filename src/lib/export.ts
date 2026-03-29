import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export function exportProjectToExcel(project: any, students: any[], criteria: any[]) {
  const subCriteria = criteria.filter((c) => !c.is_eindscore);
  const eindscoreCriterium = criteria.find((c) => c.is_eindscore);
  const allCriteria = [...subCriteria, ...(eindscoreCriterium ? [eindscoreCriterium] : [])];
  const today = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Overzicht ──
  const ovHeader = ["Student", ...allCriteria.map(c => c.criterium_naam), "Eindscore", "AI Confidence"];
  const ovRows = students.map(s => {
    const scores = allCriteria.map(c => {
      const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
      return sc?.final_score ?? sc?.ai_suggested_score ?? "";
    });
    const total = scores.reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);
    // Lowest confidence among criteria
    const confidences = allCriteria.map(c => {
      const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
      return sc?.ai_confidence || "";
    });
    const hasLow = confidences.includes("low");
    const confLabel = hasLow ? "low" : confidences.includes("medium") ? "medium" : "high";
    return [s.naam, ...scores, total, confLabel];
  });

  const ovData = [
    [project.naam, `Export: ${today}`],
    [],
    ovHeader,
    ...ovRows,
  ];
  const wsOv = XLSX.utils.aoa_to_sheet(ovData);

  // Styling: column widths
  const ovColCount = ovHeader.length;
  wsOv["!cols"] = Array.from({ length: ovColCount }, (_, i) => ({ wch: i === 0 ? 25 : 16 }));

  XLSX.utils.book_append_sheet(wb, wsOv, "Overzicht");

  // ── Sheet 2: Feedback ──
  const fbHeader = ["Student", "Criterium", "Score", "Max", "Confidence", "Feedback"];
  const fbRows: any[][] = [];
  students.forEach(s => {
    allCriteria.forEach(c => {
      const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
      fbRows.push([
        s.naam,
        c.criterium_naam,
        sc?.final_score ?? sc?.ai_suggested_score ?? "",
        c.max_score,
        sc?.ai_confidence || "",
        sc?.ai_detail_feedback || sc?.ai_motivatie || "",
      ]);
    });
  });
  const wsFb = XLSX.utils.aoa_to_sheet([fbHeader, ...fbRows]);
  wsFb["!cols"] = [
    { wch: 25 }, { wch: 25 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFb, "Feedback");

  // ── Sheet 3: Statistieken ──
  const statHeader = ["Criterium", "Gemiddelde", "Mediaan", "Min", "Max", "Standaardafwijking"];
  const statRows = allCriteria.map(c => {
    const vals = students
      .map(s => {
        const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
        return sc?.final_score ?? sc?.ai_suggested_score ?? null;
      })
      .filter((v): v is number => v !== null && v !== "")
      .map(Number);

    if (vals.length === 0) return [c.criterium_naam, "", "", "", "", ""];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const stddev = Math.sqrt(vals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / vals.length);
    return [c.criterium_naam, +avg.toFixed(2), +median.toFixed(2), min, max, +stddev.toFixed(2)];
  });

  // Overall distribution row
  const allScores = students.flatMap(s =>
    allCriteria.map(c => {
      const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
      return sc?.final_score ?? sc?.ai_suggested_score ?? null;
    }).filter((v): v is number => v !== null && v !== "").map(Number)
  );
  let overallRow: any[] = ["Alle scores"];
  if (allScores.length > 0) {
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const sorted = [...allScores].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const stddev = Math.sqrt(allScores.reduce((sum, v) => sum + (v - avg) ** 2, 0) / allScores.length);
    overallRow = ["Alle scores", +avg.toFixed(2), +median.toFixed(2), sorted[0], sorted[sorted.length - 1], +stddev.toFixed(2)];
  }

  const wsStat = XLSX.utils.aoa_to_sheet([statHeader, ...statRows, [], overallRow]);
  wsStat["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsStat, "Statistieken");

  // Write & download
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const filename = `${project.naam.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim()}-resultaten-${today}.xlsx`;
  saveAs(new Blob([buf], { type: "application/octet-stream" }), filename);
}

export function exportStudentToPdf(
  student: any,
  project: any,
  criteria: any[],
  scores: any[],
  getScore: (criteriumId: string) => { final_score: string; opmerkingen: string },
  docentFeedback?: string
) {
  const doc = new jsPDF();
  const margin = 20;
  let y = margin;

  doc.setFontSize(18);
  doc.text("Scorekaart", margin, y);
  y += 10;

  doc.setFontSize(12);
  doc.text(`Student: ${student.naam}`, margin, y);
  y += 7;
  doc.text(`Project: ${project.naam}`, margin, y);
  y += 7;
  doc.text(`Datum: ${new Date().toLocaleDateString("nl-NL")}`, margin, y);
  y += 12;

  // Table header
  doc.setFontSize(10);
  doc.setFont(undefined!, "bold");
  doc.text("Criterium", margin, y);
  doc.text("Score", 130, y);
  doc.text("Max", 155, y);
  doc.line(margin, y + 2, 190, y + 2);
  y += 8;

  doc.setFont(undefined!, "normal");
  let totalFinal = 0;
  let totalMax = 0;

  criteria.forEach((c) => {
    const vals = getScore(c.id);
    const score = parseFloat(vals.final_score) || 0;
    totalFinal += score;
    totalMax += Number(c.max_score);

    doc.text(c.criterium_naam, margin, y);
    doc.text(score.toString(), 130, y);
    doc.text(c.max_score.toString(), 155, y);
    y += 6;

    if (vals.opmerkingen) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      const lines = doc.splitTextToSize(`${vals.opmerkingen}`, 170);
      doc.text(lines, margin + 5, y);
      y += lines.length * 4 + 2;
      doc.setFontSize(10);
      doc.setTextColor(0);
    }

    if (y > 270) {
      doc.addPage();
      y = margin;
    }
  });

  doc.line(margin, y, 190, y);
  y += 6;
  doc.setFont(undefined!, "bold");
  doc.text("Totaal", margin, y);
  doc.text(totalFinal.toString(), 130, y);
  doc.text(totalMax.toString(), 155, y);
  y += 12;

  if (docentFeedback) {
    if (y > 250) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setFont(undefined!, "bold");
    doc.text("Docent Feedback", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined!, "normal");
    const feedbackLines = doc.splitTextToSize(docentFeedback, 170);
    doc.text(feedbackLines, margin, y);
    y += feedbackLines.length * 5;
  }

  doc.save(`${student.naam}_scorekaart.pdf`);
}

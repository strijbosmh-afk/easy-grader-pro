import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export function exportProjectToExcel(project: any, students: any[], criteria: any[]) {
  // Split criteria into sub-criteria and the holistic eindscore (if present)
  const subCriteria = criteria.filter((c) => !c.is_eindscore);
  const eindscoreCriterium = criteria.find((c) => c.is_eindscore);

  // Build header: Student | <sub-criteria...> | Deeltotaal | Deelmax | [Eindscore | Eindmax]
  const header = [
    "Student",
    ...subCriteria.map((c) => c.criterium_naam),
    "Deeltotaal",
    "Deelmax",
    ...(eindscoreCriterium ? [eindscoreCriterium.criterium_naam, `Max (${eindscoreCriterium.max_score})`] : []),
  ];

  const rows = students.map((s) => {
    const subScores = subCriteria.map((c) => {
      const sc = s.student_scores?.find((ss: any) => ss.criterium_id === c.id);
      return sc?.final_score ?? sc?.ai_suggested_score ?? "";
    });

    // Sum only sub-criteria, not the eindscore
    const subTotal = subScores.reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);
    const subMax = subCriteria.reduce((sum: number, c: any) => sum + Number(c.max_score), 0);

    const eindscoreVal = eindscoreCriterium
      ? (() => {
          const sc = s.student_scores?.find((ss: any) => ss.criterium_id === eindscoreCriterium.id);
          return sc?.final_score ?? sc?.ai_suggested_score ?? "";
        })()
      : undefined;

    return [
      s.naam,
      ...subScores,
      subTotal,
      subMax,
      ...(eindscoreCriterium ? [eindscoreVal, eindscoreCriterium.max_score] : []),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultaten");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${project.naam}_resultaten.xlsx`);
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

import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, ArrowRight, Loader2, Bot, Check, Download, RefreshCw, FileText, FileDown, ChevronLeft, ChevronRight, Eye, X, AlertTriangle, ClipboardCopy, CheckCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { exportStudentToPdf } from "@/lib/export";
import { downloadStudentReport } from "@/lib/export-pdf";
import { exportStudentToWord } from "@/lib/export-word";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfViewer } from "@/components/PdfViewer";
import { useScoreHistory } from "@/hooks/useScoreHistory";
import { invokeEdgeFunction } from "@/lib/supabase-helpers";
import { useKeyboardShortcuts, type Shortcut } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { Undo2 } from "lucide-react";

function extractStoragePath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/pdfs\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  const match2 = url.match(/\/object\/(?:public|sign)\/pdfs\/(.+?)(?:\?|$)/);
  if (match2) return decodeURIComponent(match2[1]);
  return null;
}

const StudentScorecard = () => {
  const { id: projectId, studentId } = useParams<{ id: string; studentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [docentFeedback, setDocentFeedback] = useState<string | null>(null);
  const [reAnalyzeNiveau, setReAnalyzeNiveau] = useState("streng");
  const [generatingReport, setGeneratingReport] = useState(false);
  const isMobile = useIsMobile();
  const [showPdfPanel, setShowPdfPanel] = useState(!isMobile);
  const [copied, setCopied] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const scoreHistory = useScoreHistory(projectId);

  // Fetch all students' scores for class comparison
  const { data: allStudents } = useQuery({
    queryKey: ["students-for-comparison", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, status, student_scores(criterium_id, final_score, ai_suggested_score)")
        .eq("project_id", projectId!)
        .in("status", ["reviewed", "graded"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch ordered sibling students for prev/next navigation
  const { data: siblings } = useQuery({
    queryKey: ["students", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, naam")
        .eq("project_id", projectId!)
        .order("naam", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Download PDF as blob URL for inline viewing (avoids Chrome iframe restrictions)
  const { data: pdfBlobUrl } = useQuery({
    queryKey: ["pdf-blob", student?.pdf_url],
    queryFn: async () => {
      const url = student!.pdf_url!;
      const storagePath = extractStoragePath(url);
      if (storagePath) {
        const { data, error } = await supabase.storage.from("pdfs").download(storagePath);
        if (!error && data) {
          return URL.createObjectURL(data);
        }
      }
      // Fallback: try fetching URL directly
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
      return null;
    },
    enabled: !!student?.pdf_url,
    staleTime: 30 * 60 * 1000,
  });

  const { data: criteria } = useQuery({
    queryKey: ["criteria", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_criteria")
        .select("*")
        .eq("project_id", projectId!)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: scores, isLoading: scoresLoading } = useQuery({
    queryKey: ["scores", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("*, grading_criteria(*)")
        .eq("student_id", studentId!);
      if (error) throw error;
      return data;
    },
  });

  // Initialize local scores from DB scores when they load
  const [localScores, setLocalScores] = useState<Record<string, { final_score: string; opmerkingen: string }>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (scores && criteria && !initialized) {
      const initial: Record<string, { final_score: string; opmerkingen: string }> = {};
      for (const c of criteria) {
        const score = scores.find((s) => s.criterium_id === c.id);
        initial[c.id] = {
          final_score: score?.final_score?.toString() ?? score?.ai_suggested_score?.toString() ?? "",
          opmerkingen: score?.opmerkingen ?? "",
        };
      }
      setLocalScores(initial);
      setInitialized(true);
    }
  }, [scores, criteria, initialized]);

  // Reset state when navigating to a different student
  useEffect(() => {
    setInitialized(false);
    setLocalScores({});
    setDocentFeedback(null);
    setIsDirty(false);
  }, [studentId]);

  // Warn before browser tab close when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const getScoreForCriterium = (criteriumId: string) => {
    if (localScores[criteriumId]) return localScores[criteriumId];
    const score = scores?.find((s) => s.criterium_id === criteriumId);
    return {
      final_score: score?.final_score?.toString() || score?.ai_suggested_score?.toString() || "",
      opmerkingen: score?.opmerkingen || "",
    };
  };

  const getAiData = (criteriumId: string) => {
    const score = scores?.find((s) => s.criterium_id === criteriumId);
    return {
      ai_suggested_score: score?.ai_suggested_score,
      ai_motivatie: score?.ai_motivatie,
      ai_detail_feedback: (score as any)?.ai_detail_feedback,
      ai_confidence: (score as any)?.ai_confidence,
    };
  };

  const updateLocal = (criteriumId: string, field: "final_score" | "opmerkingen", value: string) => {
    setIsDirty(true);
    setLocalScores((prev) => ({
      ...prev,
      [criteriumId]: {
        ...getScoreForCriterium(criteriumId),
        [field]: value,
      },
    }));
  };

  const feedbackValue = docentFeedback !== null ? docentFeedback : (student?.docent_feedback || "");

  const getMissingCriteria = () => {
    if (!criteria) return [];
    return criteria.filter((c) => {
      const vals = localScores[c.id] || getScoreForCriterium(c.id);
      return vals.final_score === "" || vals.final_score === undefined || vals.final_score === null;
    });
  };

  const saveScores = async () => {
    if (!criteria) return;
    const missing = getMissingCriteria();
    if (missing.length > 0) {
      toast.error(`Vul alle scores in. Ontbrekend: ${missing.map(c => c.criterium_naam).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      // Validate scores are within allowed range
      for (const c of criteria) {
        const vals = localScores[c.id] || getScoreForCriterium(c.id);
        if (vals.final_score !== "") {
          const num = parseFloat(vals.final_score);
          if (num > Number(c.max_score)) {
            toast.error(`Score voor "${c.criterium_naam}" mag maximaal ${c.max_score} zijn.`);
            setSaving(false);
            return;
          }
        }
      }

      // Push previous scores onto undo stack before saving
      const undoChanges = criteria
        .filter((c) => {
          const oldScore = scores?.find((s) => s.criterium_id === c.id);
          const oldVal = oldScore?.final_score ?? oldScore?.ai_suggested_score;
          const newVal = localScores[c.id]?.final_score;
          return newVal !== "" && parseFloat(newVal) !== oldVal;
        })
        .map((c) => {
          const oldScore = scores?.find((s) => s.criterium_id === c.id);
          return {
            studentId: studentId!,
            studentName: student?.naam || "",
            criteriumId: c.id,
            criteriumName: c.criterium_naam,
            previousScore: (oldScore?.final_score ?? oldScore?.ai_suggested_score)?.toString() ?? "",
            previousOpmerkingen: oldScore?.opmerkingen ?? "",
            timestamp: Date.now(),
          };
        });
      scoreHistory.pushChanges(undoChanges);

      // Log score changes to audit trail
      const auditRows = undoChanges.map((uc) => {
        const vals = localScores[uc.criteriumId] || getScoreForCriterium(uc.criteriumId);
        return {
          student_id: studentId!,
          criterium_id: uc.criteriumId,
          old_score: uc.previousScore !== "" ? parseFloat(uc.previousScore) : null,
          new_score: vals.final_score !== "" ? parseFloat(vals.final_score) : null,
          old_opmerkingen: uc.previousOpmerkingen || null,
          new_opmerkingen: vals.opmerkingen || null,
          change_type: "manual",
        };
      });
      if (auditRows.length > 0) {
        await supabase.from("score_audit_log").insert(auditRows);
      }

      // Batch upsert all scores in one call
      const upsertRows = criteria.map((c) => {
        const vals = localScores[c.id] || getScoreForCriterium(c.id);
        return {
          student_id: studentId!,
          criterium_id: c.id,
          final_score: vals.final_score !== "" ? parseFloat(vals.final_score) : null,
          opmerkingen: vals.opmerkingen || null,
        };
      });
      await supabase.from("student_scores").upsert(upsertRows, { onConflict: "student_id,criterium_id" });

      await supabase.from("students").update({
        status: "graded" as any,
        docent_feedback: feedbackValue || null,
      }).eq("id", studentId!);

      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["scores", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students", projectId] });
      toast.success("Scores opgeslagen!");
    } catch {
      toast.error("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  // Prev/next navigation helpers
  const siblingIndex = siblings?.findIndex((s) => s.id === studentId) ?? -1;
  const prevStudent = siblingIndex > 0 ? siblings![siblingIndex - 1] : null;
  const nextStudent = siblingIndex >= 0 && siblings && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;

  const navigateToStudent = useCallback((targetId: string) => {
    if (isDirty) {
      if (!window.confirm("Je hebt niet-opgeslagen wijzigingen. Toch verdergaan?")) return;
    }
    setIsDirty(false);
    navigate(`/project/${projectId}/student/${targetId}`);
  }, [isDirty, projectId, navigate]);

  const handleUndo = useCallback(() => {
    if (!scoreHistory.canUndo) return;
    scoreHistory.undo((change) => {
      setLocalScores((prev) => ({
        ...prev,
        [change.criteriumId]: {
          final_score: change.previousScore,
          opmerkingen: change.previousOpmerkingen,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["scores", studentId] });
    });
  }, [scoreHistory.canUndo]);

  const saveAndNext = useCallback(async () => {
    if (!saving && nextStudent) {
      await saveScores();
      toast.info(`Student ${(siblingIndex ?? 0) + 2}/${siblings?.length}: ${nextStudent.naam}`);
      navigateToStudent(nextStudent.id);
    }
  }, [saving, nextStudent, siblingIndex, siblings]);

  // All keyboard shortcuts defined via hook
  const shortcuts: Shortcut[] = useMemo(() => [
    { key: "s", ctrl: true, global: true, action: () => { if (!saving) saveScores(); }, label: "Scores opslaan", category: "Acties" },
    { key: "z", ctrl: true, action: handleUndo, label: "Ongedaan maken", category: "Acties" },
    { key: "Enter", ctrl: true, global: true, action: saveAndNext, label: "Opslaan & volgende student", category: "Acties" },
    { key: "ArrowDown", alt: true, action: () => {
      if (nextStudent) {
        toast.info(`Student ${(siblingIndex ?? 0) + 2}/${siblings?.length}: ${nextStudent.naam}`);
        navigateToStudent(nextStudent.id);
      }
    }, label: "Volgende student", category: "Navigatie" },
    { key: "j", alt: true, action: () => {
      if (nextStudent) {
        toast.info(`Student ${(siblingIndex ?? 0) + 2}/${siblings?.length}: ${nextStudent.naam}`);
        navigateToStudent(nextStudent.id);
      }
    }, label: "Volgende student (alt)", category: "Navigatie" },
    { key: "ArrowUp", alt: true, action: () => {
      if (prevStudent) {
        toast.info(`Student ${siblingIndex}/${siblings?.length}: ${prevStudent.naam}`);
        navigateToStudent(prevStudent.id);
      }
    }, label: "Vorige student", category: "Navigatie" },
    { key: "k", alt: true, action: () => {
      if (prevStudent) {
        toast.info(`Student ${siblingIndex}/${siblings?.length}: ${prevStudent.naam}`);
        navigateToStudent(prevStudent.id);
      }
    }, label: "Vorige student (alt)", category: "Navigatie" },
    { key: "Escape", action: () => {
      if (isDirty) {
        if (!window.confirm("Je hebt niet-opgeslagen wijzigingen. Toch verdergaan?")) return;
      }
      navigate(`/project/${projectId}`);
    }, label: "Terug naar project", category: "Navigatie" },
  ], [saving, handleUndo, saveAndNext, nextStudent, prevStudent, siblingIndex, siblings, isDirty, projectId]);

  useKeyboardShortcuts(shortcuts);

  // Accept all AI scores in one click
  const acceptAllAiScores = () => {
    if (!criteria || !scores) return;
    const updated: Record<string, { final_score: string; opmerkingen: string }> = { ...localScores };
    let count = 0;
    for (const c of criteria) {
      const score = scores.find((s) => s.criterium_id === c.id);
      if (score?.ai_suggested_score !== null && score?.ai_suggested_score !== undefined) {
        updated[c.id] = {
          final_score: score.ai_suggested_score.toString(),
          opmerkingen: updated[c.id]?.opmerkingen ?? score?.opmerkingen ?? "",
        };
        count++;
      }
    }
    setLocalScores(updated);
    setIsDirty(true);
    toast.success(`${count} AI-scores overgenomen`);
  };

  // Copy all feedback to clipboard
  const copyFeedbackToClipboard = async () => {
    if (!criteria) return;
    const lines: string[] = [];
    lines.push(`FEEDBACK: ${student?.naam}`);
    lines.push(`Project: ${project?.naam}`);
    lines.push(`Datum: ${new Date().toLocaleDateString("nl-BE")}`);
    lines.push("");
    if (student?.ai_feedback) {
      lines.push("=== Algemene AI Feedback ===");
      lines.push(student.ai_feedback);
      lines.push("");
    }
    lines.push("=== Scores per criterium ===");
    for (const c of criteria) {
      const vals = getScoreForCriterium(c.id);
      const ai = getAiData(c.id);
      lines.push(`\n${c.criterium_naam} — ${vals.final_score || ai.ai_suggested_score || "?"}/${c.max_score}`);
      if (ai.ai_motivatie) lines.push(ai.ai_motivatie);
      if (vals.opmerkingen) lines.push(`Opmerking: ${vals.opmerkingen}`);
    }
    const feedbackVal = docentFeedback !== null ? docentFeedback : (student?.docent_feedback || "");
    if (feedbackVal) {
      lines.push("\n=== Docent Feedback ===");
      lines.push(feedbackVal);
    }
    lines.push(`\nTotaal: ${totalFinal}/${totalMax}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Feedback gekopieerd naar klembord");
    setTimeout(() => setCopied(false), 3000);
  };

  // Compute class average % and this student's comparison
  const classComparison = useMemo(() => {
    if (!allStudents || allStudents.length < 2 || !criteria || totalMax === 0) return null;
    const otherTotals = allStudents
      .filter((s) => s.id !== studentId)
      .map((s) => {
        const scores = (s.student_scores || []);
        return scores.reduce((sum: number, sc: any) => sum + (sc.final_score ?? sc.ai_suggested_score ?? 0), 0);
      })
      .filter((t) => t > 0);
    if (otherTotals.length === 0) return null;
    const classAvg = otherTotals.reduce((a, b) => a + b, 0) / otherTotals.length;
    const classAvgPct = Math.round((classAvg / totalMax) * 100);
    const studentPct = Math.round((totalFinal / totalMax) * 100);
    const diff = studentPct - classAvgPct;
    return { classAvgPct, studentPct, diff };
  }, [allStudents, studentId, criteria, totalFinal, totalMax]);

  const analyzeStudent = useMutation({
    mutationFn: async (niveauOverride?: string) => {
      await supabase.from("students").update({ status: "analyzing" as any }).eq("id", studentId!);
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      const body: any = { studentId, projectId };
      if (niveauOverride) body.niveauOverride = niveauOverride;
      const { data, error } = await invokeEdgeFunction("analyze-student", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setInitialized(false);
      setLocalScores({});
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["scores", studentId] });
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
      toast.success("Analyse voltooid!");
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      toast.error(err?.message || "Analyse mislukt");
    },
  });

  if (isLoading || scoresLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Student niet gevonden</p>
      </div>
    );
  }

  const totalFinal = criteria?.reduce((sum, c) => {
    const val = getScoreForCriterium(c.id);
    return sum + (parseFloat(val.final_score) || 0);
  }, 0) || 0;

  const totalMax = criteria?.reduce((sum, c) => sum + Number(c.max_score), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Terug naar project
            </Button>
            {/* Prev / Next student navigation */}
            {siblings && siblings.length > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!prevStudent}
                  onClick={() => prevStudent && navigateToStudent(prevStudent.id)}
                  title={prevStudent ? `← ${prevStudent.naam}` : undefined}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1 max-w-[100px] truncate">{prevStudent?.naam ?? ""}</span>
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {siblingIndex + 1} / {siblings.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!nextStudent}
                  onClick={() => nextStudent && navigateToStudent(nextStudent.id)}
                  title={nextStudent ? `${nextStudent.naam} →` : undefined}
                >
                  <span className="hidden sm:inline mr-1 max-w-[100px] truncate">{nextStudent?.naam ?? ""}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{student.naam}</h1>
                {isDirty && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                    Niet opgeslagen
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{project?.naam}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={student.status === "graded" ? "default" : "secondary"} className="text-sm">
                {student.status === "graded" ? "Beoordeeld" : student.status === "analyzing" ? "Analyseren..." : "Wacht op beoordeling"}
              </Badge>
              {totalMax > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-foreground">{totalFinal}/{totalMax}</span>
                  {classComparison && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`text-xs gap-1 cursor-default ${
                              classComparison.diff > 5 ? "border-green-400 text-green-700 dark:text-green-400" :
                              classComparison.diff < -5 ? "border-red-400 text-red-700 dark:text-red-400" :
                              "border-border text-muted-foreground"
                            }`}
                          >
                            {classComparison.diff > 5 ? <TrendingUp className="h-3 w-3" /> :
                             classComparison.diff < -5 ? <TrendingDown className="h-3 w-3" /> :
                             <Minus className="h-3 w-3" />}
                            {classComparison.diff > 0 ? "+" : ""}{classComparison.diff}% vs klas
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Klasgemiddelde: {classComparison.classAvgPct}% · Deze student: {classComparison.studentPct}%
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4">
        {/* Action buttons row - full width above the split */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {/* Accept all AI scores — the biggest time saver */}
          {scores && scores.some((s) => s.ai_suggested_score !== null) && (
            <Button
              variant="default"
              onClick={acceptAllAiScores}
              className="bg-primary"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Alle AI-scores overnemen
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => analyzeStudent.mutate(undefined)}
            disabled={!project?.opdracht_pdf_url || !project?.graderingstabel_pdf_url || analyzeStudent.isPending}
          >
            {analyzeStudent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            {scores?.length ? "Opnieuw analyseren" : "AI Analyse starten"}
          </Button>

          {/* Re-analyze with custom norm */}
          {scores && scores.length > 0 && (
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1 bg-card">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <Select value={reAnalyzeNiveau} onValueChange={setReAnalyzeNiveau}>
                <SelectTrigger className="w-[140px] h-8 border-0 shadow-none text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streng">Streng</SelectItem>
                  <SelectItem value="neutraal">Neutraal</SelectItem>
                  <SelectItem value="mild">Mild</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => analyzeStudent.mutate(reAnalyzeNiveau)}
                disabled={analyzeStudent.isPending}
              >
                Herbeoordeel
              </Button>
            </div>
          )}

          {student.pdf_url && (
            <Button
              variant={showPdfPanel ? "default" : "outline"}
              onClick={() => setShowPdfPanel(!showPdfPanel)}
            >
              {showPdfPanel ? <X className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showPdfPanel ? "Sluit PDF" : "Bekijk PDF"}
            </Button>
          )}

          {/* Export group */}
          {criteria && criteria.length > 0 && (
            <div className="flex items-center gap-1 border rounded-md overflow-hidden sm:ml-auto">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-none border-r h-8 px-3"
                      onClick={() => downloadStudentReport(student, project!, criteria, scores || [])}>
                      <FileText className="h-3.5 w-3.5 mr-1.5" />PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download PDF rapport</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-none border-r h-8 px-3"
                      onClick={async () => {
                        try { await exportStudentToWord(student, project!, criteria, scores || []); toast.success("Word verslag geëxporteerd"); }
                        catch { toast.error("Word export mislukt"); }
                      }}>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />Word
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download Word verslag</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-none h-8 px-3"
                      onClick={copyFeedbackToClipboard}>
                      {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />}
                      {copied ? "Gekopieerd!" : "Kopieer"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kopieer alle feedback naar klembord</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {scores && scores.length > 0 && (
            <Button
              variant="outline"
              disabled={generatingReport}
              onClick={async () => {
                setGeneratingReport(true);
                try {
                  await invokeEdgeFunction("generate-report", { body: { studentId, projectId } });
                  queryClient.invalidateQueries({ queryKey: ["student", studentId] });
                  toast.success("Verslag gegenereerd!");
                } catch (err: any) {
                  toast.error(err?.message || "Verslag genereren mislukt");
                } finally { setGeneratingReport(false); }
              }}
            >
              {generatingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              {(student as any).verslag ? "Verslag hergenereren" : "Genereer Verslag"}
            </Button>
          )}
        </div>

        {/* Split pane */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: PDF viewer (when showPdfPanel && student.pdf_url) */}
          {showPdfPanel && student.pdf_url && (
            <div className="w-full lg:w-1/2 shrink-0 lg:sticky lg:top-4 lg:self-start" style={{ height: 'calc(100dvh - 180px)' }}>
              <Card className="h-full flex flex-col">
                <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {student.naam} — Document
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowPdfPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  {student.pdf_url?.match(/\.(docx?)$/i) ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <FileText className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Word-bestanden kunnen niet inline worden weergegeven</p>
                      {pdfBlobUrl && (
                        <a href={pdfBlobUrl} download={`${student.naam}.docx`} className="text-sm text-primary hover:underline">
                          Download bestand
                        </a>
                      )}
                    </div>
                  ) : (
                    <PdfViewer
                      blobUrl={pdfBlobUrl}
                      loading={!pdfBlobUrl && !!student.pdf_url}
                      title={`${student.naam} — Document`}
                      className="w-full h-full"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Right: Score cards */}
          <div className={`${showPdfPanel && student.pdf_url ? 'w-full lg:w-1/2' : 'w-full max-w-4xl mx-auto'} space-y-6`}>
            {/* Verslag */}
            {(student as any).verslag && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Eindverslag
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground">
                    {(student as any).verslag.split('\n').map((line: string, i: number) => {
                      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.replace('## ', '')}</h2>;
                      if (line.startsWith('**') && line.endsWith('**')) return <h3 key={i} className="text-base font-semibold mt-3 mb-1 text-foreground">{line.replace(/\*\*/g, '')}</h3>;
                      if (line.startsWith('- ')) return <li key={i} className="ml-4 text-sm text-foreground/90">{line.replace('- ', '')}</li>;
                      if (line.trim() === '') return <br key={i} />;
                      return <p key={i} className="text-sm text-foreground/90 mb-1">{line}</p>;
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Validation Warnings Alert */}
            {(student as any).ai_validation_warnings && Array.isArray((student as any).ai_validation_warnings) && (student as any).ai_validation_warnings.length > 0 && (
              <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">Score-validatie</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs">
                    {(student as any).ai_validation_warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {student.ai_feedback && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    AI Feedback
                    {(project as any)?.feedback_language && (project as any).feedback_language !== "nl" && (
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {{ en: "EN", fr: "FR", de: "DE" }[(project as any).feedback_language] || "NL"}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{student.ai_feedback}</p>
                </CardContent>
              </Card>
            )}

            {criteria && criteria.length > 0 ? (
              <>
                {criteria.map((c) => {
                  const ai = getAiData(c.id);
                  const vals = getScoreForCriterium(c.id);
                  return (
                    <Card key={c.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{c.criterium_naam}</CardTitle>
                          <span className="text-sm text-muted-foreground">Max: {c.max_score}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {ai.ai_suggested_score !== null && ai.ai_suggested_score !== undefined && (
                          <div className="bg-muted rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Bot className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">AI Suggestie: {ai.ai_suggested_score}/{c.max_score}</span>
                              {ai.ai_confidence === "low" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">De AI is onzeker over deze score. Controleer handmatig.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {ai.ai_confidence === "medium" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">De AI heeft gemiddeld vertrouwen in deze score.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {ai.ai_motivatie && (
                              <p className="text-xs text-muted-foreground">{ai.ai_motivatie}</p>
                            )}
                          </div>
                        )}

                        {/* Rubric Level Selector — shown when rubric_levels is populated */}
                        {Array.isArray((c as any).rubric_levels) && (c as any).rubric_levels.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">Niveau kiezen:</p>
                            <div className="flex flex-wrap gap-2">
                              {((c as any).rubric_levels as Array<{ label: string; score: number; description?: string }>).map((level, li) => {
                                const currentScore = vals.final_score;
                                const isActive = currentScore !== "" && parseFloat(currentScore) === level.score;
                                return (
                                  <TooltipProvider key={li}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => updateLocal(c.id, "final_score", level.score.toString())}
                                          className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                                            isActive
                                              ? "border-primary bg-primary text-primary-foreground"
                                              : "border-border hover:border-primary/50 text-foreground"
                                          }`}
                                        >
                                          {level.label}
                                          <span className="ml-1.5 opacity-70">({level.score})</span>
                                        </button>
                                      </TooltipTrigger>
                                      {level.description && (
                                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                                          {level.description}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {ai.ai_detail_feedback && (
                          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Gedetailleerde feedback (graderingstabel)</span>
                            </div>
                            <div className="text-xs text-blue-900 dark:text-blue-200 whitespace-pre-wrap leading-relaxed">
                              {ai.ai_detail_feedback}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-foreground">Score <span className="text-destructive">*</span></label>
                            <Input
                              type="number"
                              min={0}
                              max={Number(c.max_score)}
                              step={0.5}
                              value={vals.final_score}
                              onChange={(e) => updateLocal(c.id, "final_score", e.target.value)}
                              placeholder={`0 - ${c.max_score}`}
                               className={vals.final_score === "" ? "border-destructive" : ""}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground">Opmerkingen</label>
                            <Textarea
                              value={vals.opmerkingen}
                              onChange={(e) => updateLocal(c.id, "opmerkingen", e.target.value)}
                              placeholder="Optionele opmerkingen..."
                              rows={2}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Docent Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={feedbackValue}
                      onChange={(e) => setDocentFeedback(e.target.value)}
                      placeholder="Schrijf hier je persoonlijke feedback voor de student..."
                      rows={4}
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={saveScores} disabled={saving} size="lg">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Scores Opslaan
                  </Button>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    Nog geen beoordelingscriteria. Start eerst een AI analyse om criteria uit de graderingstabel te halen.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      {/* Floating Undo Button */}
      {scoreHistory.canUndo && scoreHistory.visible && (
        <div className="fixed left-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <Button
            onClick={handleUndo}
            disabled={scoreHistory.undoing}
            className="shadow-lg gap-2"
            variant="outline"
          >
            <Undo2 className="h-4 w-4" />
            <span className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">Ongedaan maken</span>
              {scoreHistory.lastChange && (
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {scoreHistory.lastChange.criteriumName} — {scoreHistory.lastChange.studentName}
                </span>
              )}
            </span>
          </Button>
        </div>
      )}
      <KeyboardShortcutsDialog shortcuts={shortcuts} />
    </div>
  );
};

export default StudentScorecard;

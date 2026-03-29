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
import { ArrowLeft, ArrowRight, Loader2, Bot, Check, Download, RefreshCw, FileText, FileDown, ChevronLeft, ChevronRight, Eye, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { exportStudentToPdf } from "@/lib/export";
import { exportStudentToWord } from "@/lib/export-word";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [showPdfPanel, setShowPdfPanel] = useState(true);

  const [isDirty, setIsDirty] = useState(false);

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

      // Log score changes to audit trail
      const auditRows = criteria
        .filter((c) => {
          const oldScore = scores?.find((s) => s.criterium_id === c.id);
          const oldVal = oldScore?.final_score ?? oldScore?.ai_suggested_score;
          const newVal = localScores[c.id]?.final_score;
          return newVal !== "" && parseFloat(newVal) !== oldVal;
        })
        .map((c) => {
          const oldScore = scores?.find((s) => s.criterium_id === c.id);
          const vals = localScores[c.id] || getScoreForCriterium(c.id);
          return {
            student_id: studentId!,
            criterium_id: c.id,
            old_score: oldScore?.final_score ?? oldScore?.ai_suggested_score ?? null,
            new_score: vals.final_score !== "" ? parseFloat(vals.final_score) : null,
            old_opmerkingen: oldScore?.opmerkingen ?? null,
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

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!saving) saveScores();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving, localScores, docentFeedback]);

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

  const analyzeStudent = useMutation({
    mutationFn: async (niveauOverride?: string) => {
      await supabase.from("students").update({ status: "analyzing" as any }).eq("id", studentId!);
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      const body: any = { studentId, projectId };
      if (niveauOverride) body.niveauOverride = niveauOverride;
      const { data, error } = await supabase.functions.invoke("analyze-student", { body });
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
        <div className="container mx-auto px-6 py-4">
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
                <span className="text-2xl font-bold text-foreground">{totalFinal}/{totalMax}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-4">
        {/* Action buttons row - full width above the split */}
        <div className="flex flex-wrap gap-3 mb-4">
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
          {criteria && criteria.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => exportStudentToPdf(student, project!, criteria, scores || [], getScoreForCriterium, feedbackValue)}
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await exportStudentToWord(student, project!, criteria, scores || []);
                    toast.success("Word verslag geëxporteerd");
                  } catch {
                    toast.error("Word export mislukt");
                  }
                }}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export Word
              </Button>
            </>
          )}
          {scores && scores.length > 0 && (
            <Button
              variant="outline"
              disabled={generatingReport}
              onClick={async () => {
                setGeneratingReport(true);
                try {
                  const { data, error } = await supabase.functions.invoke("generate-report", {
                    body: { studentId, projectId },
                  });
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ["student", studentId] });
                  toast.success("Verslag gegenereerd!");
                } catch (err: any) {
                  toast.error(err?.message || "Verslag genereren mislukt");
                } finally {
                  setGeneratingReport(false);
                }
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
            <div className="w-full lg:w-1/2 shrink-0 lg:sticky lg:top-4 lg:self-start" style={{ height: 'calc(100vh - 180px)' }}>
              <Card className="h-full flex flex-col">
                <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {student.naam} — PDF
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowPdfPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  {pdfBlobUrl ? (
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=1&navpanes=0`}
                      className="w-full h-full border-0"
                      title="Student PDF"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
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

            {student.ai_feedback && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    AI Feedback
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
    </div>
  );
};

export default StudentScorecard;

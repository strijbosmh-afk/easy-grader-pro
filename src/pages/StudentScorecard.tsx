import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Bot, Check, Download, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { exportStudentToPdf } from "@/lib/export";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const StudentScorecard = () => {
  const { id: projectId, studentId } = useParams<{ id: string; studentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [docentFeedback, setDocentFeedback] = useState<string | null>(null);
  const [reAnalyzeNiveau, setReAnalyzeNiveau] = useState("streng");
  const [generatingReport, setGeneratingReport] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId!).single();
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

  // Reset initialized when studentId changes
  useEffect(() => {
    setInitialized(false);
    setLocalScores({});
    setDocentFeedback(null);
  }, [studentId]);

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
    };
  };

  const updateLocal = (criteriumId: string, field: "final_score" | "opmerkingen", value: string) => {
    setLocalScores((prev) => ({
      ...prev,
      [criteriumId]: {
        ...getScoreForCriterium(criteriumId),
        [field]: value,
      },
    }));
  };

  const feedbackValue = docentFeedback !== null ? docentFeedback : (student?.docent_feedback || "");

  const saveScores = async () => {
    if (!criteria) return;
    setSaving(true);
    try {
      for (const c of criteria) {
        const vals = localScores[c.id] || getScoreForCriterium(c.id);
        const finalScore = vals.final_score !== "" ? parseFloat(vals.final_score) : null;
        await supabase.from("student_scores").upsert(
          {
            student_id: studentId!,
            criterium_id: c.id,
            final_score: finalScore,
            opmerkingen: vals.opmerkingen || null,
          },
          { onConflict: "student_id,criterium_id" }
        );
      }
      await supabase.from("students").update({
        status: "graded" as any,
        docent_feedback: feedbackValue || null,
      }).eq("id", studentId!);
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
          <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}`)} className="mb-3">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar project
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{student.naam}</h1>
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

      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-3">
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
            <Button variant="outline" asChild>
              <a href={student.pdf_url} target="_blank">Bekijk PDF</a>
            </Button>
          )}
          {criteria && criteria.length > 0 && (
            <Button
              variant="outline"
              onClick={() => exportStudentToPdf(student, project!, criteria, scores || [], getScoreForCriterium, feedbackValue)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          )}
        </div>

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
                        </div>
                        {ai.ai_motivatie && (
                          <p className="text-xs text-muted-foreground">{ai.ai_motivatie}</p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground">Score</label>
                        <Input
                          type="number"
                          min={0}
                          max={Number(c.max_score)}
                          step={0.5}
                          value={vals.final_score}
                          onChange={(e) => updateLocal(c.id, "final_score", e.target.value)}
                          placeholder={`0 - ${c.max_score}`}
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
      </main>
    </div>
  );
};

export default StudentScorecard;

import { useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload, FileText, Pencil, Check, X, Loader2, Bot, Download, Settings, LayoutGrid, RefreshCw, AlertTriangle, Users, FolderOpen, Search, Eye, Trash2, FileDown, CheckCircle, Circle, Sparkles, Cpu, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { exportProjectToExcel } from "@/lib/export";
import { downloadBatchReportsZip } from "@/lib/export-pdf";
import { exportStudentsBatchToWord, extractStudentName } from "@/lib/export-word";
import { Checkbox } from "@/components/ui/checkbox";
import { GradingChat } from "@/components/GradingChat";
import { BatchProgressOverlay, type BatchProgress, type BatchSummary } from "@/components/BatchProgressOverlay";
import { InviteReviewerDialog } from "@/components/InviteReviewerDialog";
import { ModerationTab } from "@/components/ModerationTab";
import { StudentReviewView } from "@/components/StudentReviewView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StudentStatus = "pending" | "analyzing" | "reviewed" | "graded";

const statusLabels: Record<StudentStatus, string> = {
  pending: "Wacht",
  analyzing: "Analyse...",
  reviewed: "Te beoordelen",
  graded: "Beoordeeld",
};

const statusVariants: Record<StudentStatus, "secondary" | "outline" | "default" | "destructive"> = {
  pending: "secondary",
  analyzing: "outline",
  reviewed: "outline",
  graded: "default",
};

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");

  // Grading table parse state
  const [parsingGrading, setParsingGrading] = useState(false);
  const [parsedCriteria, setParsedCriteria] = useState<any[] | null>(null);
  const [parsedSamenvatting, setParsedSamenvatting] = useState("");
  const [pendingGradingUrl, setPendingGradingUrl] = useState<string | null>(null);
  const [showGradingDialog, setShowGradingDialog] = useState(false);
  const [applyingCriteria, setApplyingCriteria] = useState(false);

  // AI model picker state
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showInviteReviewer, setShowInviteReviewer] = useState(false);
  const [reviewStudentId, setReviewStudentId] = useState<string | null>(null);
  const [modelPickerAction, setModelPickerAction] = useState<"grading" | "reanalyze" | "batch">("grading");
  const [pendingGradingFile, setPendingGradingFile] = useState<File | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, student_scores(*, grading_criteria(*))")
        .eq("project_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: criteria } = useQuery({
    queryKey: ["criteria", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_criteria")
        .select("*")
        .eq("project_id", id!)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Reviewer queries (must be before early returns)
  const { data: myReviewerRecord } = useQuery({
    queryKey: ["my-reviewer-status", id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_reviewers")
        .select("*")
        .eq("project_id", id!)
        .eq("reviewer_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: hasReviewers } = useQuery({
    queryKey: ["has-reviewers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_reviewers")
        .select("id")
        .eq("project_id", id!)
        .eq("status", "accepted")
        .limit(1);
      if (error) return false;
      return (data?.length || 0) > 0;
    },
  });

  const updateProject = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("projects").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const uploadPdf = async (file: File, type: "opdracht" | "graderingstabel") => {
    if (type === "graderingstabel") {
      // Show model picker first
      setPendingGradingFile(file);
      setModelPickerAction("grading");
      setShowModelPicker(true);
      return;
    }
    await doUploadPdf(file, type);
  };

  const doUploadPdf = async (file: File, type: "opdracht" | "graderingstabel") => {
    const path = `${id}/${type}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
    if (uploadError) throw uploadError;
    const { data: urlData, error: signError } = await supabase.storage.from("pdfs").createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
    if (signError || !urlData?.signedUrl) throw new Error("Kon PDF URL niet aanmaken");
    const signedUrl = urlData.signedUrl;

    if (type === "graderingstabel") {
      // Parse the grading table first before applying
      setPendingGradingUrl(signedUrl);
      setParsingGrading(true);
      try {
        const aiProvider = (project as any)?.ai_provider || "lovable";
        const { data, error } = await supabase.functions.invoke("parse-grading-table", {
          body: { graderingstabelUrl: signedUrl, aiProvider },
        });
        if (error) throw error;
        setParsedCriteria(data.criteria || []);
        setParsedSamenvatting(data.samenvatting || "");
        // Save scoring system summary if returned
        if (data.scoring_system_summary) {
          await supabase.from("projects").update({ scoring_system_summary: data.scoring_system_summary } as any).eq("id", id!);
        }
        setShowGradingDialog(true);
      } catch (err: any) {
        toast.error("Kon graderingstabel niet analyseren: " + (err?.message || "onbekende fout"));
        // Still save the URL even if parsing fails
        await updateProject.mutateAsync({ graderingstabel_pdf_url: signedUrl });
      } finally {
        setParsingGrading(false);
      }
    } else {
      await updateProject.mutateAsync({ opdracht_pdf_url: signedUrl });
      toast.success("Opdracht geüpload");
    }
  };

  const handleModelPickerConfirm = async (provider: string) => {
    setShowModelPicker(false);
    // Save the selected provider to the project
    await updateProject.mutateAsync({ ai_provider: provider });
    queryClient.invalidateQueries({ queryKey: ["project", id] });

    if (modelPickerAction === "grading" && pendingGradingFile) {
      const file = pendingGradingFile;
      setPendingGradingFile(null);
      await doUploadPdf(file, "graderingstabel");
    } else if (modelPickerAction === "reanalyze") {
      doBatchReAnalyze();
    } else if (modelPickerAction === "batch") {
      doBatchAnalyze();
    }
  };

  const applyNewCriteria = async () => {
    if (!parsedCriteria || !pendingGradingUrl) return;
    setApplyingCriteria(true);
    try {
      // Save grading table URL
      await updateProject.mutateAsync({ graderingstabel_pdf_url: pendingGradingUrl });

      // Delete ALL scores for students in this project, then delete old criteria
      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length > 0) {
        await supabase.from("student_scores").delete().in("student_id", studentIds);
      }
      await supabase.from("grading_criteria").delete().eq("project_id", id!);

      // Reset all student statuses
      await supabase.from("students").update({ 
        status: "pending" as StudentStatus, 
        ai_feedback: null, 
        verslag: null 
      }).eq("project_id", id!);

      // Insert new criteria
      const criteriaToInsert = parsedCriteria.map((c: any, i: number) => ({
        project_id: id!,
        criterium_naam: c.naam,
        max_score: c.max_score || 10,
        volgorde: i,
        is_eindscore: c.is_eindscore || false,
        rubric_levels: c.rubric_levels || null,
      }));
      await supabase.from("grading_criteria").insert(criteriaToInsert);

      queryClient.invalidateQueries({ queryKey: ["criteria", id] });
      queryClient.invalidateQueries({ queryKey: ["students", id] });

      setShowGradingDialog(false);
      toast.success("Nieuwe criteria toegepast! Heranalyse wordt gestart...");

      // Re-analyze all students that have a PDF (parallel, with concurrency limit)
      const studentsWithPdf = students?.filter((s) => s.pdf_url) || [];
      if (studentsWithPdf.length > 0) {
        await runBatchSequential(studentsWithPdf, {}, setBatchAnalyzing);
      }
    } catch (err: any) {
      toast.error("Fout bij toepassen criteria: " + (err?.message || "onbekende fout"));
    } finally {
      setApplyingCriteria(false);
    }
  };

  const dismissGradingDialog = async () => {
    // Just save the URL without changing criteria
    if (pendingGradingUrl) {
      await updateProject.mutateAsync({ graderingstabel_pdf_url: pendingGradingUrl });
      toast.success("Graderingstabel geüpload (criteria niet gewijzigd)");
    }
    setShowGradingDialog(false);
    setParsedCriteria(null);
    setPendingGradingUrl(null);
  };

  const uploadStudentPdfs = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name} is geen PDF`);
          continue;
        }
        const naam = extractStudentName(file.name);
        const path = `${id}/students/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
        if (uploadError) {
          toast.error(`Upload mislukt: ${file.name}`);
          continue;
        }
        const { data: urlData, error: signError } = await supabase.storage.from("pdfs").createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
        if (signError || !urlData?.signedUrl) {
          toast.error(`Kon URL aanmaken voor: ${file.name}`);
          continue;
        }
        const { error: insertError } = await supabase
          .from("students")
          .insert({ project_id: id!, naam, pdf_url: urlData.signedUrl });
        if (insertError) {
          toast.error(`Student toevoegen mislukt: ${naam}`);
          continue;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      toast.success("Studenten toegevoegd!");
    } finally {
      setUploading(false);
    }
  };

  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [reAnalyzeNiveau, setReAnalyzeNiveau] = useState("streng");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const cancelRef = useRef(false);

  const runBatchSequential = async (
    studentList: any[],
    extraBody: Record<string, unknown> = {},
    setRunning: (v: boolean) => void
  ) => {
    if (studentList.length === 0) return;

    const missingPdf = studentList.filter((s) => !s.pdf_url);
    if (missingPdf.length > 0) {
      toast.warning(
        `${missingPdf.length} student${missingPdf.length > 1 ? "en hebben" : " heeft"} geen PDF en worden overgeslagen: ${missingPdf.map((s) => s.naam).join(", ")}`
      );
    }
    const eligible = studentList.filter((s) => s.pdf_url);
    if (eligible.length === 0) return;

    setRunning(true);
    cancelRef.current = false;

    const progress: BatchProgress = {
      total: eligible.length,
      completed: 0,
      failed: 0,
      currentStudentName: eligible[0]?.naam || "",
      failedNames: [],
      startTime: Date.now(),
      studentTimes: [],
    };
    setBatchProgress({ ...progress });

    // Update all to 'grading' status
    await supabase.from("students").update({ grading_status: "grading" } as any)
      .in("id", eligible.map((s) => s.id));

    let successCount = 0;
    let failCount = 0;
    const failedNames: string[] = [];
    const times: number[] = [];

    for (let i = 0; i < eligible.length; i++) {
      if (cancelRef.current) break;

      const student = eligible[i];
      progress.currentStudentName = student.naam;
      setBatchProgress({ ...progress });

      // Mark analyzing
      await supabase.from("students").update({ status: "analyzing" as StudentStatus, grading_status: "grading" } as any).eq("id", student.id);
      queryClient.invalidateQueries({ queryKey: ["students", id] });

      const t0 = Date.now();
      try {
        const { error } = await supabase.functions.invoke("analyze-student", {
          body: { studentId: student.id, projectId: id, ...extraBody },
        });
        if (error) throw error;
        successCount++;
        await supabase.from("students").update({ grading_status: "completed" } as any).eq("id", student.id);
      } catch {
        failCount++;
        failedNames.push(student.naam);
        await supabase.from("students").update({ status: "pending" as StudentStatus, grading_status: "failed" } as any).eq("id", student.id);
      }

      times.push(Date.now() - t0);
      progress.completed = successCount;
      progress.failed = failCount;
      progress.failedNames = [...failedNames];
      progress.studentTimes = [...times];
      setBatchProgress({ ...progress });
      queryClient.invalidateQueries({ queryKey: ["students", id] });
    }

    setBatchProgress(null);
    setRunning(false);

    // Compute summary
    const updatedStudents = queryClient.getQueryData<any[]>(["students", id]) || students || [];
    let totalWarnings = 0;
    const confidenceCounts = { high: 0, medium: 0, low: 0 };
    for (const s of eligible) {
      const fresh = updatedStudents.find((u: any) => u.id === s.id);
      if (fresh?.ai_validation_warnings && Array.isArray(fresh.ai_validation_warnings)) {
        totalWarnings += fresh.ai_validation_warnings.length;
      }
      const scores = fresh?.student_scores || [];
      for (const sc of scores) {
        if (sc.ai_confidence === "low") confidenceCounts.low++;
        else if (sc.ai_confidence === "medium") confidenceCounts.medium++;
        else confidenceCounts.high++;
      }
    }
    const totalConf = confidenceCounts.high + confidenceCounts.medium + confidenceCounts.low;
    const avgConf = totalConf === 0 ? "n/a"
      : confidenceCounts.low / totalConf > 0.3 ? "low"
      : confidenceCounts.medium / totalConf > 0.3 ? "medium"
      : "high";

    setBatchSummary({
      total: eligible.length,
      success: successCount,
      failed: failCount,
      avgTimeMs: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      avgConfidence: avgConf,
      validationWarnings: totalWarnings,
    });
  };

  const doBatchAnalyze = async () => {
    const allEligible = students?.filter((s) => s.status === "pending" || s.status === "reviewed") || [];
    const toAnalyze = selectedStudents.size > 0
      ? allEligible.filter((s) => selectedStudents.has(s.id))
      : allEligible;
    await runBatchSequential(toAnalyze, {}, setBatchAnalyzing);
  };

  const batchReAnalyze = () => {
    const allEligible = students?.filter((s) => s.status === "reviewed" || s.status === "graded") || [];
    const eligible = selectedStudents.size > 0
      ? allEligible.filter((s) => selectedStudents.has(s.id))
      : allEligible;
    if (eligible.length === 0) {
      toast.info("Geen geanalyseerde studenten om opnieuw te beoordelen");
      return;
    }
    setModelPickerAction("reanalyze");
    setShowModelPicker(true);
  };

  const doBatchReAnalyze = async () => {
    const allEligible = students?.filter((s) => s.status === "reviewed" || s.status === "graded") || [];
    const eligible = selectedStudents.size > 0
      ? allEligible.filter((s) => selectedStudents.has(s.id))
      : allEligible;
    await runBatchSequential(
      eligible,
      { niveauOverride: reAnalyzeNiveau },
      setReAnalyzing
    );
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        uploadStudentPdfs(e.dataTransfer.files);
      }
    },
    [id]
  );

  const handleSaveName = () => {
    if (newName.trim()) {
      updateProject.mutate({ naam: newName.trim() });
      setEditingName(false);
    }
  };
  const renameStudent = async (studentId: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from("students").update({ naam: name.trim() }).eq("id", studentId);
    if (error) { toast.error("Naam wijzigen mislukt"); return; }
    queryClient.invalidateQueries({ queryKey: ["students", id] });
    setEditingStudentId(null);
    toast.success("Naam gewijzigd");
  };

  const deleteStudent = async (studentId: string) => {
    // Delete scores first, then student
    await supabase.from("student_scores").delete().eq("student_id", studentId);
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    queryClient.invalidateQueries({ queryKey: ["students", id] });
    setDeletingStudentId(null);
    toast.success("Student verwijderd");
  };

  // Find the eindscore criterion if it exists
  const eindscoreCriterium = criteria?.find((c: any) => c.is_eindscore);

  const getEindScore = (student: any) => {
    if (!eindscoreCriterium) return null;
    const sc = student.student_scores?.find((s: any) => s.criterium_id === eindscoreCriterium.id);
    if (!sc) return null;
    return sc.final_score ?? sc.ai_suggested_score ?? null;
  };

  const getTotalScore = (student: any) => {
    // If there's an eindscore criterion, use that
    if (eindscoreCriterium) {
      return getEindScore(student);
    }
    // Otherwise sum all scores
    const scores = student.student_scores || [];
    const vals = scores.map((s: any) => s.final_score ?? s.ai_suggested_score).filter((v: any) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return vals.reduce((a: number, b: number) => a + Number(b), 0);
  };

  const getMaxTotal = () => {
    if (eindscoreCriterium) return Number(eindscoreCriterium.max_score);
    if (!criteria) return 0;
    return criteria.reduce((a, c) => a + Number(c.max_score), 0);
  };

  const getMissingScores = (student: any) => {
    if (!criteria || criteria.length === 0) return [];
    const scores = student.student_scores || [];
    return criteria.filter((c: any) => {
      const sc = scores.find((s: any) => s.criterium_id === c.id);
      if (!sc) return true;
      // Flag criteria where score is null (unmatched by AI) or has an explicit warning message
      if (sc.ai_suggested_score === null && sc.final_score === null) return true;
      return sc.ai_motivatie?.includes("Geen beoordeling ontvangen") || sc.ai_motivatie?.startsWith("⚠️");
    });
  };

  const finalizeSelected = async () => {
    const toFinalize = students?.filter(s =>
      selectedStudents.has(s.id) && (s.status === "reviewed")
    ) || [];
    if (toFinalize.length === 0) {
      toast.info("Selecteer studenten met status 'Te beoordelen' om te finaliseren");
      return;
    }
    setFinalizing(true);
    try {
      await supabase.from("students")
        .update({ status: "graded" as any })
        .in("id", toFinalize.map(s => s.id));
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      toast.success(`${toFinalize.length} student(en) gefinaliseerd`);
      setSelectedStudents(new Set());
    } catch {
      toast.error("Finaliseren mislukt");
    } finally {
      setFinalizing(false);
    }
  };

  const deleteDemo = useMutation({
    mutationFn: async () => {
      const { data: studentIds } = await supabase.from("students").select("id").eq("project_id", id!);
      if (studentIds && studentIds.length > 0) {
        const ids = studentIds.map(s => s.id);
        await supabase.from("student_scores").delete().in("student_id", ids);
        await supabase.from("score_audit_log").delete().in("student_id", ids);
      }
      await supabase.from("students").delete().eq("project_id", id!);
      await supabase.from("grading_criteria").delete().eq("project_id", id!);
      await supabase.from("project_shares").delete().eq("project_id", id!);
      await supabase.from("projects").delete().eq("id", id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Demo-project verwijderd");
      navigate("/");
    },
    onError: () => toast.error("Fout bij verwijderen"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Project niet gevonden</p>
      </div>
    );
  }

  const gradedCount = students?.filter((s) => s.status === "graded").length || 0;
  const totalStudents = students?.length || 0;
  const progress = totalStudents > 0 ? (gradedCount / totalStudents) * 100 : 0;

  const isDemo = (project as any)?.is_demo === true;
  const isOwner = project?.user_id === user?.id;
  const isReviewer = !!myReviewerRecord && myReviewerRecord.status === "accepted";
  const isReviewerPending = !!myReviewerRecord && myReviewerRecord.status === "pending";

  return (
    <div className="min-h-screen bg-background">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="container mx-auto px-6 py-2 flex items-center justify-between">
            <p className="text-sm text-primary">
              Dit is een demo-project. Je kunt het verwijderen wanneer je wilt.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteDemo.mutate()}
              disabled={deleteDemo.isPending}
            >
              Demo verwijderen
            </Button>
          </div>
        </div>
      )}
      {/* Reviewer pending banner */}
      {isReviewerPending && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <div className="container mx-auto px-6 py-2 flex items-center justify-between">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Je bent uitgenodigd als reviewer voor dit project.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await supabase.from("project_reviewers").update({ status: "accepted", accepted_at: new Date().toISOString() } as any)
                    .eq("project_id", id!).eq("reviewer_id", user!.id);
                  queryClient.invalidateQueries({ queryKey: ["my-reviewer-status", id] });
                  toast.success("Uitnodiging geaccepteerd!");
                }}
              >
                Accepteren
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await supabase.from("project_reviewers").update({ status: "declined" } as any)
                    .eq("project_id", id!).eq("reviewer_id", user!.id);
                  queryClient.invalidateQueries({ queryKey: ["my-reviewer-status", id] });
                  toast.info("Uitnodiging geweigerd");
                }}
              >
                Weigeren
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Reviewer badge */}
      {isReviewer && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
          <div className="container mx-auto px-6 py-2">
            <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Je bent reviewer voor dit project. Klik op een student om te reviewen.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-3">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    className="text-xl font-bold h-9 max-w-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveName}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground">{project.naam}</h1>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setNewName(project.naam);
                      setEditingName(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {totalStudents > 0 && (
                <div className="mt-3 max-w-xs">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Voortgang</span>
                    <span>{gradedCount}/{totalStudents} beoordeeld</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </div>
            {/* Header actions: export & overview */}
            <div className="flex items-center gap-2 shrink-0 pt-1">
              {isOwner && (
                <Button variant="outline" size="sm" onClick={() => setShowInviteReviewer(true)}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Reviewer uitnodigen
                </Button>
              )}
              {students && students.length > 0 && criteria && criteria.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/project/${id}/overzicht`)}
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Scoreoverzicht
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const hasScores = students.some((s: any) => s.student_scores?.some((sc: any) => sc.final_score !== null || sc.ai_suggested_score !== null));
                      if (!hasScores) {
                        toast.info("Nog geen scores om te exporteren. Analyseer eerst minstens één student.");
                        return;
                      }
                      exportProjectToExcel(project, students, criteria);
                      toast.success("Excel geëxporteerd!");
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exporteer naar Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingWord}
                    onClick={async () => {
                      setExportingWord(true);
                      try {
                        const toExport = selectedStudents.size > 0
                          ? students.filter((s) => selectedStudents.has(s.id))
                          : students;
                        const scoresMap = new Map<string, any[]>();
                        for (const s of toExport) {
                          scoresMap.set(s.id, s.student_scores || []);
                        }
                        await exportStudentsBatchToWord(toExport, project, criteria, scoresMap);
                        toast.success(`${toExport.length} verslag(en) geëxporteerd`);
                      } catch {
                        toast.error("Word export mislukt");
                      } finally {
                        setExportingWord(false);
                      }
                    }}
                  >
                    {exportingWord ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                    {selectedStudents.size > 0 ? `Export Verslag (${selectedStudents.size})` : "Export Verslag"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportingPdf}
                    onClick={async () => {
                      const hasScores = students!.some((s: any) => s.student_scores?.some((sc: any) => sc.final_score !== null || sc.ai_suggested_score !== null));
                      if (!hasScores) {
                        toast.info("Nog geen scores om te exporteren.");
                        return;
                      }
                      setExportingPdf(true);
                      setPdfProgress("");
                      try {
                        const toExport = selectedStudents.size > 0
                          ? students!.filter((s) => selectedStudents.has(s.id))
                          : students!;
                        await downloadBatchReportsZip(toExport, project, criteria!, (cur, tot, name) => {
                          setPdfProgress(`Rapport ${cur} van ${tot}: ${name}`);
                        });
                        toast.success("PDF rapporten geëxporteerd!");
                      } catch (err: any) {
                        toast.error(err?.message || "PDF export mislukt");
                      } finally {
                        setExportingPdf(false);
                        setPdfProgress("");
                      }
                    }}
                  >
                    {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                    {exportingPdf && pdfProgress ? pdfProgress : selectedStudents.size > 0 ? `Download Rapporten (${selectedStudents.size})` : "Download Rapporten (PDF)"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Project configuratie: instellingen + documenten in één rij */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* AI Model */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Bot className="h-4 w-4" />
                AI Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={(project as any).ai_provider || "lovable"}
                onValueChange={(value) => updateProject.mutateAsync({ ai_provider: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="anthropic">Anthropic Claude Sonnet 4</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Beoordelingsperspectief */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Settings className="h-4 w-4" />
                Beoordelingsperspectief
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={(project as any).beoordelingsniveau || "streng"}
                onValueChange={(value) => updateProject.mutateAsync({ beoordelingsniveau: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streng">Streng — kritisch</SelectItem>
                  <SelectItem value="neutraal">Neutraal — evenwichtig</SelectItem>
                  <SelectItem value="mild">Mild — stimulerend</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Feedbacktaal */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Settings className="h-4 w-4" />
                Feedbacktaal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={(project as any).feedback_language || "nl"}
                onValueChange={(value) => {
                  updateProject.mutateAsync({ feedback_language: value } as any);
                  toast.success("Feedbacktaal opgeslagen");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nl">Nederlands</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">De taal waarin de AI feedback schrijft aan studenten</p>
            </CardContent>
          </Card>
          {/* Onderwijscontext */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Settings className="h-4 w-4" />
                Onderwijscontext (optioneel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full min-h-[60px] text-sm rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Bijv.: Professionele bachelor Kleuteronderwijs aan een Vlaamse hogeschool. Studenten zijn toekomstige kleuterleidsters. Typische opdrachten: stageverslag, didactische voorbereiding, portfolio."
                defaultValue={(project as any).education_context || ""}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val !== ((project as any).education_context || "")) {
                    updateProject.mutateAsync({ education_context: val || null } as any);
                    toast.success("Onderwijscontext opgeslagen");
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">Beschrijf de opleiding, het type studenten en opdrachten. Dit helpt de AI om passender te beoordelen.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Opdracht PDF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.opdracht_pdf_url ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPdfViewerUrl(project.opdracht_pdf_url!); setPdfViewerTitle("Opdracht"); }}
                    className="text-sm text-primary hover:underline truncate flex-1 text-left flex items-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    Bekijk opdracht
                  </button>
                  <Label htmlFor="opdracht-upload" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Vervang
                  </Label>
                </div>
              ) : (
                <Label htmlFor="opdracht-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground block text-center py-2 border border-dashed rounded-md">
                  Klik om te uploaden
                </Label>
              )}
              <input
                id="opdracht-upload"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0], "opdracht")}
              />
            </CardContent>
          </Card>

          {/* Graderingstabel PDF */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                Graderingstabel PDF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parsingGrading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Wordt geanalyseerd...</span>
                </div>
              ) : project.graderingstabel_pdf_url ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPdfViewerUrl(project.graderingstabel_pdf_url!); setPdfViewerTitle("Graderingstabel"); }}
                    className="text-sm text-primary hover:underline truncate flex-1 text-left flex items-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    Bekijk graderingstabel
                  </button>
                  <Label htmlFor="graderingstabel-upload" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Vervang
                  </Label>
                </div>
              ) : (
                <Label htmlFor="graderingstabel-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground block text-center py-2 border border-dashed rounded-md">
                  Klik om te uploaden
                </Label>
              )}
              <input
                id="graderingstabel-upload"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0], "graderingstabel")}
              />
            </CardContent>
          </Card>
        </div>

        {/* AI Chat */}
        <GradingChat
          projectId={id!}
          onReAnalyzeRequested={() => doBatchReAnalyze()}
          onInstructionsCleared={() => queryClient.invalidateQueries({ queryKey: ["project", id] })}
          customInstructions={project?.custom_instructions}
        />

        {/* Studenten sectie */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Studenten
                {totalStudents > 0 && (
                  <Badge variant="secondary" className="ml-1 font-normal">{totalStudents}</Badge>
                )}
              </CardTitle>

              {/* Actieknoppen: logisch gegroepeerd */}
              {students && students.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Groep 1: Analyse acties */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={batchAnalyzing || reAnalyzing || !project.opdracht_pdf_url || !project.graderingstabel_pdf_url}
                      onClick={() => {
                        const pending = students?.filter((s) => s.status === "pending" || s.status === "reviewed") || [];
                        if (pending.length === 0) {
                          toast.info("Geen studenten om te analyseren");
                          return;
                        }
                        setModelPickerAction("batch");
                        setShowModelPicker(true);
                      }}
                    >
                      {batchAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                      {selectedStudents.size > 0 ? `Analyseer (${selectedStudents.size})` : "Analyseer alle"}
                    </Button>

                    {students.some((s) => s.status === "reviewed" || s.status === "graded") && (
                      <>
                        <Separator orientation="vertical" className="h-6" />
                        <div className="flex items-center gap-1.5">
                          <Select value={reAnalyzeNiveau} onValueChange={setReAnalyzeNiveau}>
                            <SelectTrigger className="w-[100px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="streng">Streng</SelectItem>
                              <SelectItem value="neutraal">Neutraal</SelectItem>
                              <SelectItem value="mild">Mild</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reAnalyzing || batchAnalyzing}
                            onClick={batchReAnalyze}
                          >
                            {reAnalyzing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                            {selectedStudents.size > 0 ? `Heranalyse (${selectedStudents.size})` : "Heranalyse"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Finaliseer button */}
                  {selectedStudents.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={finalizeSelected}
                      disabled={finalizing}
                      className="border-green-300 text-green-700 hover:bg-green-50"
                    >
                      {finalizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Finaliseer ({selectedStudents.size})
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          {/* Batch progress overlay */}
          <BatchProgressOverlay
            progress={batchProgress}
            onCancel={() => { cancelRef.current = true; }}
            summary={batchSummary}
            onCloseSummary={() => {
              setBatchSummary(null);
              queryClient.invalidateQueries({ queryKey: ["students", id] });
            }}
          />

          <CardContent className="space-y-6">
            {/* Drag & drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-muted-foreground">Uploaden...</span>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Sleep student-PDFs hierheen of{" "}
                    <label htmlFor="student-upload" className="text-primary cursor-pointer hover:underline">
                      blader
                    </label>
                  </p>
                  <input
                    id="student-upload"
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && uploadStudentPdfs(e.target.files)}
                  />
                </>
              )}
            </div>

            {/* Zoekbalk + Studenten tabel */}
            {students && students.length > 0 && (
              <>
                {students.length > 3 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Zoek student..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 max-w-xs"
                    />
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedStudents.size === students.length && students.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStudents(new Set(students.map((s) => s.id)));
                            } else {
                              setSelectedStudents(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Voortgang</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students
                      .filter((s) => s.naam.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((student) => {
                        const total = getTotalScore(student);
                        const max = getMaxTotal();
                        const missing = getMissingScores(student);
                        const isEditing = editingStudentId === student.id;
                        return (
                          <TableRow key={student.id} className={`cursor-pointer ${student.status === "graded" ? "bg-green-50/50 dark:bg-green-950/20" : ""}`} onClick={() => !isEditing && navigate(`/project/${id}/student/${student.id}`)}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedStudents.has(student.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedStudents((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(student.id);
                                    else next.delete(student.id);
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {isEditing ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    value={editStudentName}
                                    onChange={(e) => setEditStudentName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && renameStudent(student.id, editStudentName)}
                                    className="h-7 text-sm w-48"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => renameStudent(student.id, editStudentName)}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingStudentId(null)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                student.naam
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariants[student.status as StudentStatus]}>
                                {student.status === "analyzing" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                {statusLabels[student.status as StudentStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {total !== null ? (
                                <span className={missing.length > 0 ? "text-destructive font-semibold" : ""}>
                                  {total}/{max}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              {student.status === "pending" ? (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              ) : student.status === "analyzing" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                              ) : missing.length > 0 ? (
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              ) : student.status === "graded" ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <Circle className="h-4 w-4 text-yellow-500" />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!project.opdracht_pdf_url || !project.graderingstabel_pdf_url || student.status === "analyzing"}
                                  onClick={() => runBatchSequential([student], {}, setBatchAnalyzing)}
                                >
                                  <Bot className="h-4 w-4 mr-1" />
                                  Analyseer
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => { setEditingStudentId(student.id); setEditStudentName(student.naam); }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {deletingStudentId === student.id ? (
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => deleteStudent(student.id)}>
                                      Bevestig
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeletingStudentId(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeletingStudentId(student.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {students.filter((s) => s.naam.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          Geen studenten gevonden voor "{searchQuery}"
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Grading table confirmation dialog */}
      <Dialog open={showGradingDialog} onOpenChange={(open) => !open && dismissGradingDialog()}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Nieuwe graderingstabel gedetecteerd
            </DialogTitle>
            <DialogDescription>
              {parsedSamenvatting || "De graderingstabel is geanalyseerd. Hieronder vind je de geëxtraheerde criteria."}
            </DialogDescription>
          </DialogHeader>

          {parsedCriteria && parsedCriteria.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {parsedCriteria.length} criteria gevonden:
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criterium</TableHead>
                    <TableHead className="w-24 text-right">Max score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedCriteria.map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        <div>{c.naam}</div>
                        {c.beschrijving && (
                          <div className="text-xs text-muted-foreground mt-0.5">{c.beschrijving}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.max_score}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {criteria && criteria.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mt-3">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ Let op: de huidige {criteria.length} criteria en alle bijbehorende scores worden vervangen. Alle studenten worden opnieuw geanalyseerd.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={dismissGradingDialog} disabled={applyingCriteria}>
              Nee, alleen uploaden
            </Button>
            <Button onClick={applyNewCriteria} disabled={applyingCriteria}>
              {applyingCriteria ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Toepassen...
                </>
              ) : (
                "Ja, toepassen & heranalyseren"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Model Picker Dialog */}
      <Dialog open={showModelPicker} onOpenChange={(open) => {
        if (!open) {
          setShowModelPicker(false);
          setPendingGradingFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Kies AI Model
            </DialogTitle>
            <DialogDescription>
              {modelPickerAction === "grading"
                ? "Welk AI model wil je gebruiken om de graderingstabel te analyseren en het beoordelingsbeleid op te stellen?"
                : "Welk AI model wil je gebruiken voor de analyse van de studenten?"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              type="button"
              onClick={() => handleModelPickerConfirm("lovable")}
              className={`relative rounded-lg border-2 p-5 text-left transition-all hover:border-primary/60 ${
                (project as any)?.ai_provider === "lovable" || !(project as any)?.ai_provider
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Gemini 2.5 Flash</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✦ Snel & voordelig</li>
                <li>✦ Goed in multimodale PDF-analyse</li>
                <li>✦ Geschikt voor standaard beoordelingen</li>
              </ul>
              {((project as any)?.ai_provider === "lovable" || !(project as any)?.ai_provider) && (
                <span className="absolute top-2 right-2 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Huidig</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleModelPickerConfirm("anthropic")}
              className={`relative rounded-lg border-2 p-5 text-left transition-all hover:border-primary/60 ${
                (project as any)?.ai_provider === "anthropic"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Claude Sonnet 4</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✦ Diepgaande, genuanceerde analyse</li>
                <li>✦ Sterk in complexe teksten</li>
                <li>✦ Gedetailleerdere feedback</li>
              </ul>
              {(project as any)?.ai_provider === "anthropic" && (
                <span className="absolute top-2 right-2 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Huidig</span>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pdfViewerUrl} onOpenChange={(open) => !open && setPdfViewerUrl(null)}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle>{pdfViewerTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 px-6 pb-6 min-h-0">
            {pdfViewerUrl && (
              <iframe
                src={pdfViewerUrl}
                className="w-full h-full rounded-md border"
                title={pdfViewerTitle}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDetail;

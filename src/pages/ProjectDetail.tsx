import { useState, useCallback, useRef, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { ArrowLeft, Upload, FileText, Pencil, Check, X, Loader2, Bot, Download, Settings, LayoutGrid, RefreshCw, AlertTriangle, Users, FolderOpen, Search, Eye, Trash2, FileDown, CheckCircle, Circle, Sparkles, Cpu, ShieldCheck, Info, Share2, MessageSquare, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Zap, Brain } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { ShareFeedbackDialog } from "@/components/ShareFeedbackDialog";
import { StudentReactionsTab } from "@/components/StudentReactionsTab";
import { PlagiarismTab } from "@/components/PlagiarismTab";
import { invokeEdgeFunction } from "@/lib/supabase-helpers";
import { concurrencyPool } from "@/lib/concurrencyPool";
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

function StudentAnalyzingProgress({ studentId, startTimesRef, avgTime }: {
  studentId: string;
  startTimesRef: React.RefObject<Map<string, number>>;
  avgTime: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const startTime = startTimesRef.current?.get(studentId) || Date.now();

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const elapsedSec = Math.floor(elapsed / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedStr = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec % 60}s` : `${elapsedSec}s`;

  const pct = avgTime > 0 ? Math.min((elapsed / avgTime) * 100, 95) : 0;
  const remainingMs = avgTime > 0 ? Math.max(avgTime - elapsed, 0) : 0;
  const remainingSec = Math.floor(remainingMs / 1000);
  const remainingStr = remainingSec > 60 ? `~${Math.ceil(remainingSec / 60)}m` : `~${remainingSec}s`;

  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-xs font-medium text-primary">{elapsedStr}</span>
        </div>
        {avgTime > 0 && remainingMs > 0 && (
          <span className="text-[10px] text-muted-foreground">nog {remainingStr}</span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {avgTime > 0 ? (
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full rounded-full bg-primary animate-progress-indeterminate" />
        )}
      </div>
    </div>
  );
}

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
  const [sortColumn, setSortColumn] = useState<"naam" | "status" | "score" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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
  const [shareStudent, setShareStudent] = useState<any>(null);
  const [sharingAll, setSharingAll] = useState(false);
  const [modelPickerAction, setModelPickerAction] = useState<"grading" | "reanalyze" | "batch">("grading");
  const [pendingGradingFile, setPendingGradingFile] = useState<File | null>(null);

  // Collapsible section states with localStorage persistence
  const storageKey = `project-sections-${id}`;
  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { instellingen: false, documenten: true, studenten: true };
  });

  const updateSectionState = useCallback((key: string, open: boolean) => {
    setSectionStates((prev) => {
      const next = { ...prev, [key]: open };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

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
    staleTime: 5_000,
    refetchOnWindowFocus: true,
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

  const { data: reactionsCount } = useQuery({
    queryKey: ["reactions-count", id],
    queryFn: async () => {
      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("student_reactions")
        .select("*", { count: "exact", head: true })
        .in("student_id", studentIds);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!students && students.length > 0,
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
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `${user!.id}/${id}/${type}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
    if (uploadError) throw uploadError;
    const { data: urlData, error: signError } = await supabase.storage.from("pdfs").createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
    if (signError || !urlData?.signedUrl) throw new Error("Kon bestand URL niet aanmaken");
    const signedUrl = urlData.signedUrl;

    if (type === "graderingstabel") {
      // Parse the grading table first before applying
      setPendingGradingUrl(signedUrl);
      setParsingGrading(true);
      try {
        const aiProvider = (project as any)?.ai_provider || "lovable";
        const { data, error } = await invokeEdgeFunction("parse-grading-table", {
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

      // Auto-extract education context if not yet set
      if (!(project as any).education_context) {
        extractEducationContext(signedUrl);
      }
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

  const ACCEPTED_DOC_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

  const uploadStudentPdfs = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED_DOC_TYPES.includes(file.type) && !file.name.match(/\.(pdf|docx|doc)$/i)) {
          toast.error(`${file.name} is geen PDF of Word-bestand`);
          continue;
        }
        const naam = extractStudentName(file.name);
        const path = `${user!.id}/${id}/students/${Date.now()}_${file.name}`;
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

  // Auto-extract education context from assignment
  const [extractedContext, setExtractedContext] = useState<string | null>(null);
  const [extractingContext, setExtractingContext] = useState(false);

  const extractEducationContext = async (pdfUrl: string) => {
    setExtractingContext(true);
    try {
      const { data, error } = await invokeEdgeFunction("extract-context", {
        body: { pdfUrl },
      });
      if (error || !data?.context) return;
      setExtractedContext(data.context);
      toast.info("Onderwijscontext geëxtraheerd uit de opdracht — bekijk de suggestie bij Instellingen.", { duration: 5000 });
    } catch {
      // Silent fail — extraction is a nice-to-have
    } finally {
      setExtractingContext(false);
    }
  };

  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [reAnalyzeNiveau, setReAnalyzeNiveau] = useState("streng");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [queuedStudentIds, setQueuedStudentIds] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);
  const activeStudentsRef = useRef<Set<string>>(new Set());
  const studentStartTimesRef = useRef<Map<string, number>>(new Map());

  // Retry wrapper for transient errors
  const invokeWithRetry = async (
    fnName: string,
    options: { body: Record<string, unknown> },
    maxRetries = 1
  ) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { error, data } = await invokeEdgeFunction(fnName, options);
      if (!error) return { error: null, data };
      const msg = typeof error === "string" ? error : (error as any)?.message || "";
      const isTransient =
        msg.includes("timeout") || msg.includes("503") || msg.includes("429") || msg.includes("FetchError") || msg.includes("Failed to fetch");
      if (!isTransient || attempt === maxRetries) return { error, data: null };
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { error: new Error("Max retries exceeded"), data: null };
  };

  // Debounced query invalidation
  const lastInvalidateRef = useRef(0);
  const debouncedInvalidateStudents = () => {
    const now = Date.now();
    if (now - lastInvalidateRef.current > 500) {
      lastInvalidateRef.current = now;
      queryClient.invalidateQueries({ queryKey: ["students", id] });
    }
  };

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
    activeStudentsRef.current.clear();
    studentStartTimesRef.current.clear();
    setQueuedStudentIds(new Set(eligible.map((s) => s.id)));

    // Concurrency based on provider
    const providerSetting = (project as any)?.ai_provider || "lovable";
    const concurrency = providerSetting.includes("gemini") ? 5 : 3;

    const progress: BatchProgress = {
      total: eligible.length,
      completed: 0,
      failed: 0,
      currentStudentName: eligible.slice(0, concurrency).map((s) => s.naam).join(", "),
      failedNames: [],
      startTime: Date.now(),
      studentTimes: [],
      concurrency,
    };
    setBatchProgress({ ...progress });

    // grading_status is now set per-student in the worker to avoid showing all as "analyzing"

    let successCount = 0;
    let failCount = 0;
    const failedNames: string[] = [];
    const times: number[] = [];

    await concurrencyPool(
      eligible,
      concurrency,
      async (student) => {
        if (cancelRef.current) throw new Error("cancelled");

        // Remove from queue, track as active
        setQueuedStudentIds((prev) => { const next = new Set(prev); next.delete(student.id); return next; });
        activeStudentsRef.current.add(student.naam);
        studentStartTimesRef.current.set(student.id, Date.now());
        progress.currentStudentName = Array.from(activeStudentsRef.current).join(", ");
        setBatchProgress({ ...progress });

        // Mark analyzing
        await supabase.from("students").update({ status: "analyzing" as StudentStatus, grading_status: "grading" } as any).eq("id", student.id);
        debouncedInvalidateStudents();

        const t0 = Date.now();
        try {
          const { error } = await invokeWithRetry("analyze-student", {
            body: { studentId: student.id, projectId: id, ...extraBody },
          });
          const elapsed = Date.now() - t0;

          if (error) {
            await supabase.from("students").update({ status: "pending" as StudentStatus, grading_status: "failed" } as any).eq("id", student.id);
            throw error;
          }

          await supabase.from("students").update({ status: "reviewed" as StudentStatus, grading_status: "completed" } as any).eq("id", student.id);
          return { studentId: student.id, elapsed };
        } finally {
          activeStudentsRef.current.delete(student.naam);
          studentStartTimesRef.current.delete(student.id);
          progress.currentStudentName = Array.from(activeStudentsRef.current).join(", ") || "Afronden...";
          setBatchProgress({ ...progress });
        }
      },
      (_completed, _total, result, index) => {
        if (result) {
          successCount++;
          times.push(result.elapsed);
        } else {
          failCount++;
          failedNames.push(eligible[index].naam);
        }

        progress.completed = successCount;
        progress.failed = failCount;
        progress.failedNames = [...failedNames];
        progress.studentTimes = [...times];
        // currentStudentName is managed by activeStudentsRef in the worker
        setBatchProgress({ ...progress });
        debouncedInvalidateStudents();
      },
      () => cancelRef.current
    );

    setBatchProgress(null);
    setRunning(false);
    setQueuedStudentIds(new Set());

    // Final invalidation
    queryClient.invalidateQueries({ queryKey: ["students", id] });

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

    // Auto-trigger plagiarism check after batch analysis if 2+ students succeeded
    if (successCount >= 2) {
      invokeEdgeFunction("check-plagiarism", {
        body: {
          projectId: id,
          method: "tfidf",
          threshold: (project as any)?.similarity_threshold ?? 70,
        },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["plagiarism", id] });
      }).catch(() => {
        // Silent — plagiarism check is a post-step
      });
    }
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
  const docsUploaded = (project.opdracht_pdf_url ? 1 : 0) + (project.graderingstabel_pdf_url ? 1 : 0);

  // Auto-open documenten section if docs are missing
  useEffect(() => {
    if (docsUploaded < 2 && !sectionStates.documenten) {
      updateSectionState("documenten", true);
    }
  }, [docsUploaded]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <main className="container mx-auto px-6 py-8 space-y-4">
        {/* ── Section 1: Instellingen ── */}
        <Collapsible
          open={sectionStates.instellingen}
          onOpenChange={(open) => updateSectionState("instellingen", open)}
        >
          <Card>
            <CollapsibleTrigger asChild className="group">
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Instellingen
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {(() => {
                      const p = (project as any).ai_provider || "lovable";
                      if (p === "lovable-pro") return "Uitgebreid";
                      if (p === "anthropic") return "Premium";
                      return "Snel";
                    })()}
                  </Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* AI Kwaliteit */}
                  <div className="lg:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      AI Kwaliteit
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                            De AI-kwaliteit bepaalt hoe grondig studentwerk wordt geanalyseerd. 'Snel' is voldoende voor de meeste opdrachten.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "lovable", label: "Snel", subtitle: "Snelle beoordeling, geschikt voor de meeste opdrachten", Icon: Zap },
                        { value: "lovable-pro", label: "Uitgebreid", subtitle: "Grondiger analyse, ideaal voor complexe opdrachten", Icon: Brain },
                        { value: "anthropic", label: "Premium", subtitle: "Meest nauwkeurige beoordeling, duurt iets langer", Icon: Sparkles },
                      ] as const).map(({ value, label, subtitle, Icon }) => {
                        const currentProvider = (project as any).ai_provider || "lovable";
                        const isSelected = currentProvider === value || (currentProvider === "gemini" && value === "lovable");
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateProject.mutateAsync({ ai_provider: value })}
                            className={`relative rounded-lg border-2 p-2.5 text-left transition-all hover:border-primary/60 ${
                              isSelected ? "border-primary bg-primary/5" : "border-border"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                              <span className="text-xs font-semibold text-foreground">{label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">{subtitle}</p>
                            {isSelected && (
                              <span className="absolute top-1 right-1 text-[8px] bg-primary text-primary-foreground px-1 py-0.5 rounded">Actief</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Beoordelingsperspectief */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Beoordelingsperspectief</label>
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
                  </div>

                  {/* Feedbacktaal */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Feedbacktaal</label>
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
                    <p className="text-[10px] text-muted-foreground">De taal waarin de AI feedback schrijft</p>
                  </div>
                </div>

                {/* Onderwijscontext */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    Onderwijscontext (optioneel)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">
                          De AI gebruikt deze context als achtergrondinformatie bij het schrijven van feedback.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <textarea
                    className="w-full min-h-[60px] text-sm rounded-md border border-input bg-muted/30 px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Bv: Bacheloropleiding kleuteronderwijs, 2e jaar. Studenten schrijven een reflectieverslag over hun stage-ervaring."
                    defaultValue={(project as any).education_context || ""}
                    maxLength={500}
                    onBlur={(e) => {
                      const val = e.target.value.trim().slice(0, 500);
                      if (val !== ((project as any).education_context || "")) {
                        updateProject.mutateAsync({ education_context: val || null } as any);
                        toast.success("Onderwijscontext opgeslagen");
                      }
                    }}
                    onInput={(e) => {
                      const el = e.target as HTMLTextAreaElement;
                      const counter = el.parentElement?.querySelector('[data-counter]');
                      if (counter) counter.textContent = `${el.value.length} / 500`;
                    }}
                  />
                  <div className="flex justify-between">
                    <p className="text-[10px] text-muted-foreground">Helpt de AI om feedback beter af te stemmen op het niveau.</p>
                    <span data-counter className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {((project as any).education_context || "").length} / 500
                    </span>
                  </div>
                  {extractingContext && (
                    <p className="text-xs text-primary flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Onderwijscontext wordt geëxtraheerd uit de opdracht...
                    </p>
                  )}
                  {extractedContext && !(project as any).education_context && (
                    <div className="p-2.5 rounded-md border border-primary/30 bg-primary/5 space-y-2">
                      <p className="text-xs font-medium text-primary">Suggestie uit opdracht:</p>
                      <p className="text-xs text-foreground">{extractedContext}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={async () => {
                          await updateProject.mutateAsync({ education_context: extractedContext } as any);
                          setExtractedContext(null);
                          toast.success("Onderwijscontext overgenomen");
                          queryClient.invalidateQueries({ queryKey: ["project", id] });
                        }}>
                          Overnemen
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExtractedContext(null)}>
                          Negeren
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── Section 2: Documenten ── */}
        <Collapsible
          open={sectionStates.documenten}
          onOpenChange={(open) => updateSectionState("documenten", open)}
        >
          <Card>
            <CollapsibleTrigger asChild className="group">
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Documenten
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CardTitle>
                  <Badge
                    variant={docsUploaded === 2 ? "default" : "destructive"}
                    className="text-[10px] font-normal"
                  >
                    {docsUploaded}/2 geüpload
                  </Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Opdracht PDF */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Opdracht
                    </div>
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
                      <Label htmlFor="opdracht-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground block text-center py-3 border border-dashed rounded-md">
                        Klik om te uploaden
                      </Label>
                    )}
                    <input id="opdracht-upload" type="file" accept=".pdf,.docx,.doc" className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0], "opdracht")} />
                  </div>

                  {/* Graderingstabel PDF */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <FolderOpen className="h-4 w-4" />
                      Graderingstabel
                    </div>
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
                      <Label htmlFor="graderingstabel-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground block text-center py-3 border border-dashed rounded-md">
                        Klik om te uploaden
                      </Label>
                    )}
                    <input id="graderingstabel-upload" type="file" accept=".pdf,.docx,.doc" className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0], "graderingstabel")} />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* AI Chat */}
        <GradingChat
          projectId={id!}
          onReAnalyzeRequested={() => doBatchReAnalyze()}
          onInstructionsCleared={() => queryClient.invalidateQueries({ queryKey: ["project", id] })}
          customInstructions={project?.custom_instructions}
        />

        {/* ── Section 3: Studenten ── */}
        <Collapsible
          open={sectionStates.studenten}
          onOpenChange={(open) => updateSectionState("studenten", open)}
        >
          <Card>
            <CollapsibleTrigger asChild className="group">
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Studenten
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {totalStudents} student{totalStudents !== 1 ? "en" : ""}
                  </Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {/* Action buttons */}
                {students && students.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b">
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
                            <Button variant="outline" size="sm" disabled={reAnalyzing || batchAnalyzing} onClick={batchReAnalyze}>
                              {reAnalyzing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                              {selectedStudents.size > 0 ? `Heranalyse (${selectedStudents.size})` : "Heranalyse"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Groep 2: Delen & Finaliseren */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sharingAll}
                        onClick={async () => {
                          const eligible = students?.filter((s) => s.status === "reviewed" || s.status === "graded") || [];
                          if (eligible.length === 0) { toast.info("Geen beoordeelde studenten om te delen"); return; }
                          setSharingAll(true);
                          try {
                            for (const s of eligible) {
                              if (!s.share_token) {
                                await supabase.from("students").update({ share_token: crypto.randomUUID(), share_enabled: true }).eq("id", s.id);
                              } else if (!s.share_enabled) {
                                await supabase.from("students").update({ share_enabled: true }).eq("id", s.id);
                              }
                            }
                            queryClient.invalidateQueries({ queryKey: ["students", id] });
                            toast.success(`Feedback gedeeld met ${eligible.length} student(en)`);
                          } catch { toast.error("Delen mislukt"); }
                          finally { setSharingAll(false); }
                        }}
                      >
                        {sharingAll ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Share2 className="h-4 w-4 mr-1.5" />}
                        Deel feedback met alle studenten
                      </Button>

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
                  </div>
                )}

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

                {/* Drag & drop zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                        Sleep PDF- of Word-bestanden hierheen of{" "}
                        <label htmlFor="student-upload" className="text-primary cursor-pointer hover:underline">blader</label>
                      </p>
                      <input id="student-upload" type="file" accept=".pdf,.docx,.doc" multiple className="hidden"
                        onChange={(e) => e.target.files && uploadStudentPdfs(e.target.files)} />
                    </>
                  )}
                </div>

                {/* Zoekbalk + Studenten tabel */}
                {students && students.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {students.length > 3 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Zoek student..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 max-w-xs" />
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedStudents.size === students.length && students.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedStudents(new Set(students.map((s) => s.id)));
                                else setSelectedStudents(new Set());
                              }}
                            />
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => {
                            if (sortColumn === "naam") setSortDirection(d => d === "asc" ? "desc" : "asc");
                            else { setSortColumn("naam"); setSortDirection("asc"); }
                          }}>
                            <span className="flex items-center gap-1">Student {sortColumn === "naam" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => {
                            if (sortColumn === "status") setSortDirection(d => d === "asc" ? "desc" : "asc");
                            else { setSortColumn("status"); setSortDirection("asc"); }
                          }}>
                            <span className="flex items-center gap-1">Status {sortColumn === "status" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => {
                            if (sortColumn === "score") setSortDirection(d => d === "asc" ? "desc" : "asc");
                            else { setSortColumn("score"); setSortDirection("desc"); }
                          }}>
                            <span className="flex items-center gap-1">Score {sortColumn === "score" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                          </TableHead>
                          <TableHead>Voortgang</TableHead>
                          <TableHead className="text-right">Acties</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students
                          .filter((s) => s.naam.toLowerCase().includes(searchQuery.toLowerCase()))
                          .sort((a, b) => {
                            if (!sortColumn) return 0;
                            const dir = sortDirection === "asc" ? 1 : -1;
                            if (sortColumn === "naam") return dir * a.naam.localeCompare(b.naam);
                            if (sortColumn === "status") {
                              const order: Record<string, number> = { pending: 0, analyzing: 1, reviewed: 2, graded: 3 };
                              return dir * ((order[a.status] ?? 0) - (order[b.status] ?? 0));
                            }
                            if (sortColumn === "score") return dir * ((getTotalScore(a) ?? -1) - (getTotalScore(b) ?? -1));
                            return 0;
                          })
                          .map((student) => {
                            const total = getTotalScore(student);
                            const max = getMaxTotal();
                            const missing = getMissingScores(student);
                            const isEditingSt = editingStudentId === student.id;
                            return (
                              <TableRow key={student.id} className={`cursor-pointer ${student.status === "graded" ? "bg-green-50/50 dark:bg-green-950/20" : ""}`} onClick={() => {
                                if (isEditingSt) return;
                                if (isReviewer) { setReviewStudentId(student.id); return; }
                                navigate(`/project/${id}/student/${student.id}`);
                              }}>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedStudents.has(student.id)}
                                    onCheckedChange={(checked) => {
                                      setSelectedStudents((prev) => {
                                        const next = new Set(prev);
                                        if (checked) next.add(student.id); else next.delete(student.id);
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {isEditingSt ? (
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <Input value={editStudentName} onChange={(e) => setEditStudentName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && renameStudent(student.id, editStudentName)} className="h-7 text-sm w-48" autoFocus />
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => renameStudent(student.id, editStudentName)}><Check className="h-3 w-3" /></Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingStudentId(null)}><X className="h-3 w-3" /></Button>
                                    </div>
                                  ) : student.naam}
                                </TableCell>
                                <TableCell>
                                  {student.status === "analyzing" ? (
                                    <StudentAnalyzingProgress studentId={student.id} startTimesRef={studentStartTimesRef}
                                      avgTime={batchProgress?.studentTimes && batchProgress.studentTimes.length > 0
                                        ? batchProgress.studentTimes.reduce((a, b) => a + b, 0) / batchProgress.studentTimes.length : 0} />
                                  ) : queuedStudentIds.has(student.id) ? (
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
                                      <span className="text-xs text-muted-foreground font-medium">Wachtrij</span>
                                    </div>
                                  ) : (
                                    <Badge variant={statusVariants[student.status as StudentStatus]}>
                                      {statusLabels[student.status as StudentStatus]}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {total !== null ? (
                                    <span className={missing.length > 0 ? "text-destructive font-semibold" : ""}>{total}/{max}</span>
                                  ) : "—"}
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const warnings: string[] = Array.isArray((student as any).ai_validation_warnings) ? (student as any).ai_validation_warnings : [];
                                    const hasWarnings = warnings.length > 0;
                                    const hasIssues = missing.length > 0 || hasWarnings;
                                    if (student.status === "pending") return <Circle className="h-4 w-4 text-muted-foreground" />;
                                    if (student.status === "analyzing") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
                                    if (hasIssues) {
                                      const tooltipLines = [...missing.map((m: any) => `Score ontbreekt: ${m.criterium_naam}`), ...warnings];
                                      return (
                                        <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                          <AlertTriangle className="h-4 w-4 text-yellow-500 cursor-help" />
                                        </TooltipTrigger><TooltipContent side="left" className="max-w-xs">
                                          <ul className="text-xs space-y-0.5">{tooltipLines.map((line, i) => (
                                            <li key={i} className="flex items-start gap-1"><span className="text-yellow-500 mt-0.5">•</span><span>{line}</span></li>
                                          ))}</ul>
                                        </TooltipContent></Tooltip></TooltipProvider>
                                      );
                                    }
                                    if (student.status === "graded") return <CheckCircle className="h-4 w-4 text-green-600" />;
                                    return <Circle className="h-4 w-4 text-yellow-500" />;
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button size="sm" variant="outline"
                                      disabled={!project.opdracht_pdf_url || !project.graderingstabel_pdf_url || student.status === "analyzing"}
                                      onClick={() => runBatchSequential([student], {}, setBatchAnalyzing)}>
                                      <Bot className="h-4 w-4 mr-1" />Analyseer
                                    </Button>
                                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShareStudent(student)}>
                                        <Share2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger><TooltipContent><span className="text-xs">Deel feedback</span></TooltipContent></Tooltip></TooltipProvider>
                                    <Button size="icon" variant="ghost" className="h-8 w-8"
                                      onClick={() => { setEditingStudentId(student.id); setEditStudentName(student.naam); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {deletingStudentId === student.id ? (
                                      <div className="flex items-center gap-1">
                                        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => deleteStudent(student.id)}>Bevestig</Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeletingStudentId(null)}><X className="h-3.5 w-3.5" /></Button>
                                      </div>
                                    ) : (
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => setDeletingStudentId(student.id)}>
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
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              Geen studenten gevonden voor "{searchQuery}"
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Moderation tab (owner only, when reviewers exist) */}
        {isOwner && hasReviewers && students && criteria && (
          <ModerationTab projectId={id!} students={students} criteria={criteria} />
        )}

        {/* Studentreacties tab */}
        {isOwner && students && students.length > 0 && criteria && criteria.length > 0 && (
          <StudentReactionsTab projectId={id!} students={students} criteria={criteria} />
        )}

        {/* Plagiarism check tab */}
        {isOwner && students && students.length >= 2 && (
          <PlagiarismTab
            projectId={id!}
            threshold={(project as any).similarity_threshold ?? 70}
            onThresholdChange={async (val) => {
              await supabase.from("projects").update({ similarity_threshold: val } as any).eq("id", id!);
              queryClient.invalidateQueries({ queryKey: ["project", id] });
            }}
          />
        )}
      </main>

      {/* Reviewer review overlay */}
      {reviewStudentId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-8 max-w-4xl h-full overflow-y-auto">
            <StudentReviewView
              studentId={reviewStudentId}
              projectId={id!}
              onBack={() => {
                setReviewStudentId(null);
                queryClient.invalidateQueries({ queryKey: ["students", id] });
              }}
            />
          </div>
        </div>
      )}

      {/* Invite reviewer dialog */}
      <InviteReviewerDialog
        projectId={id!}
        projectName={project?.naam || ""}
        open={showInviteReviewer}
        onOpenChange={setShowInviteReviewer}
      />

      {/* Share feedback dialog */}
      <ShareFeedbackDialog
        open={!!shareStudent}
        onOpenChange={(open) => !open && setShareStudent(null)}
        student={shareStudent}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["students", id] });
          // Refresh the student object in dialog
          if (shareStudent && students) {
            const fresh = students.find((s) => s.id === shareStudent.id);
            if (fresh) setShareStudent({ ...fresh });
          }
        }}
      />

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

      {/* AI Quality Picker Dialog */}
      <Dialog open={showModelPicker} onOpenChange={(open) => {
        if (!open) {
          setShowModelPicker(false);
          setPendingGradingFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Kies AI Kwaliteit
            </DialogTitle>
            <DialogDescription>
              {modelPickerAction === "grading"
                ? "Welke AI-kwaliteit wil je gebruiken om de graderingstabel te analyseren?"
                : "Welke AI-kwaliteit wil je gebruiken voor de analyse van de studenten?"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {([
              { value: "lovable", label: "Snel", subtitle: "Snelle beoordeling, geschikt voor de meeste opdrachten", Icon: Zap, features: ["Snel & voordelig", "Goed voor standaard opdrachten", "Beste prijs-kwaliteit"] },
              { value: "lovable-pro", label: "Uitgebreid", subtitle: "Grondiger analyse, ideaal voor complexe opdrachten", Icon: Brain, features: ["Diepgaandere analyse", "Complexe teksten beter begrepen", "Nauwkeuriger bij nuance"] },
              { value: "anthropic", label: "Premium", subtitle: "Meest nauwkeurige beoordeling, duurt iets langer", Icon: Sparkles, features: ["Meest nauwkeurig", "Gedetailleerdste feedback", "Sterkst in complexe analyses"] },
            ] as const).map(({ value, label, subtitle, Icon, features }) => {
              const currentProvider = (project as any)?.ai_provider || "lovable";
              const isSelected = currentProvider === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleModelPickerConfirm(value)}
                  className={`relative rounded-lg border-2 p-4 text-left transition-all hover:border-primary/60 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-semibold text-foreground">{label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{subtitle}</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {features.map((f, i) => (
                      <li key={i}>✦ {f}</li>
                    ))}
                  </ul>
                  {isSelected && (
                    <span className="absolute top-2 right-2 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Huidig</span>
                  )}
                </button>
              );
            })}
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

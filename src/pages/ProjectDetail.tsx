import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, FileText, Pencil, Check, X, Loader2, Bot, Download, Settings, LayoutGrid, RefreshCw, AlertTriangle, Users, FolderOpen, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { exportProjectToExcel } from "@/lib/export";
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
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState("");

  // Grading table parse state
  const [parsingGrading, setParsingGrading] = useState(false);
  const [parsedCriteria, setParsedCriteria] = useState<any[] | null>(null);
  const [parsedSamenvatting, setParsedSamenvatting] = useState("");
  const [pendingGradingUrl, setPendingGradingUrl] = useState<string | null>(null);
  const [showGradingDialog, setShowGradingDialog] = useState(false);
  const [applyingCriteria, setApplyingCriteria] = useState(false);

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
    const path = `${id}/${type}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    if (type === "graderingstabel") {
      // Parse the grading table first before applying
      setPendingGradingUrl(publicUrl);
      setParsingGrading(true);
      try {
        const { data, error } = await supabase.functions.invoke("parse-grading-table", {
          body: { graderingstabelUrl: publicUrl },
        });
        if (error) throw error;
        setParsedCriteria(data.criteria || []);
        setParsedSamenvatting(data.samenvatting || "");
        setShowGradingDialog(true);
      } catch (err: any) {
        toast.error("Kon graderingstabel niet analyseren: " + (err?.message || "onbekende fout"));
        // Still save the URL even if parsing fails
        await updateProject.mutateAsync({ graderingstabel_pdf_url: publicUrl });
      } finally {
        setParsingGrading(false);
      }
    } else {
      await updateProject.mutateAsync({ opdracht_pdf_url: publicUrl });
      toast.success("Opdracht geüpload");
    }
  };

  const applyNewCriteria = async () => {
    if (!parsedCriteria || !pendingGradingUrl) return;
    setApplyingCriteria(true);
    try {
      // Save grading table URL
      await updateProject.mutateAsync({ graderingstabel_pdf_url: pendingGradingUrl });

      // Delete old criteria (cascades to scores via foreign key? no — delete scores manually)
      if (criteria && criteria.length > 0) {
        const criteriaIds = criteria.map((c) => c.id);
        await supabase.from("student_scores").delete().in("criterium_id", criteriaIds);
        await supabase.from("grading_criteria").delete().eq("project_id", id!);
      }

      // Insert new criteria
      const criteriaToInsert = parsedCriteria.map((c: any, i: number) => ({
        project_id: id!,
        criterium_naam: c.naam,
        max_score: c.max_score || 10,
        volgorde: i,
      }));
      await supabase.from("grading_criteria").insert(criteriaToInsert);

      queryClient.invalidateQueries({ queryKey: ["criteria", id] });
      queryClient.invalidateQueries({ queryKey: ["students", id] });

      setShowGradingDialog(false);
      toast.success("Nieuwe criteria toegepast! Heranalyse wordt gestart...");

      // Re-analyze all students that have a PDF
      const studentsWithPdf = students?.filter((s) => s.pdf_url) || [];
      if (studentsWithPdf.length > 0) {
        setBatchAnalyzing(true);
        let success = 0;
        let failed = 0;
        for (const student of studentsWithPdf) {
          try {
            await supabase.from("students").update({ status: "analyzing" as StudentStatus }).eq("id", student.id);
            queryClient.invalidateQueries({ queryKey: ["students", id] });
            const { error } = await supabase.functions.invoke("analyze-student", {
              body: { studentId: student.id, projectId: id },
            });
            if (error) throw error;
            success++;
          } catch {
            failed++;
          }
          queryClient.invalidateQueries({ queryKey: ["students", id] });
        }
        setBatchAnalyzing(false);
        queryClient.invalidateQueries({ queryKey: ["students", id] });
        toast.success(`Heranalyse klaar: ${success} geslaagd${failed > 0 ? `, ${failed} mislukt` : ""}`);
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
        const naam = file.name.replace(/\.pdf$/i, "");
        const path = `${id}/students/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("pdfs").upload(path, file);
        if (uploadError) {
          toast.error(`Upload mislukt: ${file.name}`);
          continue;
        }
        const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(path);
        const { error: insertError } = await supabase
          .from("students")
          .insert({ project_id: id!, naam, pdf_url: urlData.publicUrl });
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

  const analyzeStudent = useMutation({
    mutationFn: async (studentId: string) => {
      await supabase.from("students").update({ status: "analyzing" as StudentStatus }).eq("id", studentId);
      queryClient.invalidateQueries({ queryKey: ["students", id] });

      const { data, error } = await supabase.functions.invoke("analyze-student", {
        body: { studentId, projectId: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      toast.success("Analyse voltooid!");
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      toast.error(err?.message || "Analyse mislukt");
    },
  });

  const batchAnalyze = async () => {
    const pending = students?.filter((s) => s.status === "pending" || s.status === "reviewed") || [];
    if (pending.length === 0) {
      toast.info("Geen studenten om te analyseren");
      return;
    }
    setBatchAnalyzing(true);
    let success = 0;
    let failed = 0;
    for (const student of pending) {
      try {
        await supabase.from("students").update({ status: "analyzing" as StudentStatus }).eq("id", student.id);
        queryClient.invalidateQueries({ queryKey: ["students", id] });
        const { error } = await supabase.functions.invoke("analyze-student", {
          body: { studentId: student.id, projectId: id },
        });
        if (error) throw error;
        success++;
      } catch {
        failed++;
      }
      queryClient.invalidateQueries({ queryKey: ["students", id] });
    }
    setBatchAnalyzing(false);
    queryClient.invalidateQueries({ queryKey: ["students", id] });
    toast.success(`Batch analyse klaar: ${success} geslaagd${failed > 0 ? `, ${failed} mislukt` : ""}`);
  };

  const batchReAnalyze = async () => {
    const eligible = students?.filter((s) => s.status === "reviewed" || s.status === "graded") || [];
    if (eligible.length === 0) {
      toast.info("Geen geanalyseerde studenten om opnieuw te beoordelen");
      return;
    }
    setReAnalyzing(true);
    let success = 0;
    let failed = 0;
    for (const student of eligible) {
      try {
        await supabase.from("students").update({ status: "analyzing" as StudentStatus }).eq("id", student.id);
        queryClient.invalidateQueries({ queryKey: ["students", id] });
        const { error } = await supabase.functions.invoke("analyze-student", {
          body: { studentId: student.id, projectId: id, niveauOverride: reAnalyzeNiveau },
        });
        if (error) throw error;
        success++;
      } catch {
        failed++;
      }
      queryClient.invalidateQueries({ queryKey: ["students", id] });
    }
    setReAnalyzing(false);
    queryClient.invalidateQueries({ queryKey: ["students", id] });
    toast.success(`Heranalyse klaar: ${success} geslaagd${failed > 0 ? `, ${failed} mislukt` : ""}`);
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

  const getTotalScore = (student: any) => {
    const scores = student.student_scores || [];
    const finals = scores.map((s: any) => s.final_score).filter(Boolean);
    if (finals.length === 0) return null;
    return finals.reduce((a: number, b: number) => a + b, 0);
  };

  const getMaxTotal = () => {
    if (!criteria) return 0;
    return criteria.reduce((a, c) => a + Number(c.max_score), 0);
  };

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

  return (
    <div className="min-h-screen bg-background">
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
                    onClick={() => exportProjectToExcel(project, students, criteria)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Project configuratie: instellingen + documenten in één rij */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          {/* Opdracht PDF */}
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
                      onClick={batchAnalyze}
                    >
                      {batchAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                      Analyseer alle
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
                            Heranalyse
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
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
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students
                      .filter((s) => s.naam.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((student) => {
                        const total = getTotalScore(student);
                        const max = getMaxTotal();
                        return (
                          <TableRow key={student.id} className="cursor-pointer" onClick={() => navigate(`/project/${id}/student/${student.id}`)}>
                            <TableCell className="font-medium">{student.naam}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariants[student.status as StudentStatus]}>
                                {student.status === "analyzing" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                {statusLabels[student.status as StudentStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {total !== null ? `${total}/${max}` : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!project.opdracht_pdf_url || !project.graderingstabel_pdf_url || student.status === "analyzing"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  analyzeStudent.mutate(student.id);
                                }}
                              >
                                <Bot className="h-4 w-4 mr-1" />
                                Analyseer
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {students.filter((s) => s.naam.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
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

      {/* PDF Viewer Dialog */}
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

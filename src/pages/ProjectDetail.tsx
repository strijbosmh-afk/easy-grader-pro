import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, FileText, Pencil, Check, X, Loader2, Bot, Download, Settings, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportProjectToExcel } from "@/lib/export";

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
    const field = type === "opdracht" ? "opdracht_pdf_url" : "graderingstabel_pdf_url";
    await updateProject.mutateAsync({ [field]: urlData.publicUrl });
    toast.success(`${type === "opdracht" ? "Opdracht" : "Graderingstabel"} geüpload`);
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
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-3">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug
          </Button>
          <div className="flex items-center gap-3">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  className="text-xl font-bold h-9"
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
          </div>
          {totalStudents > 0 && (
            <div className="mt-3 max-w-md">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Voortgang</span>
                <span>{gradedCount}/{totalStudents} beoordeeld</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Settings row */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Beoordelingsperspectief
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={(project as any).beoordelingsniveau || "streng"}
              onValueChange={(value) => updateProject.mutateAsync({ beoordelingsniveau: value })}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streng">Streng — kritisch, hoge lat</SelectItem>
                <SelectItem value="neutraal">Neutraal — evenwichtig</SelectItem>
                <SelectItem value="mild">Mild — stimulerend, positief</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Bepaalt hoe kritisch de AI studenten beoordeelt.
            </p>
          </CardContent>
        </Card>

        {/* PDF uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opdracht PDF</CardTitle>
            </CardHeader>
            <CardContent>
              {project.opdracht_pdf_url ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <a href={project.opdracht_pdf_url} target="_blank" className="text-sm text-primary hover:underline truncate">
                    Bekijk opdracht
                  </a>
                  <Label htmlFor="opdracht-upload" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground ml-auto">
                    Vervang
                  </Label>
                </div>
              ) : (
                <Label htmlFor="opdracht-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Graderingstabel PDF</CardTitle>
            </CardHeader>
            <CardContent>
              {project.graderingstabel_pdf_url ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <a href={project.graderingstabel_pdf_url} target="_blank" className="text-sm text-primary hover:underline truncate">
                    Bekijk graderingstabel
                  </a>
                  <Label htmlFor="graderingstabel-upload" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground ml-auto">
                    Vervang
                  </Label>
                </div>
              ) : (
                <Label htmlFor="graderingstabel-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
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

        {/* Drag & drop zone */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Studenten</CardTitle>
              <div className="flex gap-2">
                {students && students.length > 0 && criteria && criteria.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/project/${id}/overzicht`)}
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Scoreoverzicht
                  </Button>
                )}
                {students && students.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={batchAnalyzing || !project.opdracht_pdf_url || !project.graderingstabel_pdf_url}
                    onClick={batchAnalyze}
                  >
                    {batchAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                    Analyseer Alle
                  </Button>
                )}
                {students && students.length > 0 && criteria && criteria.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportProjectToExcel(project, students, criteria)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
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
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
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

            {students && students.length > 0 && (
              <Table className="mt-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
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
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProjectDetail;

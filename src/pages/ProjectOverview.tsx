import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Users, Download, Beaker } from "lucide-react";
import { exportProjectToExcel } from "@/lib/export";

const ProjectOverview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
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

  const { data: students, isLoading } = useQuery({
    queryKey: ["students-overview", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, student_scores(criterium_id, ai_suggested_score, final_score)")
        .eq("project_id", id!)
        .order("naam", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const eindscoreCriterium = criteria?.find((c: any) => c.is_eindscore);

  const getScore = (student: any, criteriumId: string) => {
    const sc = student.student_scores?.find((s: any) => s.criterium_id === criteriumId);
    if (!sc) return null;
    return sc.final_score ?? sc.ai_suggested_score ?? null;
  };

  const getTotal = (student: any) => {
    if (eindscoreCriterium) {
      return getScore(student, eindscoreCriterium.id);
    }
    if (!criteria) return null;
    let sum = 0;
    let hasAny = false;
    for (const c of criteria) {
      const score = getScore(student, c.id);
      if (score !== null) {
        sum += Number(score);
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  };

  const getMaxTotal = () => {
    if (eindscoreCriterium) return Number(eindscoreCriterium.max_score);
    if (!criteria) return 0;
    return criteria.reduce((a, c) => a + Number(c.max_score), 0);
  };

  const getPercentage = (student: any) => {
    const total = getTotal(student);
    const max = getMaxTotal();
    if (total === null || max === 0) return null;
    return Math.round((total / max) * 100);
  };

  const getScoreColor = (score: number | null, max: number) => {
    if (score === null) return "";
    // Negative scores (penalty criteria) always shown in red with a distinct style
    if (score < 0) return "text-destructive font-bold";
    const pct = (score / max) * 100;
    if (pct >= 80) return "text-green-600 dark:text-green-400 font-semibold";
    if (pct >= 60) return "text-foreground";
    if (pct >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-destructive font-semibold";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const maxTotal = getMaxTotal();

  // Compute class averages
  const classAverages = criteria?.map((c) => {
    const scores = students
      ?.map((s) => getScore(s, c.id))
      .filter((v): v is number => v !== null) || [];
    return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  });

  const totalAvg = students
    ?.map(getTotal)
    .filter((v): v is number => v !== null);
  const classTotal = totalAvg && totalAvg.length > 0
    ? (totalAvg.reduce((a, b) => a + b, 0) / totalAvg.length)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${id}`)} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Terug naar project
            </Button>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              Scoreoverzicht — {project?.naam}
              {(project as any)?.is_demo && (
                <Badge variant="outline" className="text-xs"><Beaker className="h-3 w-3 mr-1" />Demo</Badge>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {students?.length || 0} studenten · {criteria?.length || 0} criteria · Max {maxTotal} punten
            </p>
          </div>
          {students && students.length > 0 && criteria && criteria.length > 0 && (
            <Button
              variant="outline"
              onClick={() => exportProjectToExcel(project!, students, criteria)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          )}
        </div>

        {!criteria || criteria.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nog geen beoordelingscriteria. Analyseer eerst een student.</p>
            </CardContent>
          </Card>
        ) : !students || students.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nog geen studenten in dit project.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[160px]">Student</TableHead>
                      {criteria.map((c) => (
                        <TableHead key={c.id} className="text-center min-w-[100px]">
                          <div className="text-xs leading-tight">
                            {c.criterium_naam}
                            <br />
                            <span className="text-muted-foreground font-normal">/{c.max_score}</span>
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="text-center min-w-[80px] font-bold">
                        Totaal
                        <br />
                        <span className="text-muted-foreground font-normal text-xs">/{maxTotal}</span>
                      </TableHead>
                      <TableHead className="text-center min-w-[60px]">%</TableHead>
                      <TableHead className="text-center min-w-[90px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => {
                      const total = getTotal(student);
                      const pct = getPercentage(student);
                      return (
                        <TableRow
                          key={student.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/project/${id}/student/${student.id}`)}
                        >
                          <TableCell className="sticky left-0 bg-card z-10 font-medium">
                            {student.naam}
                          </TableCell>
                          {criteria.map((c) => {
                            const score = getScore(student, c.id);
                            return (
                              <TableCell
                                key={c.id}
                                className={`text-center ${getScoreColor(score, Number(c.max_score))}`}
                              >
                                {score !== null ? (Number(score) < 0 ? `${Number(score).toFixed(1)} ⚠` : Number(score) % 1 === 0 ? Number(score).toString() : Number(score).toFixed(1)) : "—"}
                              </TableCell>
                            );
                          })}
                          <TableCell className={`text-center font-bold ${total !== null ? getScoreColor(total, maxTotal) : ""}`}>
                            {total !== null ? total.toFixed(1) : "—"}
                          </TableCell>
                          <TableCell className={`text-center ${pct !== null ? (pct >= 60 ? "text-green-600 dark:text-green-400" : "text-destructive") : ""}`}>
                            {pct !== null ? `${pct}%` : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={student.status === "graded" ? "default" : student.status === "reviewed" ? "outline" : "secondary"}
                              className="text-xs"
                            >
                              {student.status === "graded" ? "Beoordeeld" : student.status === "reviewed" ? "Te beoordelen" : student.status === "analyzing" ? "Bezig..." : "Wacht"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {/* Class average row */}
                    <TableRow className="bg-muted/30 border-t-2 font-semibold">
                      <TableCell className="sticky left-0 bg-muted/30 z-10 text-muted-foreground italic">
                        Klasgemiddelde
                      </TableCell>
                      {classAverages?.map((avg, i) => (
                        <TableCell key={i} className="text-center text-muted-foreground">
                          {avg !== null ? avg.toFixed(1) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-center text-muted-foreground">
                        {classTotal !== null ? classTotal.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {classTotal !== null && maxTotal > 0 ? `${Math.round((classTotal / maxTotal) * 100)}%` : "—"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProjectOverview;

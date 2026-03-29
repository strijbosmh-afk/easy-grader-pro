import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";

interface Props {
  projectId: string;
  students: any[];
  criteria: any[];
}

export function ModerationTab({ projectId, students, criteria }: Props) {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [finalScores, setFinalScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fetch all reviews for this project
  const { data: allReviews } = useQuery({
    queryKey: ["project-reviews", projectId],
    queryFn: async () => {
      const scoreIds = students.flatMap((s) =>
        (s.student_scores || []).map((sc: any) => sc.id)
      );
      if (scoreIds.length === 0) return [];
      // Batch in chunks of 100
      const results: any[] = [];
      for (let i = 0; i < scoreIds.length; i += 100) {
        const chunk = scoreIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("score_reviews")
          .select("*")
          .in("student_score_id", chunk);
        if (!error && data) results.push(...data);
      }
      // Fetch reviewer profiles
      const reviewerIds = [...new Set(results.map((r) => r.reviewer_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", reviewerIds);
      return results.map((r) => ({
        ...r,
        reviewer: profiles?.find((p: any) => p.id === r.reviewer_id),
      }));
    },
    enabled: students.length > 0,
  });

  const getStudentReviewSummary = (student: any) => {
    const scores = student.student_scores || [];
    const scoreIds = scores.map((s: any) => s.id);
    const reviews = (allReviews || []).filter((r: any) => scoreIds.includes(r.student_score_id));
    const totalCriteria = criteria.filter((c) => !c.is_eindscore).length;
    const reviewed = reviews.length;
    const adjusted = reviews.filter((r: any) => r.status === "adjusted").length;

    let statusVariant: "secondary" | "default" | "outline" | "destructive" = "secondary";
    let statusText = "Niet beoordeeld";
    if (reviewed === 0) {
      statusVariant = "secondary";
      statusText = "Niet beoordeeld";
    } else if (adjusted > 0) {
      statusVariant = "outline";
      statusText = `${adjusted} aanpassing${adjusted > 1 ? "en" : ""}`;
    } else {
      statusVariant = "default";
      statusText = "Goedgekeurd";
    }

    return { reviewed, totalCriteria, adjusted, statusVariant, statusText };
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedScores = selectedStudent?.student_scores || [];
  const selectedReviews = (allReviews || []).filter((r: any) =>
    selectedScores.some((s: any) => s.id === r.student_score_id)
  );

  const openComparison = (studentId: string) => {
    setSelectedStudentId(studentId);
    // Initialize final scores from existing
    const student = students.find((s) => s.id === studentId);
    const init: Record<string, string> = {};
    for (const sc of student?.student_scores || []) {
      init[sc.id] = sc.final_score?.toString() ?? sc.ai_suggested_score?.toString() ?? "";
    }
    setFinalScores(init);
  };

  const finalize = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      for (const sc of selectedScores) {
        const val = finalScores[sc.id];
        if (val !== undefined && val !== "") {
          await supabase.from("student_scores")
            .update({
              final_score: parseFloat(val),
              review_status: "approved",
            } as any)
            .eq("id", sc.id);
        }
      }
      await supabase.from("students")
        .update({ status: "graded" as any })
        .eq("id", selectedStudentId!);

      queryClient.invalidateQueries({ queryKey: ["students", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-reviews", projectId] });
      setSelectedStudentId(null);
      toast.success("Scores gefinaliseerd!");
    } catch {
      toast.error("Finaliseren mislukt");
    } finally {
      setSaving(false);
    }
  };

  const studentsWithScores = students.filter((s) => (s.student_scores || []).length > 0);

  if (studentsWithScores.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nog geen studenten met scores om te modereren.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Moderatie overzicht
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-center">Beoordeeld</TableHead>
                <TableHead className="text-center">Aanpassingen</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsWithScores.map((student) => {
                const summary = getStudentReviewSummary(student);
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.naam}</TableCell>
                    <TableCell className="text-center text-sm">
                      {summary.reviewed}/{summary.totalCriteria}
                    </TableCell>
                    <TableCell className="text-center">
                      {summary.adjusted > 0 ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px]">
                          {summary.adjusted}
                        </Badge>
                      ) : "–"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={summary.statusVariant} className="text-[10px]">
                        {summary.statusText}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openComparison(student.id)}
                      >
                        Bekijk
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Side-by-side comparison dialog */}
      <Dialog open={!!selectedStudentId} onOpenChange={(open) => !open && setSelectedStudentId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Moderatie: {selectedStudent?.naam}
            </DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Criterium</TableHead>
                <TableHead className="text-center">AI Score</TableHead>
                <TableHead className="text-center">Reviewer</TableHead>
                <TableHead>Toelichting</TableHead>
                <TableHead className="text-center w-24">Definitief</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criteria.filter((c) => !c.is_eindscore).map((crit) => {
                const sc = selectedScores.find((s: any) => s.criterium_id === crit.id);
                if (!sc) return null;
                const review = selectedReviews.find((r: any) => r.student_score_id === sc.id);
                const aiScore = sc.ai_suggested_score;
                const reviewerScore = review?.adjusted_score ?? (review?.status === "approved" ? aiScore : null);

                return (
                  <TableRow key={crit.id}>
                    <TableCell className="text-sm font-medium">{crit.criterium_naam}</TableCell>
                    <TableCell className="text-center text-sm">{aiScore ?? "–"} / {crit.max_score}</TableCell>
                    <TableCell className="text-center">
                      {review ? (
                        <span className={review.status === "adjusted" ? "text-orange-600 font-semibold" : "text-green-600"}>
                          {reviewerScore ?? "–"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {review?.comment || "–"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        max={crit.max_score}
                        value={finalScores[sc.id] || ""}
                        onChange={(e) => setFinalScores((prev) => ({ ...prev, [sc.id]: e.target.value }))}
                        className="h-8 w-20 text-center text-sm mx-auto"
                      />
                      <div className="flex gap-1 justify-center mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => setFinalScores((prev) => ({ ...prev, [sc.id]: aiScore?.toString() || "" }))}
                          title="Neem AI score over"
                        >
                          AI
                        </Button>
                        {review?.adjusted_score != null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-1.5"
                            onClick={() => setFinalScores((prev) => ({ ...prev, [sc.id]: review.adjusted_score.toString() }))}
                            title="Neem reviewer score over"
                          >
                            Rev
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedStudentId(null)}>Sluiten</Button>
            <Button onClick={finalize} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Finaliseer scores
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

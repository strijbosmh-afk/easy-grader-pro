import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, Edit3, Loader2, ShieldCheck } from "lucide-react";

interface Props {
  studentId: string;
  projectId: string;
  onBack: () => void;
}

export function StudentReviewView({ studentId, projectId, onBack }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: student } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId).single();
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
        .eq("project_id", projectId)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: scores } = useQuery({
    queryKey: ["scores", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("*")
        .eq("student_id", studentId);
      if (error) throw error;
      return data;
    },
  });

  const { data: existingReviews } = useQuery({
    queryKey: ["score-reviews", studentId, user?.id],
    queryFn: async () => {
      const scoreIds = scores?.map((s) => s.id) || [];
      if (scoreIds.length === 0) return [];
      const { data, error } = await supabase
        .from("score_reviews")
        .select("*")
        .eq("reviewer_id", user!.id)
        .in("student_score_id", scoreIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!scores && !!user,
  });

  // Local review state: { [scoreId]: { status, adjustedScore, comment } }
  const [reviews, setReviews] = useState<Record<string, {
    status: "approved" | "adjusted";
    adjustedScore: string;
    comment: string;
  }>>({});

  // Initialize from existing reviews
  useMemo(() => {
    if (existingReviews && existingReviews.length > 0 && Object.keys(reviews).length === 0) {
      const init: typeof reviews = {};
      for (const r of existingReviews) {
        init[r.student_score_id] = {
          status: r.status === "adjusted" ? "adjusted" : "approved",
          adjustedScore: r.adjusted_score?.toString() || "",
          comment: r.comment || "",
        };
      }
      setReviews(init);
    }
  }, [existingReviews]);

  const allCriteria = criteria?.filter((c) => !c.is_eindscore) || [];
  const reviewedCount = Object.keys(reviews).length;
  const totalCount = allCriteria.length;
  const progressPct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  const setApproved = (scoreId: string) => {
    setReviews((prev) => ({
      ...prev,
      [scoreId]: { status: "approved", adjustedScore: "", comment: "" },
    }));
  };

  const setAdjusted = (scoreId: string) => {
    setReviews((prev) => ({
      ...prev,
      [scoreId]: { status: "adjusted", adjustedScore: prev[scoreId]?.adjustedScore || "", comment: prev[scoreId]?.comment || "" },
    }));
  };

  const updateField = (scoreId: string, field: "adjustedScore" | "comment", value: string) => {
    setReviews((prev) => ({
      ...prev,
      [scoreId]: { ...prev[scoreId], [field]: value },
    }));
  };

  const saveReviews = async () => {
    if (!user || !scores) return;
    setSaving(true);
    try {
      for (const [scoreId, review] of Object.entries(reviews)) {
        const score = scores.find((s) => s.id === scoreId);
        if (!score) continue;

        // Validate adjusted scores
        if (review.status === "adjusted") {
          if (!review.comment.trim()) {
            toast.error("Voeg een toelichting toe bij aangepaste scores");
            setSaving(false);
            return;
          }
        }

        // Upsert review
        const existing = existingReviews?.find((r: any) => r.student_score_id === scoreId);
        const reviewData = {
          student_score_id: scoreId,
          reviewer_id: user.id,
          original_score: score.ai_suggested_score,
          adjusted_score: review.status === "adjusted" && review.adjustedScore ? parseFloat(review.adjustedScore) : null,
          comment: review.comment || null,
          status: review.status,
        };

        if (existing) {
          await supabase.from("score_reviews").update(reviewData as any).eq("id", existing.id);
        } else {
          await supabase.from("score_reviews").insert(reviewData as any);
        }

        // Update review_status on score
        const newStatus = review.status === "adjusted" ? "adjusted" : "approved";
        await supabase.from("student_scores").update({ review_status: newStatus } as any).eq("id", scoreId);
      }

      queryClient.invalidateQueries({ queryKey: ["score-reviews", studentId] });
      queryClient.invalidateQueries({ queryKey: ["scores", studentId] });
      toast.success("Review opgeslagen!");
    } catch {
      toast.error("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  if (!student || !criteria || !scores) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Review: {student.naam}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {reviewedCount} van {totalCount} criteria beoordeeld
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Terug
        </Button>
      </div>

      <Progress value={progressPct} className="h-2" />

      <div className="space-y-4">
        {allCriteria.map((crit) => {
          const sc = scores.find((s) => s.criterium_id === crit.id);
          if (!sc) return null;
          const review = reviews[sc.id];
          const isApproved = review?.status === "approved";
          const isAdjusted = review?.status === "adjusted";

          return (
            <Card key={crit.id} className={isApproved ? "border-green-200 dark:border-green-900" : isAdjusted ? "border-orange-200 dark:border-orange-900" : ""}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{crit.criterium_naam}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-muted-foreground">
                        AI Score: <strong>{sc.ai_suggested_score ?? "–"}</strong> / {crit.max_score}
                      </span>
                      {(sc as any).ai_confidence && (
                        <Badge variant="outline" className="text-[10px]">
                          {(sc as any).ai_confidence === "high" ? "Hoog" : (sc as any).ai_confidence === "medium" ? "Gemiddeld" : "Laag"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isApproved ? "default" : "outline"}
                      onClick={() => setApproved(sc.id)}
                      className={isApproved ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Akkoord
                    </Button>
                    <Button
                      size="sm"
                      variant={isAdjusted ? "default" : "outline"}
                      onClick={() => setAdjusted(sc.id)}
                      className={isAdjusted ? "bg-orange-500 hover:bg-orange-600" : ""}
                    >
                      <Edit3 className="h-3.5 w-3.5 mr-1" />
                      Aanpassen
                    </Button>
                  </div>
                </div>

                {/* AI feedback */}
                {((sc as any).ai_detail_feedback || sc.ai_motivatie) && (
                  <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                    {(sc as any).ai_detail_feedback || sc.ai_motivatie}
                  </div>
                )}

                {/* Adjustment fields */}
                {isAdjusted && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Aangepaste score</label>
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        max={crit.max_score}
                        value={review.adjustedScore}
                        onChange={(e) => updateField(sc.id, "adjustedScore", e.target.value)}
                        className="mt-1"
                        placeholder={`Max ${crit.max_score}`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Toelichting (verplicht)</label>
                      <Textarea
                        value={review.comment}
                        onChange={(e) => updateField(sc.id, "comment", e.target.value)}
                        className="mt-1 min-h-[60px]"
                        placeholder="Waarom pas je deze score aan?"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onBack}>Annuleren</Button>
        <Button onClick={saveReviews} disabled={saving || reviewedCount === 0}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Review opslaan ({reviewedCount}/{totalCount})
        </Button>
      </div>
    </div>
  );
}

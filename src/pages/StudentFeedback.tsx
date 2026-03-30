import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ThumbsUp, ThumbsDown, HelpCircle, MessageSquare, GraduationCap, Send } from "lucide-react";

type ReactionType = "agree" | "disagree" | "question";

export default function StudentFeedback() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const queryClient = useQueryClient();

  // Fetch student by share_token
  const { data: student, isLoading: studentLoading, error: studentError } = useQuery({
    queryKey: ["shared-student", shareToken],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("share_token", shareToken!)
        .eq("share_enabled", true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!shareToken,
  });

  // Fetch project info
  const { data: project } = useQuery({
    queryKey: ["shared-project", student?.project_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("naam, feedback_language")
        .eq("id", student!.project_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!student?.project_id,
  });

  // Fetch criteria
  const { data: criteria } = useQuery({
    queryKey: ["shared-criteria", student?.project_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_criteria")
        .select("*")
        .eq("project_id", student!.project_id)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!student?.project_id,
  });

  // Fetch scores
  const { data: scores } = useQuery({
    queryKey: ["shared-scores", student?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("*")
        .eq("student_id", student!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!student?.id,
  });

  // Fetch existing reactions
  const { data: reactions } = useQuery({
    queryKey: ["shared-reactions", student?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_reactions")
        .select("*")
        .eq("student_id", student!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!student?.id,
  });

  // Local state for pending reactions
  const [pendingReactions, setPendingReactions] = useState<
    Record<string, { type: ReactionType; comment: string }>
  >({});
  const [expandedComment, setExpandedComment] = useState<string | null>(null);

  // Submit reaction mutation
  const submitReaction = useMutation({
    mutationFn: async ({
      criterionId,
      reactionType,
      comment,
    }: {
      criterionId: string;
      reactionType: ReactionType;
      comment: string;
    }) => {
      const { error } = await supabase.from("student_reactions").insert({
        student_id: student!.id,
        criterion_id: criterionId,
        reaction_type: reactionType,
        comment: comment || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["shared-reactions", student?.id] });
      setPendingReactions((prev) => {
        const next = { ...prev };
        delete next[variables.criterionId];
        return next;
      });
      setExpandedComment(null);
    },
  });

  const handleReaction = (criterionId: string, type: ReactionType) => {
    setPendingReactions((prev) => ({
      ...prev,
      [criterionId]: { type, comment: prev[criterionId]?.comment || "" },
    }));
    if (type === "disagree" || type === "question") {
      setExpandedComment(criterionId);
    }
  };

  const sendReaction = (criterionId: string) => {
    const pending = pendingReactions[criterionId];
    if (!pending) return;
    submitReaction.mutate({
      criterionId,
      reactionType: pending.type,
      comment: pending.comment,
    });
  };

  // Loading & error states
  if (studentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (studentError || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-3">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground" />
            <h1 className="text-xl font-bold text-foreground">Feedback niet beschikbaar</h1>
            <p className="text-muted-foreground text-sm">
              Deze feedbacklink is ongeldig of niet meer actief. Neem contact op met je docent.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const normalCriteria = criteria?.filter((c) => !c.is_eindscore) || [];
  const scoredCriteria = normalCriteria.filter((c) => scores?.some((s) => s.criterium_id === c.id));
  const totalScore = scoredCriteria.reduce((sum, c) => {
    const sc = scores?.find((s) => s.criterium_id === c.id);
    return sum + (sc?.final_score ?? sc?.ai_suggested_score ?? 0);
  }, 0);
  const maxTotal = normalCriteria.reduce((sum, c) => sum + c.max_score, 0);
  const gradedDate = student.created_at ? new Date(student.created_at) : new Date();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">{student.naam}</h1>
          </div>
          {project && (
            <p className="text-sm text-muted-foreground">
              {project.naam}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <Badge variant="secondary" className="text-sm">
              Totaal: {totalScore} / {maxTotal}
            </Badge>
            <Badge
              variant="outline"
              className={
                student.status === "graded"
                  ? "border-green-500 text-green-700 dark:text-green-400"
                  : "border-blue-500 text-blue-700 dark:text-blue-400"
              }
            >
              {student.status === "graded"
                ? "Beoordeeld"
                : student.status === "reviewed"
                ? "Geanalyseerd"
                : "In behandeling"}
            </Badge>
          </div>
        </div>
      </div>

      {/* AI General Feedback */}
      {student.ai_feedback && (
        <div className="max-w-3xl mx-auto px-4 mt-6">
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Algemene feedback
              </h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {student.ai_feedback}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Docent Feedback */}
      {student.docent_feedback && (
        <div className="max-w-3xl mx-auto px-4 mt-4">
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-semibold text-foreground mb-2">Feedback docent</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {student.docent_feedback}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Criteria Scores */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Beoordeling per criterium</h2>

        {normalCriteria.map((crit) => {
          const sc = scores?.find((s) => s.criterium_id === crit.id);
          const score = sc?.final_score ?? sc?.ai_suggested_score;
          const existingReaction = reactions?.find((r) => (r as any).criterion_id === crit.id);
          const pending = pendingReactions[crit.id];
          const scorePct = score != null ? (score / crit.max_score) * 100 : 0;

          return (
            <Card key={crit.id}>
              <CardContent className="pt-4 space-y-3">
                {/* Criterion header */}
                <div className="flex items-start justify-between">
                  <p className="font-medium text-foreground">{crit.criterium_naam}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-sm font-bold ${
                        scorePct >= 70
                          ? "text-green-600 dark:text-green-400"
                          : scorePct >= 50
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {score ?? "–"}
                    </span>
                    <span className="text-xs text-muted-foreground">/ {crit.max_score}</span>
                  </div>
                </div>

                {/* Score bar */}
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      scorePct >= 70
                        ? "bg-green-500"
                        : scorePct >= 50
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${scorePct}%` }}
                  />
                </div>

                {/* AI detail feedback */}
                {(sc?.ai_detail_feedback || sc?.ai_motivatie) && (
                  <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                    {sc.ai_detail_feedback || sc.ai_motivatie}
                  </div>
                )}

                {/* Existing reaction */}
                {existingReaction && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                    {(existingReaction as any).reaction_type === "agree" && <ThumbsUp className="h-3.5 w-3.5 text-green-500" />}
                    {(existingReaction as any).reaction_type === "disagree" && <ThumbsDown className="h-3.5 w-3.5 text-red-500" />}
                    {(existingReaction as any).reaction_type === "question" && <HelpCircle className="h-3.5 w-3.5 text-yellow-500" />}
                    <span>Je hebt gereageerd</span>
                    {(existingReaction as any).comment && (
                      <span className="ml-1 italic">— {(existingReaction as any).comment}</span>
                    )}
                  </div>
                )}

                {/* Reaction buttons (only if no existing reaction) */}
                {!existingReaction && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={pending?.type === "agree" ? "default" : "outline"}
                        onClick={() => handleReaction(crit.id, "agree")}
                        className={pending?.type === "agree" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      >
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                        Eens
                      </Button>
                      <Button
                        size="sm"
                        variant={pending?.type === "disagree" ? "default" : "outline"}
                        onClick={() => handleReaction(crit.id, "disagree")}
                        className={pending?.type === "disagree" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                      >
                        <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                        Oneens
                      </Button>
                      <Button
                        size="sm"
                        variant={pending?.type === "question" ? "default" : "outline"}
                        onClick={() => handleReaction(crit.id, "question")}
                        className={pending?.type === "question" ? "bg-yellow-600 hover:bg-yellow-700 text-white" : ""}
                      >
                        <HelpCircle className="h-3.5 w-3.5 mr-1" />
                        Vraag
                      </Button>
                    </div>

                    {/* Comment field + send */}
                    {pending && (expandedComment === crit.id || pending.type === "agree") && (
                      <div className="flex gap-2">
                        <Textarea
                          value={pending.comment}
                          onChange={(e) =>
                            setPendingReactions((prev) => ({
                              ...prev,
                              [crit.id]: { ...prev[crit.id], comment: e.target.value },
                            }))
                          }
                          placeholder={
                            pending.type === "disagree"
                              ? "Waarom ben je het oneens?"
                              : pending.type === "question"
                              ? "Wat is je vraag?"
                              : "Opmerking (optioneel)"
                          }
                          className="min-h-[60px] text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => sendReaction(crit.id)}
                          disabled={submitReaction.isPending}
                          className="shrink-0 self-end"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Quick send for agree without comment */}
                    {pending?.type === "agree" && expandedComment !== crit.id && (
                      <Button
                        size="sm"
                        onClick={() => sendReaction(crit.id)}
                        disabled={submitReaction.isPending}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Verstuur
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          Gegenereerd door GradeAssist
        </div>
      </div>
    </div>
  );
}

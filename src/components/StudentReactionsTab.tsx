import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, ThumbsUp, ThumbsDown, HelpCircle, Loader2 } from "lucide-react";
import { useState } from "react";

interface Props {
  projectId: string;
  students: any[];
  criteria: any[];
}

const reactionIcons: Record<string, React.ReactNode> = {
  agree: <ThumbsUp className="h-3.5 w-3.5 text-green-600" />,
  disagree: <ThumbsDown className="h-3.5 w-3.5 text-destructive" />,
  question: <HelpCircle className="h-3.5 w-3.5 text-yellow-600" />,
};

const reactionLabels: Record<string, string> = {
  agree: "Eens",
  disagree: "Oneens",
  question: "Vraag",
};

export function StudentReactionsTab({ projectId, students, criteria }: Props) {
  const [filterStudent, setFilterStudent] = useState<string>("all");
  const [filterCriterion, setFilterCriterion] = useState<string>("all");

  const studentIds = students.map((s) => s.id);

  const { data: reactions, isLoading } = useQuery({
    queryKey: ["student-reactions", projectId],
    queryFn: async () => {
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("student_reactions")
        .select("*")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: studentIds.length > 0,
  });

  const filtered = (reactions || []).filter((r) => {
    if (filterStudent !== "all" && r.student_id !== filterStudent) return false;
    if (filterCriterion !== "all" && r.criterion_id !== filterCriterion) return false;
    return true;
  });

  const getStudentName = (id: string) => students.find((s) => s.id === id)?.naam || "Onbekend";
  const getCriterionName = (id: string) => criteria.find((c: any) => c.id === id)?.criterium_naam || "Onbekend";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Studentreacties
            {reactions && reactions.length > 0 && (
              <Badge variant="secondary" className="ml-1 font-normal">{reactions.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filterStudent} onValueChange={setFilterStudent}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Alle studenten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle studenten</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCriterion} onValueChange={setFilterCriterion}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Alle criteria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle criteria</SelectItem>
                {criteria.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.criterium_naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nog geen studentreacties ontvangen.
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className="mt-0.5">{reactionIcons[r.reaction_type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{getStudentName(r.student_id)}</span>
                    <Badge variant="outline" className="text-[10px]">{reactionLabels[r.reaction_type]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      — {getCriterionName(r.criterion_id)}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>
                  )}
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    {new Date(r.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Users, CheckCircle, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSummaryCardProps {
  students: any[];
  criteria: any[];
}

function getEindScore(student: any, eindscoreCriterium: any) {
  if (!eindscoreCriterium) return null;
  const sc = student.student_scores?.find((s: any) => s.criterium_id === eindscoreCriterium.id);
  if (!sc) return null;
  return sc.final_score ?? sc.ai_suggested_score ?? null;
}

function getTotalScore(student: any, criteria: any[]) {
  const eindscoreCriterium = criteria?.find((c: any) => c.is_eindscore);
  if (eindscoreCriterium) return getEindScore(student, eindscoreCriterium);
  const scores = student.student_scores || [];
  const vals = scores.map((s: any) => s.final_score ?? s.ai_suggested_score).filter((v: any) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a: number, b: number) => a + Number(b), 0);
}

function getMaxTotal(criteria: any[]) {
  const eindscoreCriterium = criteria?.find((c: any) => c.is_eindscore);
  if (eindscoreCriterium) return Number(eindscoreCriterium.max_score);
  return criteria.reduce((a, c) => a + Number(c.max_score), 0);
}

export function ProjectSummaryCard({ students, criteria }: ProjectSummaryCardProps) {
  const total = students.length;
  const pending = students.filter((s) => s.status === "pending").length;
  const analysed = students.filter((s) => s.status === "reviewed" || s.status === "graded").length;
  const graded = students.filter((s) => s.status === "graded").length;
  const needsAttention = students.filter((s) => {
    const warnings = Array.isArray((s as any).ai_validation_warnings) && (s as any).ai_validation_warnings.length > 0;
    return warnings && s.status !== "graded";
  }).length;

  const maxTotal = getMaxTotal(criteria);
  const scores = students
    .map((s) => getTotalScore(s, criteria))
    .filter((v): v is number => v !== null && v !== undefined);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const avgPct = avgScore !== null && maxTotal > 0 ? Math.round((avgScore / maxTotal) * 100) : null;

  const stats = [
    {
      icon: Users,
      value: total,
      label: "Studenten",
      color: "text-foreground",
      bg: "bg-muted/50",
    },
    {
      icon: Clock,
      value: pending,
      label: "Wachten",
      color: pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      bg: pending > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50",
    },
    {
      icon: CheckCircle,
      value: graded,
      label: "Beoordeeld",
      color: graded === total && total > 0 ? "text-green-600 dark:text-green-400" : "text-foreground",
      bg: graded === total && total > 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-muted/50",
    },
    {
      icon: AlertTriangle,
      value: needsAttention,
      label: "Aandacht vereist",
      color: needsAttention > 0 ? "text-destructive" : "text-muted-foreground",
      bg: needsAttention > 0 ? "bg-destructive/5" : "bg-muted/50",
    },
    ...(avgPct !== null
      ? [{
          icon: TrendingUp,
          value: `${avgPct}%`,
          label: "Gemiddeld",
          color: avgPct >= 70 ? "text-green-600 dark:text-green-400" : avgPct >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive",
          bg: "bg-muted/50",
        }]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3 mb-2">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <div key={i} className={cn("rounded-lg p-3 flex items-center gap-3", stat.bg)}>
            <div className={cn("shrink-0", stat.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn("text-xl font-bold leading-none", stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

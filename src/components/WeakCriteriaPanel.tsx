import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WeakCriteriaPanelProps {
  students: any[];
  criteria: any[];
  onNavigateToOverview?: () => void;
}

export function WeakCriteriaPanel({ students, criteria, onNavigateToOverview }: WeakCriteriaPanelProps) {
  const analysed = students.filter((s) => s.status === "reviewed" || s.status === "graded");
  if (analysed.length === 0 || criteria.length === 0) return null;

  // Non-eindscore criteria only
  const scoringCriteria = criteria.filter((c: any) => !c.is_eindscore);
  if (scoringCriteria.length === 0) return null;

  const criteriaStats = scoringCriteria.map((c: any) => {
    const scores = analysed
      .map((s) => {
        const sc = s.student_scores?.find((sc: any) => sc.criterium_id === c.id);
        return sc ? (sc.final_score ?? sc.ai_suggested_score ?? null) : null;
      })
      .filter((v): v is number => v !== null);

    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const pct = avg !== null && c.max_score > 0 ? Math.round((avg / c.max_score) * 100) : null;
    return { ...c, avg, pct, count: scores.length };
  });

  // Sort by percentage ascending (worst first)
  const sorted = criteriaStats
    .filter((c) => c.pct !== null)
    .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));

  if (sorted.length === 0) return null;

  const getColor = (pct: number) => {
    if (pct >= 75) return { bar: "bg-green-500", text: "text-green-700 dark:text-green-400", icon: TrendingUp };
    if (pct >= 55) return { bar: "bg-amber-400", text: "text-amber-700 dark:text-amber-400", icon: Minus };
    return { bar: "bg-red-500", text: "text-red-700 dark:text-red-400", icon: TrendingDown };
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            Criteriumoverzicht klas
          </div>
          <span className="text-[10px] font-normal text-muted-foreground">
            {analysed.length} student{analysed.length !== 1 ? "en" : ""} geanalyseerd
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        {sorted.map((c) => {
          const { bar, text, icon: Icon } = getColor(c.pct!);
          return (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", text)} />
                  <span className="text-xs font-medium truncate">{c.criterium_naam}</span>
                </div>
                <span className={cn("text-xs font-bold shrink-0", text)}>
                  {c.avg?.toFixed(1)}/{c.max_score} ({c.pct}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", bar)}
                  style={{ width: `${c.pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {sorted[0]?.pct !== null && sorted[0].pct < 55 && (
          <p className="text-[10px] text-muted-foreground pt-1 border-t">
            ⚠ <strong>{sorted[0].criterium_naam}</strong> scoort gemiddeld het laagst ({sorted[0].pct}%). Overweeg extra instructie.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

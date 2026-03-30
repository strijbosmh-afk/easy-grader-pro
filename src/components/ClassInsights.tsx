import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb, Loader2, TrendingUp, TrendingDown, ArrowRight,
  MessageSquareQuote, Users, BookOpen, Sparkles, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface Theme {
  title: string;
  description: string;
  type: "strength" | "weakness" | "mixed";
  studentCount: number;
  totalStudents: number;
  criterion: string | null;
  quotes: string[];
}

interface CriterionInsight {
  name: string;
  avgPct: number;
  insight: string;
}

interface InsightsData {
  summary: string;
  themes: Theme[];
  recommendations: string[];
  criterionInsights: CriterionInsight[];
}

interface ClassInsightsProps {
  projectId?: string;
  projectIds?: string[];
}

function ThemeIcon({ type }: { type: string }) {
  if (type === "strength") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (type === "weakness") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <ArrowRight className="h-4 w-4 text-amber-500" />;
}

function ThemeBadge({ type }: { type: string }) {
  if (type === "strength") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]">Sterk punt</Badge>;
  if (type === "weakness") return <Badge variant="destructive" className="text-[10px]">Verbeterpunt</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px]">Gemengd</Badge>;
}

export function ClassInsights({ projectId, projectIds }: ClassInsightsProps) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [totalStudents, setTotalStudents] = useState(0);
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null);

  const analyze = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (projectIds && projectIds.length > 0) body.projectIds = projectIds;
      else if (projectId) body.projectId = projectId;
      else throw new Error("Geen project geselecteerd");

      const { data, error } = await invokeEdgeFunction("analyze-class-insights", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setInsights(data.insights);
      setTotalStudents(data.totalStudents || 0);
    },
    onError: (err: any) => {
      toast.error("Klasinzichten mislukt: " + (err?.message || "onbekende fout"));
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Pedagogische Klasinzichten
          </CardTitle>
          <Button
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
            size="sm"
          >
            {analyze.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyseren...
              </>
            ) : insights ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Vernieuw inzichten
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Genereer inzichten
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!insights && !analyze.isPending && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Klik op "Genereer inzichten" om AI-gedreven patronen en trends te ontdekken.</p>
            <p className="text-xs mt-1">
              De AI analyseert alle feedback en scores om terugkerende thema's te identificeren.
            </p>
          </div>
        )}

        {analyze.isPending && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Feedback van {totalStudents || "alle"} studenten wordt geanalyseerd...</p>
          </div>
        )}

        {insights && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-foreground leading-relaxed">{insights.summary}</p>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Gebaseerd op {totalStudents} studenten
              </p>
            </div>

            {/* Criterion Performance Bars */}
            {insights.criterionInsights && insights.criterionInsights.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Prestaties per criterium
                </h4>
                <div className="space-y-2.5">
                  {insights.criterionInsights
                    .sort((a, b) => a.avgPct - b.avgPct)
                    .map((ci, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate max-w-[60%]">{ci.name}</span>
                          <span
                            className={`font-semibold ${
                              ci.avgPct >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : ci.avgPct >= 50
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-destructive"
                            }`}
                          >
                            {Math.round(ci.avgPct)}%
                          </span>
                        </div>
                        <Progress
                          value={ci.avgPct}
                          className={`h-2 ${
                            ci.avgPct >= 70
                              ? "[&>div]:bg-emerald-500"
                              : ci.avgPct >= 50
                              ? "[&>div]:bg-amber-500"
                              : "[&>div]:bg-destructive"
                          }`}
                        />
                        <p className="text-[11px] text-muted-foreground">{ci.insight}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Themes */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Terugkerende thema's</h4>
              <div className="grid gap-3">
                {insights.themes.map((theme, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-3.5 space-y-2 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedTheme(expandedTheme === i ? null : i)}
                  >
                    <div className="flex items-start gap-2.5">
                      <ThemeIcon type={theme.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{theme.title}</span>
                          <ThemeBadge type={theme.type} />
                          {theme.criterion && (
                            <Badge variant="outline" className="text-[10px]">{theme.criterion}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{theme.description}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {theme.studentCount} van {theme.totalStudents} studenten
                          </span>
                          <Progress
                            value={(theme.studentCount / theme.totalStudents) * 100}
                            className="h-1 w-16 ml-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expanded quotes */}
                    {expandedTheme === i && theme.quotes && theme.quotes.length > 0 && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <MessageSquareQuote className="h-3 w-3" />
                          Voorbeelden uit feedback
                        </p>
                        {theme.quotes.map((q, qi) => (
                          <div
                            key={qi}
                            className="text-xs text-foreground/80 italic border-l-2 border-primary/30 pl-2.5 py-0.5"
                          >
                            "{q}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Recommendations */}
            {insights.recommendations && insights.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Aanbevelingen voor de docent
                </h4>
                <ul className="space-y-1.5">
                  {insights.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="text-xs text-foreground/90 flex items-start gap-2 rounded-md p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30"
                    >
                      <span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

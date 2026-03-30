import { useState, useMemo } from "react";
import { ClassInsights } from "@/components/ClassInsights";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Users, FolderOpen, TrendingUp, Award, Clock, Filter, ArrowUpDown, ChevronUp, ChevronDown, ShieldCheck, Target } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";

const ACCENT_BLUE = "#2E86C1";
const COLOR_GREEN = "hsl(142, 71%, 45%)";
const COLOR_ORANGE = "hsl(38, 92%, 50%)";
const COLOR_RED = "hsl(0, 84%, 60%)";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

function stddev(vals: number[]): number {
  if (vals.length === 0) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
}

function pctColor(pct: number) {
  if (pct >= 70) return COLOR_GREEN;
  if (pct >= 50) return COLOR_ORANGE;
  return COLOR_RED;
}

type SortKey = "naam" | "score" | "pct" | "confidence" | "status";
type SortDir = "asc" | "desc";

const Statistics = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<string>("__latest__");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: projects } = useQuery({
    queryKey: ["stats-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, naam, created_at")
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Resolve "latest" to actual id
  const resolvedProjectId = useMemo(() => {
    if (selectedProject === "__latest__" && projects?.length) return projects[0].id;
    if (selectedProject === "all") return "all";
    return selectedProject;
  }, [selectedProject, projects]);

  // Fetch students + scores + criteria for selected project(s)
  const { data: studentsRaw } = useQuery({
    queryKey: ["stats-students", resolvedProjectId],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, naam, status, project_id, student_scores(final_score, ai_suggested_score, ai_confidence, criterium_id, ai_detail_feedback, ai_motivatie)");
      if (resolvedProjectId !== "all") {
        q = q.eq("project_id", resolvedProjectId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!resolvedProjectId,
  });

  const { data: criteriaRaw } = useQuery({
    queryKey: ["stats-criteria", resolvedProjectId],
    queryFn: async () => {
      let q = supabase
        .from("grading_criteria")
        .select("id, criterium_naam, max_score, is_eindscore, project_id, volgorde");
      if (resolvedProjectId !== "all") {
        q = q.eq("project_id", resolvedProjectId);
      }
      const { data, error } = await q.order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!resolvedProjectId,
  });

  const students = studentsRaw || [];
  const criteria = criteriaRaw || [];
  const isSingleProject = resolvedProjectId !== "all";

  // ── Derived stats ──
  const totalStudents = students.length;
  const gradedStudents = students.filter((s) => s.status === "graded").length;
  const completionRate = totalStudents > 0 ? Math.round((gradedStudents / totalStudents) * 100) : 0;

  // Student score helper
  const getStudentPct = (s: any): number | null => {
    const scores = (s.student_scores || []).filter((sc: any) => {
      const crit = criteria.find((c) => c.id === sc.criterium_id);
      return crit && (sc.final_score != null || sc.ai_suggested_score != null);
    });
    if (scores.length === 0) return null;
    let totalScore = 0, totalMax = 0;
    for (const sc of scores) {
      const crit = criteria.find((c) => c.id === sc.criterium_id);
      if (!crit) continue;
      totalScore += Number(sc.final_score ?? sc.ai_suggested_score);
      totalMax += Number(crit.max_score);
    }
    return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
  };

  const getStudentTotal = (s: any): { score: number; max: number } => {
    const eindCrit = criteria.find((c) => c.is_eindscore && c.project_id === s.project_id);
    if (eindCrit) {
      const sc = (s.student_scores || []).find((ss: any) => ss.criterium_id === eindCrit.id);
      return { score: Number(sc?.final_score ?? sc?.ai_suggested_score ?? 0), max: Number(eindCrit.max_score) };
    }
    let totalScore = 0, totalMax = 0;
    for (const sc of s.student_scores || []) {
      const crit = criteria.find((c) => c.id === sc.criterium_id);
      if (!crit) continue;
      totalScore += Number(sc.final_score ?? sc.ai_suggested_score ?? 0);
      totalMax += Number(crit.max_score);
    }
    return { score: totalScore, max: totalMax };
  };

  const getStudentConfidence = (s: any): string => {
    const confs = (s.student_scores || []).map((sc: any) => sc.ai_confidence).filter(Boolean);
    if (confs.length === 0) return "–";
    if (confs.includes("low")) return "low";
    if (confs.includes("medium")) return "medium";
    return "high";
  };

  // ── 2. Score distribution ──
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0-2", min: 0, max: 2, count: 0 },
      { label: "2-4", min: 2, max: 4, count: 0 },
      { label: "4-6", min: 4, max: 6, count: 0 },
      { label: "6-8", min: 6, max: 8, count: 0 },
      { label: "8-10", min: 8, max: 10.01, count: 0 },
    ];
    // Adapt to actual max if all criteria share same max
    const maxScores = criteria.filter((c) => !c.is_eindscore).map((c) => Number(c.max_score));
    const eindCrit = criteria.find((c) => c.is_eindscore);
    const effectiveMax = eindCrit ? Number(eindCrit.max_score) : (maxScores.length > 0 ? Math.max(...maxScores) : 10);

    if (effectiveMax > 10) {
      const step = Math.ceil(effectiveMax / 5);
      buckets.length = 0;
      for (let i = 0; i < 5; i++) {
        const lo = i * step;
        const hi = i === 4 ? effectiveMax + 0.01 : (i + 1) * step;
        buckets.push({ label: `${lo}-${Math.min((i + 1) * step, effectiveMax)}`, min: lo, max: hi, count: 0 });
      }
    }

    for (const s of students) {
      const { score } = getStudentTotal(s);
      if (score === 0 && !(s.student_scores || []).length) continue;
      const bucket = buckets.find((b) => score >= b.min && score < b.max);
      if (bucket) bucket.count++;
    }
    return buckets;
  }, [students, criteria]);

  // ── 3. Per-criterion analysis ──
  const criterionStats = useMemo(() => {
    if (!isSingleProject) return [];
    const subs = criteria.filter((c) => !c.is_eindscore);
    return subs.map((c) => {
      const vals = students
        .map((s) => {
          const sc = (s.student_scores || []).find((ss: any) => ss.criterium_id === c.id);
          return sc ? Number(sc.final_score ?? sc.ai_suggested_score ?? null) : null;
        })
        .filter((v): v is number => v !== null);
      const max = Number(c.max_score);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const sd = stddev(vals);
      const pct = max > 0 ? (avg / max) * 100 : 0;
      return {
        naam: c.criterium_naam,
        avg: +avg.toFixed(1),
        max,
        min: vals.length > 0 ? Math.min(...vals) : 0,
        maxVal: vals.length > 0 ? Math.max(...vals) : 0,
        sd: +sd.toFixed(1),
        pct,
        count: vals.length,
      };
    });
  }, [students, criteria, isSingleProject]);

  // ── 4. Top & bottom criteria ──
  const topCriteria = useMemo(() => [...criterionStats].sort((a, b) => b.pct - a.pct).slice(0, 3), [criterionStats]);
  const bottomCriteria = useMemo(() => [...criterionStats].sort((a, b) => a.pct - b.pct).slice(0, 3), [criterionStats]);

  // ── 5. AI Confidence ──
  const confidenceData = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    for (const s of students) {
      for (const sc of s.student_scores || []) {
        if ((sc as any).ai_confidence === "high") high++;
        else if ((sc as any).ai_confidence === "medium") medium++;
        else if ((sc as any).ai_confidence === "low") low++;
      }
    }
    const total = high + medium + low;
    if (total === 0) return [];
    return [
      { name: "Hoog", value: high, pct: Math.round((high / total) * 100), color: COLOR_GREEN },
      { name: "Gemiddeld", value: medium, pct: Math.round((medium / total) * 100), color: COLOR_ORANGE },
      { name: "Laag", value: low, pct: Math.round((low / total) * 100), color: COLOR_RED },
    ].filter((d) => d.value > 0);
  }, [students]);

  // ── 6. Student ranking ──
  const studentRows = useMemo(() => {
    return students.map((s) => {
      const { score, max } = getStudentTotal(s);
      const pct = getStudentPct(s);
      const conf = getStudentConfidence(s);
      return { id: s.id, projectId: s.project_id, naam: s.naam, score, max, pct, confidence: conf, status: s.status as string };
    });
  }, [students, criteria]);

  const sortedStudents = useMemo(() => {
    const confOrder: Record<string, number> = { high: 3, medium: 2, low: 1, "–": 0 };
    return [...studentRows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "naam": cmp = a.naam.localeCompare(b.naam); break;
        case "score": cmp = a.score - b.score; break;
        case "pct": cmp = (a.pct ?? -1) - (b.pct ?? -1); break;
        case "confidence": cmp = (confOrder[a.confidence] || 0) - (confOrder[b.confidence] || 0); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [studentRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  // ── 7. Cross-project comparison ──
  const crossProjectData = useMemo(() => {
    if (isSingleProject || !projects) return [];
    return projects.map((p) => {
      const pStudents = students.filter((s) => s.project_id === p.id);
      const pCriteria = criteria.filter((c) => c.project_id === p.id);
      const pcts = pStudents.map((s) => {
        let ts = 0, tm = 0;
        for (const sc of s.student_scores || []) {
          const crit = pCriteria.find((c) => c.id === sc.criterium_id);
          if (!crit) continue;
          ts += Number((sc as any).final_score ?? (sc as any).ai_suggested_score ?? 0);
          tm += Number(crit.max_score);
        }
        return tm > 0 ? (ts / tm) * 100 : null;
      }).filter((v): v is number => v !== null);
      const avg = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
      return {
        naam: p.naam.length > 20 ? p.naam.slice(0, 20) + "…" : p.naam,
        score: +avg.toFixed(1),
        studenten: pStudents.length,
      };
    }).filter((d) => d.studenten > 0).reverse(); // chronological
  }, [projects, students, criteria, isSingleProject]);

  const statusLabels: Record<string, string> = {
    pending: "Wacht",
    analyzing: "Bezig",
    reviewed: "Te beoordelen",
    graded: "Beoordeeld",
  };

  const confBadgeVariant = (c: string) => {
    if (c === "high") return "default" as const;
    if (c === "medium") return "secondary" as const;
    if (c === "low") return "destructive" as const;
    return "outline" as const;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Header + project selector */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-primary" />
              Statistieken
            </h1>
            <p className="text-muted-foreground mt-1">Analytics dashboard</p>
          </div>
          <div className="min-w-[240px]">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__latest__">Meest recent project</SelectItem>
                <SelectItem value="all">Alle projecten</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
                  <p className="text-xs text-muted-foreground">Studenten</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{gradedStudents}</p>
                  <p className="text-xs text-muted-foreground">Beoordeeld</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
                  <p className="text-xs text-muted-foreground">Voltooid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{criteria.filter((c) => !c.is_eindscore).length}</p>
                  <p className="text-xs text-muted-foreground">Criteria</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress bar */}
        {totalStudents > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Voortgang
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={completionRate} className="h-3" />
              <p className="text-sm text-muted-foreground mt-2">
                {gradedStudents} van {totalStudents} studenten beoordeeld
              </p>
            </CardContent>
          </Card>
        )}

        {/* Score distribution + AI Confidence side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {scoreDistribution.some((b) => b.count > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Scoreverdeling</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}`, "Studenten"]} />
                    <Bar dataKey="count" fill={ACCENT_BLUE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {confidenceData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  AI Vertrouwen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={220}>
                    <PieChart>
                      <Pie
                        data={confidenceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {confidenceData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {confidenceData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-sm text-foreground">{d.name}: <strong>{d.pct}%</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Per-criterion analysis (single project only) */}
        {isSingleProject && criterionStats.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Analyse per criterium
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {criterionStats.map((cs) => (
                <Card key={cs.naam}>
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <p className="text-sm font-semibold text-foreground truncate">{cs.naam}</p>
                    {/* Range bar */}
                    <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                      {/* Min-max range */}
                      <div
                        className="absolute top-0 h-full rounded-full opacity-30"
                        style={{
                          left: `${(cs.min / cs.max) * 100}%`,
                          width: `${((cs.maxVal - cs.min) / cs.max) * 100}%`,
                          backgroundColor: pctColor(cs.pct),
                        }}
                      />
                      {/* Average marker */}
                      <div
                        className="absolute top-0 h-full w-1.5 rounded-full"
                        style={{
                          left: `${Math.min((cs.avg / cs.max) * 100, 98)}%`,
                          backgroundColor: pctColor(cs.pct),
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Gemiddelde: <strong style={{ color: pctColor(cs.pct) }}>{cs.avg}</strong> / {cs.max} (σ = {cs.sd})
                      </span>
                      <Badge variant="outline" className="text-[10px]">{cs.count} scores</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Top & bottom criteria (single project) */}
        {isSingleProject && criterionStats.length >= 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: COLOR_GREEN }} />
                  Sterkste criteria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topCriteria.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm text-foreground truncate max-w-[200px]">{c.naam}</span>
                    <Badge variant="default" className="text-xs">{Math.round(c.pct)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 rotate-180" style={{ color: COLOR_RED }} />
                  Aandachtspunten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {bottomCriteria.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm text-foreground truncate max-w-[200px]">{c.naam}</span>
                    <Badge variant="destructive" className="text-xs">{Math.round(c.pct)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cross-project comparison (all projects) */}
        {!isSingleProject && crossProjectData.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Projectvergelijking (gemiddeld scorepercentage)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={crossProjectData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="naam" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Gem. score"]} />
                  <Bar dataKey="score" fill={ACCENT_BLUE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Student ranking table */}
        {sortedStudents.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Studentranking</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("naam")}>
                      <span className="flex items-center">Naam <SortIcon col="naam" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("score")}>
                      <span className="flex items-center justify-center">Eindscore <SortIcon col="score" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("pct")}>
                      <span className="flex items-center justify-center">Percentage <SortIcon col="pct" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("confidence")}>
                      <span className="flex items-center justify-center">Vertrouwen <SortIcon col="confidence" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("status")}>
                      <span className="flex items-center justify-center">Status <SortIcon col="status" /></span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/project/${s.projectId}/student/${s.id}`)}
                    >
                      <TableCell className="font-medium">{s.naam}</TableCell>
                      <TableCell className="text-center">{s.max > 0 ? `${s.score} / ${s.max}` : "–"}</TableCell>
                      <TableCell className="text-center">
                        {s.pct !== null ? (
                          <span style={{ color: pctColor(s.pct) }} className="font-semibold">{Math.round(s.pct)}%</span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={confBadgeVariant(s.confidence)} className="text-[10px]">
                          {s.confidence === "high" ? "Hoog" : s.confidence === "medium" ? "Gemiddeld" : s.confidence === "low" ? "Laag" : "–"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.status === "graded" ? "default" : "secondary"} className="text-[10px]">
                          {statusLabels[s.status] || s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Class Insights */}
        {totalStudents >= 2 && (
          <ClassInsights
            projectId={isSingleProject ? resolvedProjectId : undefined}
            projectIds={!isSingleProject && projects ? projects.map(p => p.id) : undefined}
          />
        )}

        {/* Empty state */}
        {totalStudents === 0 && (
          <div className="text-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nog geen data voor dit project.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistics;

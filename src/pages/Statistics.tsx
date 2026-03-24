import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Users, FolderOpen, TrendingUp, Award, Clock, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
];

type StudentStatus = "pending" | "analyzing" | "reviewed" | "graded";

const Statistics = () => {
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [scoreRange, setScoreRange] = useState<string>("all");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, students(id, naam, status, student_scores(ai_suggested_score, final_score, grading_criteria(max_score, criterium_naam)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Filtered data
  const filtered = useMemo(() => {
    let filteredProjects = projects || [];

    if (selectedProject !== "all") {
      filteredProjects = filteredProjects.filter((p) => p.id === selectedProject);
    }

    const allStudents = filteredProjects.flatMap((p) =>
      (p.students || []).map((s: any) => ({ ...s, projectNaam: p.naam, projectId: p.id }))
    );

    let filteredStudents = allStudents;

    if (selectedStatus !== "all") {
      filteredStudents = filteredStudents.filter((s: any) => s.status === selectedStatus);
    }

    // Score range filter
    if (scoreRange !== "all") {
      filteredStudents = filteredStudents.filter((s: any) => {
        const scores = (s.student_scores || [])
          .filter((sc: any) => (sc.final_score != null || sc.ai_suggested_score != null) && sc.grading_criteria?.max_score)
          .map((sc: any) => ((sc.final_score ?? sc.ai_suggested_score) / sc.grading_criteria.max_score) * 100);
        if (scores.length === 0) return scoreRange === "no-score";
        const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        switch (scoreRange) {
          case "high": return avg >= 80;
          case "mid": return avg >= 60 && avg < 80;
          case "low": return avg < 60;
          case "no-score": return false;
          default: return true;
        }
      });
    }

    return { filteredProjects, filteredStudents };
  }, [projects, selectedProject, selectedStatus, scoreRange]);

  const { filteredProjects, filteredStudents } = filtered;

  const totalProjects = selectedProject === "all" ? (projects?.length || 0) : 1;
  const totalStudents = filteredStudents.length;
  const gradedStudents = filteredStudents.filter((s: any) => s.status === "graded").length;
  const completionRate = totalStudents > 0 ? Math.round((gradedStudents / totalStudents) * 100) : 0;

  // Average scores per project for bar chart
  const projectScores = (selectedProject === "all" ? projects : filteredProjects)?.map((p: any) => {
    const students = selectedProject === "all"
      ? (p.students || [])
      : filteredStudents.filter((s: any) => s.projectId === p.id);
    const scores = students.flatMap((s: any) =>
      (s.student_scores || [])
        .filter((sc: any) => sc.final_score != null && sc.grading_criteria?.max_score)
        .map((sc: any) => (sc.final_score / sc.grading_criteria.max_score) * 100)
    );
    const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    return {
      naam: p.naam.length > 15 ? p.naam.slice(0, 15) + "…" : p.naam,
      score: Math.round(avg),
      studenten: students.length,
    };
  }).filter((p: any) => p.studenten > 0) || [];

  // Status distribution for pie chart
  const statusData = [
    { name: "Wacht", value: filteredStudents.filter((s: any) => s.status === "pending").length, color: CHART_COLORS[3] },
    { name: "Geanalyseerd", value: filteredStudents.filter((s: any) => s.status === "reviewed").length, color: CHART_COLORS[2] },
    { name: "Beoordeeld", value: gradedStudents, color: CHART_COLORS[1] },
    { name: "Bezig", value: filteredStudents.filter((s: any) => s.status === "analyzing").length, color: CHART_COLORS[0] },
  ].filter((d) => d.value > 0);

  // Score distribution histogram
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0-20%", min: 0, max: 20, count: 0 },
      { label: "20-40%", min: 20, max: 40, count: 0 },
      { label: "40-60%", min: 40, max: 60, count: 0 },
      { label: "60-80%", min: 60, max: 80, count: 0 },
      { label: "80-100%", min: 80, max: 101, count: 0 },
    ];
    for (const s of filteredStudents) {
      const scores = ((s as any).student_scores || [])
        .filter((sc: any) => (sc.final_score != null) && sc.grading_criteria?.max_score)
        .map((sc: any) => (sc.final_score / sc.grading_criteria.max_score) * 100);
      if (scores.length === 0) continue;
      const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      const bucket = buckets.find((b) => avg >= b.min && avg < b.max);
      if (bucket) bucket.count++;
    }
    return buckets;
  }, [filteredStudents]);

  // Top/bottom students
  const rankedStudents = useMemo(() => {
    return filteredStudents
      .map((s: any) => {
        const scores = (s.student_scores || [])
          .filter((sc: any) => sc.final_score != null && sc.grading_criteria?.max_score)
          .map((sc: any) => (sc.final_score / sc.grading_criteria.max_score) * 100);
        const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
        return { naam: s.naam, projectNaam: s.projectNaam, avg };
      })
      .filter((s: any) => s.avg !== null)
      .sort((a: any, b: any) => b.avg - a.avg);
  }, [filteredStudents]);

  const topStudents = rankedStudents.slice(0, 5);
  const bottomStudents = [...rankedStudents].reverse().slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-primary" />
              Statistieken
            </h1>
            <p className="text-muted-foreground mt-1">Overzicht van alle beoordelingen</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[200px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle projecten" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle projecten</SelectItem>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle statussen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="pending">Wacht</SelectItem>
                    <SelectItem value="analyzing">Bezig</SelectItem>
                    <SelectItem value="reviewed">Geanalyseerd</SelectItem>
                    <SelectItem value="graded">Beoordeeld</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Scorebereik</label>
                <Select value={scoreRange} onValueChange={setScoreRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle scores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle scores</SelectItem>
                    <SelectItem value="high">Hoog (≥80%)</SelectItem>
                    <SelectItem value="mid">Gemiddeld (60-80%)</SelectItem>
                    <SelectItem value="low">Laag (&lt;60%)</SelectItem>
                    <SelectItem value="no-score">Geen score</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalProjects}</p>
                  <p className="text-xs text-muted-foreground">Projecten</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
        </div>

        {/* Completion progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Totale voortgang
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={completionRate} className="h-3" />
            <p className="text-sm text-muted-foreground mt-2">
              {gradedStudents} van {totalStudents} studenten volledig beoordeeld
            </p>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projectScores.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Gemiddelde score per project (%)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={projectScores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="naam" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`${value}%`, "Gem. score"]}
                    />
                    <Bar dataKey="score" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {statusData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statusverdeling studenten</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Score distribution histogram */}
        {scoreDistribution.some((b) => b.count > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scoreverdeling studenten</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value}`, "Studenten"]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top & bottom students */}
        {rankedStudents.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Top 5 studenten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topStudents.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.naam}</p>
                        <p className="text-[10px] text-muted-foreground">{s.projectNaam}</p>
                      </div>
                    </div>
                    <Badge variant="default" className="text-xs">{Math.round(s.avg!)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-destructive rotate-180" />
                  Aandachtsstudenten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {bottomStudents.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.naam}</p>
                        <p className="text-[10px] text-muted-foreground">{s.projectNaam}</p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="text-xs">{Math.round(s.avg!)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* No data */}
        {(projects?.length || 0) === 0 && (
          <div className="text-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nog geen data. Maak een project aan om te beginnen.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistics;

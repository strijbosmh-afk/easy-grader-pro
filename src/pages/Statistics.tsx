import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Users, FolderOpen, TrendingUp, Award, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
];

const Statistics = () => {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, students(id, status, student_scores(ai_suggested_score, final_score, grading_criteria(max_score)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalProjects = projects?.length || 0;
  const totalStudents = projects?.reduce((sum, p) => sum + (p.students?.length || 0), 0) || 0;
  const allStudents = projects?.flatMap((p) => p.students || []) || [];
  const gradedStudents = allStudents.filter((s: any) => s.status === "graded").length;
  const analyzedStudents = allStudents.filter((s: any) => s.status === "reviewed" || s.status === "graded").length;

  // Average scores per project for bar chart
  const projectScores = projects?.map((p) => {
    const students = p.students || [];
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
  }).filter((p) => p.studenten > 0) || [];

  // Status distribution for pie chart
  const statusData = [
    { name: "Wacht", value: allStudents.filter((s: any) => s.status === "pending").length, color: CHART_COLORS[3] },
    { name: "Geanalyseerd", value: allStudents.filter((s: any) => s.status === "reviewed").length, color: CHART_COLORS[2] },
    { name: "Beoordeeld", value: gradedStudents, color: CHART_COLORS[1] },
    { name: "Bezig", value: allStudents.filter((s: any) => s.status === "analyzing").length, color: CHART_COLORS[0] },
  ].filter((d) => d.value > 0);

  const completionRate = totalStudents > 0 ? Math.round((gradedStudents / totalStudents) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            Statistieken
          </h1>
          <p className="text-muted-foreground mt-1">Overzicht van alle beoordelingen</p>
        </div>

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

        {/* No data */}
        {totalProjects === 0 && (
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

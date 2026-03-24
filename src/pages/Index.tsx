import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FolderOpen, Users, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, students(id, status, student_scores(final_score))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createProject = useMutation({
    mutationFn: async (naam: string) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({ naam })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      setNewProjectName("");
      toast.success("Project aangemaakt!");
      navigate(`/project/${data.id}`);
    },
    onError: () => toast.error("Fout bij aanmaken project"),
  });

  const filtered = projects?.filter((p) =>
    p.naam.toLowerCase().includes(search.toLowerCase())
  );

  const getProjectStats = (project: any) => {
    const students = project.students || [];
    const total = students.length;
    const graded = students.filter((s: any) => s.status === "graded").length;
    const scores = students.flatMap((s: any) =>
      (s.student_scores || []).map((sc: any) => sc.final_score).filter(Boolean)
    );
    const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
    return { total, graded, avg };
  };

  const getStatusColor = (graded: number, total: number) => {
    if (total === 0) return "secondary";
    if (graded === total) return "default";
    return "outline";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">GradeAssist</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nieuw Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuw Project Aanmaken</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="projectName">Projectnaam</Label>
                  <Input
                    id="projectName"
                    placeholder="Bijv. Wiskunde Hoofdstuk 3"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newProjectName.trim()) {
                        createProject.mutate(newProjectName.trim());
                      }
                    }}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createProject.mutate(newProjectName.trim())}
                  disabled={!newProjectName.trim() || createProject.isPending}
                >
                  {createProject.isPending ? "Aanmaken..." : "Aanmaken"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek projecten..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filtered?.length || 0} project{(filtered?.length || 0) !== 1 ? "en" : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-5 bg-muted rounded w-2/3" /></CardHeader>
                <CardContent><div className="h-4 bg-muted rounded w-1/2" /></CardContent>
              </Card>
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {search ? "Geen projecten gevonden" : "Nog geen projecten"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {search ? "Probeer een andere zoekterm" : "Maak je eerste project aan om te beginnen"}
            </p>
            {!search && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nieuw Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered?.map((project) => {
              const stats = getProjectStats(project);
              return (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow border-border"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{project.naam}</CardTitle>
                      <Badge variant={getStatusColor(stats.graded, stats.total)}>
                        {stats.graded}/{stats.total}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {stats.total} student{stats.total !== 1 ? "en" : ""}
                      </div>
                      {stats.avg !== null && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          Gem: {stats.avg.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Date(project.created_at).toLocaleDateString("nl-NL")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;

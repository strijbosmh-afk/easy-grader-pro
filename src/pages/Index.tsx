import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FolderOpen, Users, TrendingUp, Sparkles, Cpu, Archive, ArchiveRestore, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("lovable");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; naam: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const claimOrphans = async () => {
      await supabase.from("projects").update({ user_id: user.id }).is("user_id", null);
    };
    claimOrphans();
  }, [user]);

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
        .insert({ naam, ai_provider: selectedProvider, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      setNewProjectName("");
      setSelectedProvider("lovable");
      toast.success("Project aangemaakt!");
      navigate(`/project/${data.id}`);
    },
    onError: () => toast.error("Fout bij aanmaken project"),
  });

  const toggleArchive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("projects").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { archived }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(archived ? "Project gearchiveerd" : "Project hersteld");
    },
    onError: () => toast.error("Fout bij archiveren"),
  });

  const activeProjects = projects?.filter((p: any) => !p.archived) || [];
  const archivedProjects = projects?.filter((p: any) => p.archived) || [];
  const displayProjects = showArchived ? archivedProjects : activeProjects;

  const filtered = displayProjects.filter((p) =>
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

  const isOwner = (project: any) => project.user_id === user?.id;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projecten</h1>
            <p className="text-muted-foreground text-sm mt-1">Beheer je beoordelingsprojecten</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nieuw Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nieuw Project Aanmaken</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-4">
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
                <div>
                  <Label className="mb-3 block">AI Model voor analyse</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedProvider("lovable")}
                      className={`relative rounded-lg border-2 p-4 text-left transition-all ${
                        selectedProvider === "lovable"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm text-foreground">Gemini 2.5 Flash</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Snel & voordelig. Goed voor standaard beoordelingen en multimodale analyses.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProvider("anthropic")}
                      className={`relative rounded-lg border-2 p-4 text-left transition-all ${
                        selectedProvider === "anthropic"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm text-foreground">Claude Sonnet 4</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Diepgaande analyse. Sterk in nuance, complexe teksten en gedetailleerde feedback.
                      </p>
                    </button>
                  </div>
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
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archief{archivedProjects.length > 0 && ` (${archivedProjects.length})`}
          </Button>
          <span className="text-sm text-muted-foreground">
            {filtered.length} project{filtered.length !== 1 ? "en" : ""}
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {search ? "Geen projecten gevonden" : showArchived ? "Geen gearchiveerde projecten" : "Nog geen projecten"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {search ? "Probeer een andere zoekterm" : showArchived ? "Archiveer projecten om ze hier te zien" : "Maak je eerste project aan om te beginnen"}
            </p>
            {!search && !showArchived && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nieuw Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((project) => {
              const stats = getProjectStats(project);
              const owned = isOwner(project);
              return (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow border-border group"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg truncate">{project.naam}</CardTitle>
                        {!owned && (
                          <Badge variant="outline" className="mt-1 text-[10px]">Gedeeld</Badge>
                        )}
                      </div>
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
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString("nl-NL")}
                      </p>
                      {owned && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Delen"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareProject({ id: project.id, naam: project.naam });
                            }}
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={project.archived ? "Herstellen" : "Archiveren"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleArchive.mutate({ id: project.id, archived: !project.archived });
                            }}
                          >
                            {project.archived ? (
                              <ArchiveRestore className="h-3.5 w-3.5" />
                            ) : (
                              <Archive className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {shareProject && (
        <ShareProjectDialog
          projectId={shareProject.id}
          projectName={shareProject.naam}
          open={!!shareProject}
          onOpenChange={(open) => !open && setShareProject(null)}
        />
      )}
    </div>
  );
};

export default Index;

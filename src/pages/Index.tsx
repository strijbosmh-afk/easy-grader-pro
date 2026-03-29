import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FolderOpen, Users, TrendingUp, Archive, ArchiveRestore, Share2, Beaker } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { NewProjectWizard } from "@/components/NewProjectWizard";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; naam: string } | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Check onboarding status and display_name
  const { data: profile } = useQuery({
    queryKey: ["profile-onboarding", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, display_name")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const needsName = !!profile && !profile.display_name;

  const saveName = async () => {
    if (!nameInput.trim() || !user) return;
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: nameInput.trim() })
      .eq("id", user.id);
    setSavingName(false);
    if (error) {
      toast.error("Kon naam niet opslaan");
    } else {
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding", user.id] });
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("Welkom, " + nameInput.trim() + "!");
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground">
              {profile?.display_name ? `Welkom, ${profile.display_name}` : "Projecten"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Beheer je beoordelingsprojecten</p>
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuw Project
          </Button>
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
        ) : filtered.length === 0 && !search && !showArchived && !profile?.onboarding_completed && !onboardingDismissed ? (
          <OnboardingOverlay onDismiss={() => setOnboardingDismissed(true)} />
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
              <Button onClick={() => setWizardOpen(true)}>
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
                        <div className="flex gap-1 mt-1">
                          {(project as any).is_demo && (
                            <Badge variant="outline" className="text-[10px]"><Beaker className="h-2.5 w-2.5 mr-0.5" />Demo</Badge>
                          )}
                          {!owned && (
                            <Badge variant="outline" className="text-[10px]">Gedeeld</Badge>
                          )}
                        </div>
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

      <NewProjectWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
};

export default Index;

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import {
  Home,
  Plus,
  FolderOpen,
  BarChart3,
  TrendingUp,
  ChevronDown,
  BookOpen,
  HelpCircle,
  Sparkles,
  Cpu,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("lovable");
  const [projectsOpen, setProjectsOpen] = useState(true);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, students(id, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createProject = useMutation({
    mutationFn: async (naam: string) => {
      const { data, error } = await supabase.from("projects").insert({ naam, ai_provider: selectedProvider, user_id: user?.id }).select().single();
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

  const isActive = (path: string) => location.pathname === path;

  const recentProjects = projects?.filter((p: any) => !p.archived).slice(0, 8) || [];

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-base font-bold text-sidebar-foreground">GradeAssist</h1>
                <p className="text-[10px] text-sidebar-foreground/50">Beoordelingsplatform</p>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* Main nav */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/" end activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Home className="h-4 w-4 mr-2" />
                      {!collapsed && <span>Dashboard</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/statistieken" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {!collapsed && <span>Statistieken</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Projects */}
          <SidebarGroup>
            <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
              <CollapsibleTrigger className="w-full">
                <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:text-sidebar-foreground transition-colors">
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Projecten
                  </span>
                  {!collapsed && (
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${projectsOpen ? "" : "-rotate-90"}`} />
                  )}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setDialogOpen(true)}
                        className="text-sidebar-primary hover:text-sidebar-primary"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {!collapsed && <span>Nieuw project</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {recentProjects.map((project) => {
                      const studentCount = project.students?.length || 0;
                      const gradedCount = project.students?.filter((s: any) => s.status === "graded").length || 0;
                      const projectPath = `/project/${project.id}`;
                      const active = location.pathname.startsWith(projectPath);

                      return (
                        <SidebarMenuItem key={project.id}>
                          <SidebarMenuButton
                            onClick={() => navigate(projectPath)}
                            className={active ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""}
                            title={project.naam}
                          >
                            <BookOpen className="h-4 w-4 mr-2 shrink-0" />
                            {!collapsed && (
                              <div className="flex items-center justify-between w-full min-w-0">
                                <span className="truncate text-sm">{project.naam}</span>
                                {studentCount > 0 && (
                                  <Badge
                                    variant={gradedCount === studentCount ? "default" : "secondary"}
                                    className="ml-2 text-[10px] px-1.5 py-0 shrink-0"
                                  >
                                    {gradedCount}/{studentCount}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}

                    {projects && projects.length > 8 && !collapsed && (
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => navigate("/")} className="text-xs text-sidebar-foreground/50">
                          Bekijk alle {projects.length} projecten →
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4">
          {!collapsed && (
            <div className="rounded-lg bg-sidebar-accent p-3">
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Tip: Sleep PDF's in een project om studenten toe te voegen</span>
              </div>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuw Project Aanmaken</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div>
              <Label htmlFor="sidebarProjectName">Projectnaam</Label>
              <Input
                id="sidebarProjectName"
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
    </>
  );
}

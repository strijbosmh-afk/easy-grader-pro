import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, UserPlus, ShieldCheck } from "lucide-react";

interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteReviewerDialog({ projectId, projectName, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reviewer");

  const { data: reviewers, isLoading } = useQuery({
    queryKey: ["project-reviewers", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_reviewers")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      // Fetch profiles separately
      const ids = data.map((r: any) => r.reviewer_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      return data.map((r: any) => ({
        ...r,
        profile: profiles?.find((p: any) => p.id === r.reviewer_id),
      }));
    },
    enabled: open,
  });

  const invite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();
      if (pErr || !profile) throw new Error("Deze gebruiker heeft nog geen GradeAssist account");

      const { error } = await supabase.from("project_reviewers").insert({
        project_id: projectId,
        reviewer_id: profile.id,
        role,
      } as any);
      if (error) {
        if (error.code === "23505") throw new Error("Deze reviewer is al uitgenodigd");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-reviewers", projectId] });
      setEmail("");
      toast.success("Reviewer uitgenodigd!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_reviewers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-reviewers", projectId] });
      toast.success("Reviewer verwijderd");
    },
    onError: () => toast.error("Verwijderen mislukt"),
  });

  const statusLabel = (s: string) => {
    if (s === "accepted") return "Geaccepteerd";
    if (s === "declined") return "Geweigerd";
    return "Uitgenodigd";
  };

  const statusVariant = (s: string) => {
    if (s === "accepted") return "default" as const;
    if (s === "declined") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Reviewer uitnodigen
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{projectName}</p>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="reviewer-email" className="sr-only">E-mailadres</Label>
              <Input
                id="reviewer-email"
                placeholder="E-mailadres van reviewer"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim()) invite.mutate({ email: email.trim(), role });
                }}
              />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              onClick={() => email.trim() && invite.mutate({ email: email.trim(), role })}
              disabled={!email.trim() || invite.isPending}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : reviewers && reviewers.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Uitgenodigd</Label>
              {reviewers.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.profile?.display_name || r.profile?.email || "Onbekend"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{r.profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {r.role === "moderator" ? "Moderator" : "Reviewer"}
                    </Badge>
                    <Badge variant={statusVariant(r.status)} className="text-[10px]">
                      {statusLabel(r.status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nog geen reviewers uitgenodigd
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
import { Trash2, UserPlus } from "lucide-react";

interface ShareProjectDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareProjectDialog({ projectId, projectName, open, onOpenChange }: ShareProjectDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<string>("view");

  const { data: shares, isLoading } = useQuery({
    queryKey: ["project-shares", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_shares")
        .select("*, profiles:shared_with_user_id(display_name, email)")
        .eq("project_id", projectId);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const addShare = useMutation({
    mutationFn: async ({ email, permission }: { email: string; permission: string }) => {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();
      if (profileError || !profile) throw new Error("Gebruiker niet gevonden met dit e-mailadres");

      const { error } = await supabase.from("project_shares").insert({
        project_id: projectId,
        shared_with_user_id: profile.id,
        permission,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Project is al gedeeld met deze gebruiker");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-shares", projectId] });
      setEmail("");
      toast.success("Project gedeeld!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeShare = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from("project_shares").delete().eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-shares", projectId] });
      toast.success("Delen verwijderd");
    },
    onError: () => toast.error("Fout bij verwijderen"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project delen: {projectName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="share-email" className="sr-only">E-mailadres</Label>
              <Input
                id="share-email"
                placeholder="E-mailadres van collega"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim()) {
                    addShare.mutate({ email: email.trim(), permission });
                  }
                }}
              />
            </div>
            <Select value={permission} onValueChange={setPermission}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">Bekijken</SelectItem>
                <SelectItem value="edit">Bewerken</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              onClick={() => email.trim() && addShare.mutate({ email: email.trim(), permission })}
              disabled={!email.trim() || addShare.isPending}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : shares && shares.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Gedeeld met</Label>
              {shares.map((share: any) => (
                <div key={share.id} className="flex items-center justify-between rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {share.profiles?.display_name || share.profiles?.email || "Onbekend"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{share.profiles?.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {share.permission === "edit" ? "Bewerken" : "Bekijken"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeShare.mutate(share.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Dit project is nog niet gedeeld
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

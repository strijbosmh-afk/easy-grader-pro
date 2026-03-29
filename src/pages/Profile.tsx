import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, LogOut, User, Mail, Shield } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const [displayName, setDisplayName] = useState("");

  // Sync state when profile loads
  const nameValue = displayName || profile?.display_name || "";

  const updateProfile = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: newName })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Profiel bijgewerkt!");
    },
    onError: () => toast.error("Fout bij opslaan profiel"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (profile?.display_name || user?.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mijn Profiel</h1>
        <p className="text-sm text-muted-foreground mt-1">Beheer je accountinstellingen</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profielgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar & basic info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{profile?.display_name || "Onbekend"}</p>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {profile?.email || user?.email}
              </div>
            </div>
          </div>

          <Separator />

          {/* Edit form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Weergavenaam</Label>
              <Input
                id="displayName"
                value={nameValue}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Je naam"
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={profile?.email || user?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">E-mailadres wordt beheerd via Google</p>
            </div>

            <Button
              onClick={() => updateProfile.mutate(displayName || nameValue)}
              disabled={updateProfile.isPending || !nameValue.trim()}
            >
              {updateProfile.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Opslaan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Uitloggen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

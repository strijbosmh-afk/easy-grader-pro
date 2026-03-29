import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, Users, Ban, UserX, UserCheck, MoreHorizontal, Trash2, CircleCheck, CircleOff } from "lucide-react";
import { Navigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<{
    type: "ban" | "unban" | "delete";
    userId: string;
    userName: string;
  } | null>(null);

  // Check if current user is admin
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!user?.id,
  });

  // Fetch all profiles (admin-only via RLS)
  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: isAdmin === true,
  });

  // Fetch all roles (admin-only via RLS)
  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*");
      if (error) throw error;
      return data as UserRole[];
    },
    enabled: isAdmin === true,
  });

  // Fetch user statuses (ban info) from edge function
  const { data: userStatuses } = useQuery({
    queryKey: ["admin-user-statuses"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      return (data?.users || []) as { id: string; banned: boolean; last_sign_in: string | null }[];
    },
    enabled: isAdmin === true,
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error: delError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (delError) throw delError;

      const { error: insError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole } as any);
      if (insError) throw insError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast.success("Rol bijgewerkt!");
    },
    onError: () => toast.error("Fout bij aanpassen rol"),
  });

  const adminAction = useMutation({
    mutationFn: async ({ action, targetUserId }: { action: string; targetUserId: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action, targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      const msgs: Record<string, string> = {
        ban: "Gebruiker gedeactiveerd",
        unban: "Gebruiker geheractiveerd",
        delete: "Gebruiker verwijderd",
      };
      toast.success(msgs[variables.action] || "Actie uitgevoerd");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-statuses"] });
      setConfirmAction(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Fout bij uitvoeren actie");
      setConfirmAction(null);
    },
  });

  if (checkingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const getUserRole = (userId: string) => {
    return roles?.find((r) => r.user_id === userId)?.role || "user";
  };

  const getInitials = (name: string | null, email: string | null) => {
    const source = name || email || "U";
    return source
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "destructive" as const;
      case "moderator": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const confirmTitle: Record<string, string> = {
    ban: "Gebruiker deactiveren",
    unban: "Gebruiker heractiveren",
    delete: "Gebruiker permanent verwijderen",
  };

  const confirmDesc: Record<string, string> = {
    ban: "Deze gebruiker kan niet meer inloggen. Je kunt dit later ongedaan maken.",
    unban: "Deze gebruiker kan weer inloggen.",
    delete: "Dit verwijdert het account en alle bijbehorende data permanent. Dit kan niet ongedaan worden gemaakt.",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Gebruikersbeheer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Beheer gebruikers en rollen
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alle gebruikers
            {profiles && (
              <Badge variant="secondary" className="ml-1">{profiles.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProfiles ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Geregistreerd</TableHead>
                  <TableHead className="w-[140px]">Rol wijzigen</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles?.map((profile) => {
                  const currentRole = getUserRole(profile.id);
                  const isSelf = profile.id === user?.id;
                  const status = userStatuses?.find((s) => s.id === profile.id);
                  const isBanned = status?.banned ?? false;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={profile.avatar_url || undefined} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(profile.display_name, profile.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">
                            {profile.display_name || "Onbekend"}
                            {isSelf && <span className="text-muted-foreground ml-1">(jij)</span>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {profile.email}
                      </TableCell>
                      <TableCell>
                        {isBanned ? (
                          <Badge variant="destructive" className="gap-1">
                            <CircleOff className="h-3 w-3" />
                            Gedeactiveerd
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                            <CircleCheck className="h-3 w-3" />
                            Actief
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(currentRole)}>
                          {currentRole === "admin" && <ShieldCheck className="h-3 w-3 mr-1" />}
                          {currentRole}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(profile.created_at).toLocaleDateString("nl-BE")}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={currentRole}
                          onValueChange={(newRole) =>
                            updateRole.mutate({ userId: profile.id, newRole })
                          }
                          disabled={isSelf}
                        >
                          <SelectTrigger className="h-8 text-xs w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="moderator">Moderator</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: "ban",
                                    userId: profile.id,
                                    userName: profile.display_name || profile.email || "deze gebruiker",
                                  })
                                }
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                Deactiveren
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: "unban",
                                    userId: profile.id,
                                    userName: profile.display_name || profile.email || "deze gebruiker",
                                  })
                                }
                              >
                                <UserCheck className="h-4 w-4 mr-2" />
                                Heractiveren
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  setConfirmAction({
                                    type: "delete",
                                    userId: profile.id,
                                    userName: profile.display_name || profile.email || "deze gebruiker",
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Verwijderen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction && confirmTitle[confirmAction.type]}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmAction?.userName}</strong>
              <br />
              {confirmAction && confirmDesc[confirmAction.type]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adminAction.isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              disabled={adminAction.isPending}
              onClick={() => {
                if (confirmAction) {
                  adminAction.mutate({
                    action: confirmAction.type,
                    targetUserId: confirmAction.userId,
                  });
                }
              }}
            >
              {adminAction.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {confirmAction?.type === "delete" ? "Permanent verwijderen" : "Bevestigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

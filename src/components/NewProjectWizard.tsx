import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/supabase-helpers";
import {
  Sparkles, Cpu, ArrowRight, ArrowLeft, Send, Users, MessageSquare, Loader2, Check, Share2,
} from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

interface NewProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectWizard({ open, onOpenChange }: NewProjectWizardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Step state
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [educationContext, setEducationContext] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("lovable");

  // Step 2: Sharing
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sharePermission, setSharePermission] = useState("edit");

  // Step 3: Context chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all users for sharing
  const { data: allProfiles } = useQuery({
    queryKey: ["all-profiles-for-sharing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .neq("id", user!.id)
        .order("display_name");
      if (error) throw error;
      return data;
    },
    enabled: open && !!user?.id,
  });

  // Create project mutation
  const createProject = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          naam: projectName.trim(),
          ai_provider: selectedProvider,
          user_id: user?.id,
          custom_instructions: contextSummary,
          education_context: educationContext.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Share with selected users
      if (selectedUsers.length > 0) {
        const shares = selectedUsers.map((uid) => ({
          project_id: data.id,
          shared_with_user_id: uid,
          permission: sharePermission,
        }));
        await supabase.from("project_shares").insert(shares);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["shared-projects"] });
      resetWizard();
      toast.success("Project aangemaakt!");
      navigate(`/project/${data.id}`);
    },
    onError: () => toast.error("Fout bij aanmaken project"),
  });

  const resetWizard = () => {
    setStep(0);
    setProjectName("");
    setEducationContext("");
    setSelectedProvider("lovable");
    setSelectedUsers([]);
    setSharePermission("edit");
    setMessages([]);
    setChatInput("");
    setContextSummary(null);
    setChatStarted(false);
    onOpenChange(false);
  };

  // Auto-scroll chat
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Start context chat when entering step 3
  useEffect(() => {
    if (step === 2 && !chatStarted) {
      setChatStarted(true);
      sendChatMessage([]);
    }
  }, [step]);

  const sendChatMessage = async (currentMessages: ChatMessage[], userInput?: string) => {
    const newMessages = userInput
      ? [...currentMessages, { role: "user" as const, content: userInput }]
      : currentMessages;

    if (userInput) {
      setMessages(newMessages);
    }
    setChatInput("");
    setIsChatLoading(true);

    try {
      const { data, error } = await invokeEdgeFunction("project-context-chat", {
        body: {
          messages: newMessages,
          projectName: projectName.trim(),
          aiProvider: selectedProvider,
        },
      });

      if (error) throw error;

      if (data.contextSummary) {
        setContextSummary(data.contextSummary);
      }

      if (data.reply) {
        const updated = [...newMessages, { role: "assistant" as const, content: data.reply }];
        setMessages(updated);
      }
    } catch (e: any) {
      toast.error(e.message || "Fout bij het chatten");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || isChatLoading) return;
    sendChatMessage(messages, chatInput.trim());
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const canProceedStep0 = projectName.trim().length > 0;
  const steps = ["Project", "Delen", "Context"];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetWizard(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nieuw Project</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {steps.map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-xs ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < steps.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Name + AI Model */}
          {step === 0 && (
            <div className="space-y-5 pt-2">
              <div>
                <Label htmlFor="wizardProjectName">Projectnaam</Label>
                <Input
                  id="wizardProjectName"
                  placeholder="Bijv. Wiskunde Hoofdstuk 3"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label className="mb-3 block">Standaard AI Model</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("lovable")}
                    className={`rounded-lg border-2 p-4 text-left transition-all ${
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
                      Snel & voordelig. Goed voor standaard beoordelingen.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("anthropic")}
                    className={`rounded-lg border-2 p-4 text-left transition-all ${
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
                      Diepgaand. Sterk in nuance en complexe teksten.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="wizardEduContext" className="text-muted-foreground">
                  Onderwijscontext (optioneel)
                </Label>
                <textarea
                  id="wizardEduContext"
                  className="w-full min-h-[70px] mt-1.5 text-sm rounded-md border border-input bg-muted/30 px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Bv: Bacheloropleiding kleuteronderwijs, 2e jaar. Studenten schrijven een reflectieverslag over hun stage-ervaring in een Vlaamse kleuterschool."
                  value={educationContext}
                  onChange={(e) => setEducationContext(e.target.value.slice(0, 500))}
                  maxLength={500}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-muted-foreground">
                    Beschrijf kort de opleiding, het niveau en het type student. Dit helpt de AI om feedback beter af te stemmen. Laat leeg als je dit niet nodig hebt.
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {educationContext.length} / 500
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Sharing */}
          {step === 1 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Share2 className="h-4 w-4" />
                <span>Selecteer collega's om dit project mee te delen (optioneel)</span>
              </div>

              <ScrollArea className="h-48 rounded-lg border">
                {allProfiles && allProfiles.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {allProfiles.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedUsers.includes(profile.id)}
                          onCheckedChange={() => toggleUser(profile.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {profile.display_name || profile.email}
                          </p>
                          {profile.display_name && (
                            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nog geen andere gebruikers beschikbaar
                  </p>
                )}
              </ScrollArea>

              {selectedUsers.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Rechten:</Label>
                  <div className="flex gap-2">
                    <Badge
                      variant={sharePermission === "view" ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSharePermission("view")}
                    >
                      Bekijken
                    </Badge>
                    <Badge
                      variant={sharePermission === "edit" ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSharePermission("edit")}
                    >
                      Bewerken
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Context Chat */}
          {step === 2 && (
            <div className="flex flex-col h-[350px]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <MessageSquare className="h-4 w-4" />
                <span>Vertel de AI meer over je project voor betere beoordelingen</span>
              </div>

              <ScrollArea className="flex-1 rounded-lg border p-3" ref={scrollRef}>
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Typ je antwoord..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  disabled={isChatLoading}
                />
                <Button
                  size="icon"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isChatLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {contextSummary && (
                <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                  <Check className="h-3.5 w-3.5" />
                  <span>Projectcontext opgeslagen!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => step === 0 ? resetWizard() : setStep(step - 1)}
          >
            {step === 0 ? "Annuleren" : (
              <>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Vorige
              </>
            )}
          </Button>

          <div className="flex gap-2">
            {step === 2 && (
              <Button
                variant="outline"
                onClick={() => createProject.mutate()}
                disabled={createProject.isPending}
              >
                {contextSummary ? "Project aanmaken" : "Overslaan & aanmaken"}
              </Button>
            )}
            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 0 && !canProceedStep0}
              >
                Volgende
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              contextSummary && (
                <Button
                  onClick={() => createProject.mutate()}
                  disabled={createProject.isPending}
                >
                  {createProject.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Project aanmaken
                </Button>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, Loader2, ChevronDown, ChevronUp, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Message = { role: "user" | "assistant"; content: string };

interface GradingChatProps {
  projectId: string;
  onReAnalyzeRequested: () => void;
  onInstructionsCleared?: () => void;
  customInstructions?: string | null;
}

export function GradingChat({ projectId, onReAnalyzeRequested, onInstructionsCleared, customInstructions }: GradingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showReAnalyze, setShowReAnalyze] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("chat-grading", {
        body: { messages: newMessages, projectId },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      const assistantMsg: Message = { role: "assistant", content: data.reply };
      setMessages([...newMessages, assistantMsg]);

      // If instructions were saved, show re-analyze option and refresh project data
      if (data.savedInstructions !== undefined && data.savedInstructions !== null) {
        setShowReAnalyze(true);
        toast.success("Beoordelingsinstructies opgeslagen!");
        onInstructionsCleared?.(); // triggers a project refresh in parent
      }

      // Check if the AI mentions re-analysis in its reply
      if (data.reply?.toLowerCase().includes("heranalyse")) {
        setShowReAnalyze(true);
      }
    } catch (err: any) {
      toast.error(err?.message || "Chatfout");
    } finally {
      setIsLoading(false);
    }
  };

  const clearInstructions = async () => {
    if (!customInstructions) return;
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ custom_instructions: null })
        .eq("id", projectId);

      if (error) throw error;

      setMessages([]);
      setShowReAnalyze(false);
      toast.success("Instructies gewist.");
      onInstructionsCleared?.();
    } catch (err: any) {
      toast.error(err?.message || "Kon instructies niet wissen");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                My Personal Assistant
                {customInstructions && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Instructies actief
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {messages.length} berichten
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
            {!isOpen && (
              <p className="text-xs text-muted-foreground mt-1">
                Geef specifieke instructies aan de AI voor betere beoordelingen
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Active instructions indicator with clear button */}
            {customInstructions && (
              <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-primary">Actieve instructies:</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearInstructions();
                    }}
                    disabled={isClearing}
                    title="Wis alle instructies"
                  >
                    {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    <span className="ml-1">Wissen</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{customInstructions}</p>
              </div>
            )}

            {/* Messages area */}
            <div className="max-h-64 overflow-y-auto space-y-2 rounded-md bg-muted/30 p-3 min-h-[80px]">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Stel een vraag of geef instructies. Bijvoorbeeld:
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                    {["Let extra op spelling", "Wees strenger bij bronvermelding", "Geef meer gewicht aan creativiteit"].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="text-[10px] px-2 py-1 rounded-full bg-background border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border border-border"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-background border border-border rounded-lg px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Re-analyze prompt */}
            {showReAnalyze && (
              <div className="flex items-center gap-2 rounded-md bg-accent/50 border border-accent p-2.5">
                <RefreshCw className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-foreground flex-1">
                  Instructies opgeslagen. Wil je een heranalyse starten?
                </p>
                <Button
                  size="sm"
                  variant="default"
                  className="text-xs h-7"
                  onClick={() => {
                    setShowReAnalyze(false);
                    onReAnalyzeRequested();
                  }}
                >
                  Heranalyse
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => setShowReAnalyze(false)}
                >
                  Later
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Typ een instructie of vraag..."
                className="text-xs h-8"
                disabled={isLoading}
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Check, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; naam: string; share_token: string | null; share_enabled: boolean } | null;
  onUpdated: () => void;
}

export function ShareFeedbackDialog({ open, onOpenChange, student, onUpdated }: Props) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!student) return null;

  const shareUrl = student.share_token
    ? `${window.location.origin}/student/feedback/${student.share_token}`
    : null;

  const generateLink = async () => {
    setGenerating(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase
        .from("students")
        .update({ share_token: token, share_enabled: true })
        .eq("id", student.id);
      if (error) throw error;
      onUpdated();
      toast.success("Deelbare link aangemaakt");
    } catch {
      toast.error("Kon deelbare link niet aanmaken");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link gekopieerd!");
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSharing = async () => {
    const { error } = await supabase
      .from("students")
      .update({ share_enabled: !student.share_enabled })
      .eq("id", student.id);
    if (error) { toast.error("Kon delen niet wijzigen"); return; }
    onUpdated();
    toast.success(student.share_enabled ? "Delen uitgeschakeld" : "Delen ingeschakeld");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deel feedback — {student.naam}</DialogTitle>
          <DialogDescription>
            Genereer een unieke link waarmee de student zijn/haar feedback kan bekijken.
          </DialogDescription>
        </DialogHeader>

        {!student.share_token ? (
          <div className="py-4 text-center">
            <Button onClick={generateLink} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Deelbare link genereren
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Input value={shareUrl || ""} readOnly className="text-xs" />
              <Button size="icon" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={shareUrl || "#"} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Delen is {student.share_enabled ? "actief" : "uitgeschakeld"}</span>
              <Button size="sm" variant={student.share_enabled ? "destructive" : "default"} onClick={toggleSharing}>
                {student.share_enabled ? "Uitschakelen" : "Inschakelen"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

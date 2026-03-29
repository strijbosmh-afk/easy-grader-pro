import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Bot, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const dismissPermanently = async () => {
    if (user) {
      await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    }
    onDismiss();
  };

  const createDemo = async () => {
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Niet ingelogd");

      const res = await supabase.functions.invoke("create-demo-project", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      const { projectId } = res.data;
      toast.success("Demo-project aangemaakt!");
      navigate(`/project/${projectId}`);
    } catch (err: any) {
      toast.error("Fout bij aanmaken demo-project: " + (err.message || "Onbekende fout"));
    } finally {
      setCreating(false);
    }
  };

  const steps = [
    // Step 1: Welcome
    <div key="welcome" className="text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">Welkom bij GradeAssist</h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        GradeAssist helpt docenten om studentwerk sneller en consistenter te beoordelen met behulp van AI.
        Upload je beoordelingsrubric en studentverslagen, en ontvang gedetailleerde, rubric-getrouwe feedback.
      </p>
    </div>,

    // Step 2: How it works
    <div key="how" className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground text-center">Hoe het werkt</h2>
      <div className="grid grid-cols-3 gap-6">
        {[
          { icon: Upload, title: "Upload rubric", desc: "Upload je beoordelingstabel als PDF" },
          { icon: FileText, title: "Upload studentwerk", desc: "Voeg de PDF-verslagen van studenten toe" },
          { icon: Bot, title: "AI beoordeelt", desc: "Ontvang scores, feedback en motivatie per criterium" },
        ].map((item, i) => (
          <div key={i} className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <item.icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
            {i < 2 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto mt-1 hidden md:block absolute right-0 top-1/2 -translate-y-1/2" />
            )}
          </div>
        ))}
      </div>
    </div>,

    // Step 3: Try it
    <div key="try" className="text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">Probeer het zelf</h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        We hebben een demo-project klaargezet met voorbeeldcriteria en beoordeelde studenten.
        Zo kun je direct zien hoe GradeAssist werkt.
      </p>
      <Button size="lg" onClick={createDemo} disabled={creating} className="mt-2">
        {creating ? "Aanmaken..." : "Bekijk demo-project"}
        {!creating && <ArrowRight className="h-4 w-4 ml-1" />}
      </Button>
    </div>,
  ];

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="w-full max-w-lg border-border shadow-lg">
        <CardContent className="pt-8 pb-6 px-8">
          {steps[step]}

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
              className={step === 0 ? "invisible" : ""}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Vorige
            </Button>

            <button
              onClick={dismissPermanently}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Overslaan
            </button>

            {step < steps.length - 1 && (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Volgende <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === steps.length - 1 && <div className="w-20" />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { CheckCircle, Circle, FileText, Upload, Bot, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  done: boolean;
  active: boolean;
}

interface WorkflowStepperProps {
  hasOpdracht: boolean;
  hasGraderingstabel: boolean;
  hasStudents: boolean;
  hasAnalysedStudents: boolean;
  allGraded: boolean;
}

export function WorkflowStepper({
  hasOpdracht,
  hasGraderingstabel,
  hasStudents,
  hasAnalysedStudents,
  allGraded,
}: WorkflowStepperProps) {
  const docsReady = hasOpdracht && hasGraderingstabel;

  const steps: Step[] = [
    {
      icon: FileText,
      label: "Documenten",
      sublabel: docsReady ? "Klaar" : !hasOpdracht && !hasGraderingstabel ? "Upload rubric & opdracht" : !hasOpdracht ? "Opdracht ontbreekt" : "Rubric ontbreekt",
      done: docsReady,
      active: !docsReady,
    },
    {
      icon: Upload,
      label: "Studenten",
      sublabel: hasStudents ? "Bestanden geüpload" : "Upload studentwerk",
      done: hasStudents,
      active: docsReady && !hasStudents,
    },
    {
      icon: Bot,
      label: "AI-analyse",
      sublabel: hasAnalysedStudents ? "Analyse uitgevoerd" : "Start AI-beoordeling",
      done: hasAnalysedStudents,
      active: docsReady && hasStudents && !hasAnalysedStudents,
    },
    {
      icon: Download,
      label: "Afronden",
      sublabel: allGraded ? "Alles beoordeeld ✓" : "Controleer & exporteer",
      done: allGraded,
      active: hasAnalysedStudents && !allGraded,
    },
  ];

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={i} className="flex items-center flex-1">
            <div
              className={cn(
                "flex flex-col items-center gap-1 flex-1 min-w-0",
              )}
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all",
                  step.done
                    ? "bg-primary border-primary text-primary-foreground"
                    : step.active
                    ? "border-primary text-primary bg-primary/5 shadow-sm shadow-primary/20"
                    : "border-border text-muted-foreground bg-muted/40",
                )}
              >
                {step.done ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="text-center hidden sm:block">
                <p className={cn("text-xs font-semibold", step.active ? "text-primary" : step.done ? "text-foreground" : "text-muted-foreground")}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">{step.sublabel}</p>
              </div>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1 rounded transition-all",
                  steps[i + 1].done || steps[i + 1].active ? "bg-primary/40" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

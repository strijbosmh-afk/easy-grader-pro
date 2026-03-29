import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentStudentName: string;
  failedNames: string[];
  startTime: number;
  studentTimes: number[]; // ms per completed student
  concurrency?: number;
}

export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  avgTimeMs: number;
  avgConfidence: string;
  validationWarnings: number;
}

interface BatchProgressOverlayProps {
  progress: BatchProgress | null;
  onCancel: () => void;
  summary: BatchSummary | null;
  onCloseSummary: () => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function BatchProgressOverlay({ progress, onCancel, summary, onCloseSummary }: BatchProgressOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!progress) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - progress.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [progress?.startTime]);

  // Summary dialog
  if (summary) {
    return (
      <Dialog open onOpenChange={() => onCloseSummary()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batchbeoordeling voltooid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{summary.success} geslaagd</span>
              </div>
              {summary.failed > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>{summary.failed} mislukt</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Gem. {formatTime(summary.avgTimeMs)} per student</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">AI</span>
                <span>Confidence: {summary.avgConfidence}</span>
              </div>
            </div>
            {summary.validationWarnings > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{summary.validationWarnings} validatiewaarschuwing{summary.validationWarnings !== 1 ? "en" : ""}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={onCloseSummary}>Bekijk resultaten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!progress) return null;

  const pct = progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0;
  const remaining = progress.total - progress.completed - progress.failed;
  const avgTime = progress.studentTimes.length > 0
    ? progress.studentTimes.reduce((a, b) => a + b, 0) / progress.studentTimes.length
    : 0;
  const eta = remaining > 0 && avgTime > 0 ? (remaining * avgTime) / (progress.concurrency || 1) : 0;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Batchbeoordeling bezig...</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Progress value={pct} className="h-2" />

          {progress.concurrency && progress.concurrency > 1 && (
            <p className="text-xs text-muted-foreground">
              Parallelle verwerking: {progress.concurrency} tegelijk
            </p>
          )}

          <p className="text-sm text-foreground">
            {progress.completed + progress.failed} van {progress.total} voltooid
            {progress.currentStudentName && (
              <span className="text-muted-foreground"> — Bezig met: {progress.currentStudentName}</span>
            )}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Verstreken: {formatTime(elapsed)}
            </span>
            {eta > 0 && (
              <span>Geschat resterend: {formatTime(eta)}</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 dark:text-green-400">✓ {progress.completed} geslaagd</span>
            {progress.failed > 0 && (
              <span className="text-destructive">✗ {progress.failed} mislukt</span>
            )}
            <span className="text-muted-foreground">⏳ {remaining} resterend</span>
          </div>

          {progress.failedNames.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
              Mislukt: {progress.failedNames.join(", ")}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Annuleren... Huidige beoordelingen worden afgerond
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

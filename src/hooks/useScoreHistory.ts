import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScoreChange {
  studentId: string;
  studentName: string;
  criteriumId: string;
  criteriumName: string;
  previousScore: string;
  previousOpmerkingen: string;
  timestamp: number;
}

const MAX_STACK = 50;
const AUTO_HIDE_MS = 10_000;

export function useScoreHistory(projectId: string | undefined) {
  const [stack, setStack] = useState<ScoreChange[]>([]);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const [undoing, setUndoing] = useState(false);

  // Reset stack when project changes
  useEffect(() => {
    setStack([]);
    setVisible(false);
  }, [projectId]);

  const canUndo = stack.length > 0;

  const pushChange = useCallback((change: ScoreChange) => {
    setStack((prev) => [change, ...prev].slice(0, MAX_STACK));
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, []);

  const pushChanges = useCallback((changes: ScoreChange[]) => {
    if (changes.length === 0) return;
    setStack((prev) => [...changes, ...prev].slice(0, MAX_STACK));
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, []);

  const undo = useCallback(async (
    onSuccess?: (change: ScoreChange) => void
  ) => {
    const top = stack[0];
    if (!top || undoing) return;
    setUndoing(true);
    try {
      // Write previous score back to Supabase
      await supabase
        .from("student_scores")
        .update({
          final_score: top.previousScore !== "" ? parseFloat(top.previousScore) : null,
          opmerkingen: top.previousOpmerkingen || null,
        })
        .eq("student_id", top.studentId)
        .eq("criterium_id", top.criteriumId);

      // Log the undo to audit trail
      await supabase.from("score_audit_log").insert({
        student_id: top.studentId,
        criterium_id: top.criteriumId,
        new_score: top.previousScore !== "" ? parseFloat(top.previousScore) : null,
        new_opmerkingen: top.previousOpmerkingen || null,
        change_type: "undo",
      });

      setStack((prev) => prev.slice(1));
      toast.success(`Score teruggezet voor ${top.studentName} — ${top.criteriumName}`);
      onSuccess?.(top);

      // Reset auto-hide timer
      if (stack.length > 1) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
      } else {
        setVisible(false);
      }
    } catch {
      toast.error("Ongedaan maken mislukt");
    } finally {
      setUndoing(false);
    }
  }, [stack, undoing]);

  const lastChange = stack[0] ?? null;

  // Show button on hover/interaction
  const showButton = useCallback(() => {
    if (canUndo) {
      setVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }
  }, [canUndo]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(hideTimer.current);
  }, []);

  return {
    canUndo,
    pushChange,
    pushChanges,
    undo,
    undoing,
    lastChange,
    visible,
    showButton,
    stackSize: stack.length,
  };
}

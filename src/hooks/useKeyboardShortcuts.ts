import { useEffect, useCallback } from "react";

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** If true, fires even when an input is focused */
  global?: boolean;
  action: () => void;
  label: string;
  category?: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const altMatch = s.alt ? e.altKey : !e.altKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;

        if (e.key === s.key && ctrlMatch && altMatch && shiftMatch) {
          if (!s.global && isInputFocused()) continue;
          e.preventDefault();
          s.action();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}

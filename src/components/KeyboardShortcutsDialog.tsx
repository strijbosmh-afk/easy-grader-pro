import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useKeyboardShortcuts, type Shortcut } from "@/hooks/useKeyboardShortcuts";

interface Props {
  shortcuts: Shortcut[];
}

function formatKey(s: Shortcut): string {
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");

  const keyMap: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Escape: "Esc",
    "?": "?",
    s: "S",
    z: "Z",
    j: "J",
    k: "K",
  };
  parts.push(keyMap[s.key] || s.key.toUpperCase());
  return parts.join(" + ");
}

export function KeyboardShortcutsDialog({ shortcuts }: Props) {
  const [open, setOpen] = useState(false);

  // Register "?" to open this dialog
  useKeyboardShortcuts([
    {
      key: "?",
      shift: true,
      action: () => setOpen(true),
      label: "Sneltoetsen tonen",
    },
  ]);

  // Group by category
  const categories = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    const cat = s.category || "Overig";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(s);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 gap-1.5 text-muted-foreground hover:text-foreground shadow-sm border border-border bg-background"
      >
        <Keyboard className="h-4 w-4" />
        <span className="text-xs">Sneltoetsen</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Sneltoetsen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {Array.from(categories.entries()).map(([cat, items]) => (
              <div key={cat}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {cat}
                </h4>
                <div className="space-y-1">
                  {items.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <span className="text-sm text-foreground">{s.label}</span>
                      <kbd className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                        {formatKey(s)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Druk op <kbd className="rounded border border-border bg-muted px-1 text-[10px] font-mono">?</kbd> om dit venster te openen
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

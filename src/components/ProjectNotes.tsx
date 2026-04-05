import { useState, useEffect, useRef } from "react";
import { StickyNote } from "lucide-react";

interface ProjectNotesProps {
  projectId: string;
}

export function ProjectNotes({ projectId }: ProjectNotesProps) {
  const key = `project-notes-${projectId}`;
  const [notes, setNotes] = useState(() => localStorage.getItem(key) ?? "");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (val: string) => {
    setNotes(val);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(key, val);
      setSaved(true);
    }, 800);
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <StickyNote className="h-3 w-3" />
        Persoonlijke notities
        <span className={`ml-auto text-[10px] transition-opacity ${saved ? "opacity-0" : "opacity-100 text-amber-500"}`}>
          Opslaan...
        </span>
      </label>
      <textarea
        className="w-full min-h-[70px] text-sm rounded-md border border-input bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        placeholder="Noteer hier je eigen gedachten, herinneringen of aandachtspunten voor dit project. Alleen zichtbaar voor jou."
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
      />
      <p className="text-[10px] text-muted-foreground">Automatisch opgeslagen op dit apparaat.</p>
    </div>
  );
}

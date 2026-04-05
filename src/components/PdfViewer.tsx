import { useEffect, useState } from "react";
import { Loader2, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerProps {
  url: string | null;
  title?: string;
  className?: string;
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PdfViewer({ url, title = "Document", className = "" }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (!url) return;
    setBlobUrl(null);
    setError(false);

    // iOS Safari handles PDFs natively when opened in a new tab.
    // No blob URL needed there — just use the direct URL.
    if (ios) return;

    // Desktop: download as blob to avoid cross-origin iframe restrictions.
    setLoading(true);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Fetch failed");
        return r.blob();
      })
      .then((blob) => {
        setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url]);

  if (!url) return null;

  // iOS: can't reliably render PDF in iframe — show native open button
  if (ios) {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 p-6 ${className}`}>
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">
          PDF-bestanden openen in Safari
        </p>
        <Button asChild size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open PDF
          </a>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
        <FileText className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Kan PDF niet laden</p>
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in nieuw tabblad
          </a>
        </Button>
      </div>
    );
  }

  return (
    <iframe
      src={`${blobUrl}#toolbar=1&navpanes=0`}
      className={`border-0 ${className}`}
      title={title}
    />
  );
}

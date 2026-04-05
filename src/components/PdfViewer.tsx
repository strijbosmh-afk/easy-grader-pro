import { Loader2, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerProps {
  /** Pre-downloaded blob URL from supabase.storage.download() */
  blobUrl: string | null | undefined;
  loading?: boolean;
  title?: string;
  className?: string;
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PdfViewer({ blobUrl, loading = false, title = "Document", className = "" }: PdfViewerProps) {
  if (loading || !blobUrl) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // iOS Safari cannot render PDFs in iframes.
  // Open the blob URL in a new tab — Safari shows it natively.
  if (isIOS()) {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 p-6 ${className}`}>
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">
          Tik om de PDF te openen
        </p>
        <Button asChild size="lg">
          <a href={blobUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open PDF
          </a>
        </Button>
      </div>
    );
  }

  // Desktop: render inline in iframe
  return (
    <iframe
      src={`${blobUrl}#toolbar=1&navpanes=0`}
      className={`border-0 ${className}`}
      title={title}
    />
  );
}

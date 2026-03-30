import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabase-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Loader2, Search, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PlagiarismResult {
  student_a_id: string;
  student_b_id: string;
  student_a_name: string;
  student_b_name: string;
  similarity_score: number;
  flagged: boolean;
}

interface PlagiarismData {
  results: PlagiarismResult[];
  matrix: number[][];
  studentNames: string[];
  studentIds: string[];
  flaggedCount: number;
  message?: string;
}

interface PlagiarismTabProps {
  projectId: string;
  threshold: number;
  onThresholdChange: (val: number) => void;
}

function getHeatColor(value: number): string {
  if (value >= 80) return "bg-red-500 text-white";
  if (value >= 60) return "bg-orange-400 text-white";
  if (value >= 40) return "bg-amber-300 text-foreground";
  if (value >= 20) return "bg-emerald-200 text-foreground";
  return "bg-emerald-50 text-muted-foreground dark:bg-emerald-950 dark:text-muted-foreground";
}

export function PlagiarismTab({ projectId, threshold, onThresholdChange }: PlagiarismTabProps) {
  const [method, setMethod] = useState<"tfidf" | "ai">("tfidf");
  const queryClient = useQueryClient();

  const { data: plagiarismData, isLoading: loadingExisting } = useQuery({
    queryKey: ["plagiarism", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plagiarism_results")
        .select("*")
        .eq("project_id", projectId)
        .order("similarity_score", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const runCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeEdgeFunction("check-plagiarism", {
        body: { projectId, method, threshold },
      });
      if (error) throw error;
      return data as PlagiarismData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plagiarism", projectId] });
      if (data.message) {
        toast.info(data.message);
      } else if (data.flaggedCount > 0) {
        toast.warning(`${data.flaggedCount} verdacht${data.flaggedCount !== 1 ? "e" : ""} paar gevonden!`);
      } else {
        toast.success("Geen verdachte overeenkomsten gevonden");
      }
    },
    onError: (err: any) => {
      toast.error("Plagiaatcheck mislukt: " + (err?.message || "onbekende fout"));
    },
  });

  const lastRunData = runCheck.data;
  const hasMatrix = !!lastRunData?.matrix;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Plagiaatsignaal
          {plagiarismData && plagiarismData.filter(r => r.flagged).length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {plagiarismData.filter(r => r.flagged).length} verdacht
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Methode</label>
            <Select value={method} onValueChange={(v) => setMethod(v as "tfidf" | "ai")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tfidf">TF-IDF (snel, geen credits)</SelectItem>
                <SelectItem value="ai">AI Embeddings (nauwkeuriger)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">
              Drempelwaarde: {threshold}%
            </label>
            <Slider
              value={[threshold]}
              onValueChange={([v]) => onThresholdChange(v)}
              min={30}
              max={95}
              step={5}
              className="w-full"
            />
          </div>

          <Button
            onClick={() => runCheck.mutate()}
            disabled={runCheck.isPending}
          >
            {runCheck.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Controleren...
              </>
            ) : plagiarismData && plagiarismData.length > 0 ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Opnieuw controleren
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Plagiaatcheck uitvoeren
              </>
            )}
          </Button>
        </div>

        {method === "ai" && (
          <p className="text-xs text-muted-foreground">
            ⓘ De AI-methode gebruikt Lovable AI credits. TF-IDF is gratis en detecteert letterlijk kopieergedrag goed.
          </p>
        )}

        {/* Similarity Matrix */}
        {hasMatrix && lastRunData.matrix.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Overeenkomstmatrix</h4>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-1.5 text-left font-medium text-muted-foreground min-w-[80px]"></th>
                    {lastRunData.studentNames.map((name, i) => (
                      <th
                        key={i}
                        className="p-1.5 font-medium text-muted-foreground min-w-[40px] max-w-[60px] truncate"
                        title={name}
                      >
                        {name.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lastRunData.matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="p-1.5 font-medium text-muted-foreground truncate max-w-[100px]" title={lastRunData.studentNames[i]}>
                        {lastRunData.studentNames[i]}
                      </td>
                      {row.map((val, j) => (
                        <TooltipProvider key={j}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <td
                                className={`p-1.5 text-center font-mono text-[10px] min-w-[40px] border border-border/30 ${
                                  i === j
                                    ? "bg-muted text-muted-foreground"
                                    : getHeatColor(val)
                                }`}
                              >
                                {i === j ? "—" : `${val}%`}
                              </td>
                            </TooltipTrigger>
                            {i !== j && (
                              <TooltipContent>
                                <span className="text-xs">
                                  {lastRunData.studentNames[i]} ↔ {lastRunData.studentNames[j]}: {val}% gelijkenis
                                </span>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Flagged pairs */}
        {(hasMatrix ? lastRunData.results : plagiarismData)?.filter(
          (r: any) => r.flagged || r.similarity_score >= threshold
        ).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Verdachte paren (≥{threshold}%)
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student A</TableHead>
                  <TableHead>Student B</TableHead>
                  <TableHead className="text-right">Gelijkenis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(hasMatrix ? lastRunData.results : plagiarismData)
                  ?.filter((r: any) =>
                    hasMatrix
                      ? r.similarity_score >= threshold
                      : r.similarity_score >= threshold
                  )
                  .sort((a: any, b: any) => b.similarity_score - a.similarity_score)
                  .map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {r.student_a_name || r.student_a_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.student_b_name || r.student_b_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={r.similarity_score >= 80 ? "destructive" : "outline"}
                          className={r.similarity_score >= 80 ? "" : "text-amber-600 border-amber-300"}
                        >
                          {r.similarity_score}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* No results state */}
        {!runCheck.isPending &&
          !hasMatrix &&
          (!plagiarismData || plagiarismData.length === 0) && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Nog geen plagiaatcheck uitgevoerd.</p>
              <p className="text-xs mt-1">
                Klik op "Plagiaatcheck uitvoeren" om studentwerk te vergelijken.
              </p>
            </div>
          )}

        {/* All clear state */}
        {!runCheck.isPending &&
          hasMatrix &&
          lastRunData.results.filter((r: any) => r.similarity_score >= threshold).length === 0 && (
            <div className="text-center py-4 text-sm">
              <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Geen verdachte overeenkomsten gevonden boven {threshold}%
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

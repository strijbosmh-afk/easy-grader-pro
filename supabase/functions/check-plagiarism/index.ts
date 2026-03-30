import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-by, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── TF-IDF implementation ──────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function computeTfIdf(docs: string[][]): number[][] {
  const df: Record<string, number> = {};
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const w of unique) df[w] = (df[w] || 0) + 1;
  }
  const N = docs.length;
  const idf: Record<string, number> = {};
  for (const [w, count] of Object.entries(df)) {
    idf[w] = Math.log(N / count);
  }

  // Build vocabulary
  const vocab = Object.keys(idf).sort();
  const vocabIndex: Record<string, number> = {};
  vocab.forEach((w, i) => (vocabIndex[w] = i));

  // Build TF-IDF vectors
  return docs.map((doc) => {
    const tf: Record<string, number> = {};
    for (const w of doc) tf[w] = (tf[w] || 0) + 1;
    const maxTf = Math.max(...Object.values(tf), 1);
    const vec = new Array(vocab.length).fill(0);
    for (const [w, count] of Object.entries(tf)) {
      const idx = vocabIndex[w];
      if (idx !== undefined) vec[idx] = (count / maxTf) * (idf[w] || 0);
    }
    return vec;
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── AI Embeddings via Lovable AI ───────────────────────────────────────

async function getEmbeddingsViaChat(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  // Use the AI to generate a numerical fingerprint for each text
  // We ask the model to return a compact numerical representation
  const batchSize = 5;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const prompt = `Analyseer de volgende ${batch.length} teksten en geef voor elke tekst een numerieke vingerafdruk van exact 50 getallen (floats tussen -1 en 1), gescheiden door komma's. Elke vingerafdruk op een nieuwe regel. Focus op: inhoud, structuur, argumentatie, woordkeuze en zinsbouw. Teksten die op elkaar lijken moeten vergelijkbare vingerafdrukken krijgen.

${batch.map((t, idx) => `[TEKST ${idx + 1}]: ${t.slice(0, 2000)}`).join("\n\n")}

Geef ALLEEN de vingerafdrukken, één per regel, elk exact 50 komma-gescheiden getallen:`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "Je bent een tekst-analyse systeem. Geef ALLEEN numerieke vingerafdrukken, geen uitleg.",
            },
            { role: "user", content: prompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI embedding error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the numerical fingerprints
    const lines = content
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => /^[-\d.,\s]+$/.test(l) && l.includes(","));

    for (const line of lines) {
      const nums = line
        .split(",")
        .map((n: string) => parseFloat(n.trim()))
        .filter((n: number) => !isNaN(n));
      if (nums.length >= 10) {
        // Pad or truncate to 50
        while (nums.length < 50) nums.push(0);
        allEmbeddings.push(nums.slice(0, 50));
      }
    }
  }

  // Fallback: if AI didn't return enough embeddings, pad with zero vectors
  while (allEmbeddings.length < texts.length) {
    allEmbeddings.push(new Array(50).fill(0));
  }

  return allEmbeddings.slice(0, texts.length);
}

// ── Main handler ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, method = "tfidf", threshold = 70 } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId is vereist" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch students with their text content
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, naam, verslag, ai_feedback")
      .eq("project_id", projectId)
      .not("verslag", "is", null);

    if (studentsError) throw studentsError;

    if (!students || students.length < 2) {
      return new Response(
        JSON.stringify({
          results: [],
          matrix: [],
          message: "Minimaal 2 studenten met tekst nodig voor vergelijking",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get text content for each student
    const texts = students.map(
      (s) => (s.verslag || "") + " " + (s.ai_feedback || "")
    );

    let similarityMatrix: number[][];

    if (method === "ai") {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
      const embeddings = await getEmbeddingsViaChat(texts, apiKey);
      similarityMatrix = embeddings.map((a) =>
        embeddings.map((b) => cosineSimilarity(a, b))
      );
    } else {
      // TF-IDF
      const tokenized = texts.map(tokenize);
      const tfidfVectors = computeTfIdf(tokenized);
      similarityMatrix = tfidfVectors.map((a) =>
        tfidfVectors.map((b) => cosineSimilarity(a, b))
      );
    }

    // Delete old results for this project+method
    await supabase
      .from("plagiarism_results")
      .delete()
      .eq("project_id", projectId)
      .eq("method", method);

    // Build results for all pairs
    const results: Array<{
      student_a_id: string;
      student_b_id: string;
      student_a_name: string;
      student_b_name: string;
      similarity_score: number;
      flagged: boolean;
    }> = [];
    const toInsert: Array<{
      project_id: string;
      student_a_id: string;
      student_b_id: string;
      similarity_score: number;
      method: string;
      flagged: boolean;
    }> = [];

    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const score = Math.round(similarityMatrix[i][j] * 100);
        const flagged = score >= threshold;
        results.push({
          student_a_id: students[i].id,
          student_b_id: students[j].id,
          student_a_name: students[i].naam,
          student_b_name: students[j].naam,
          similarity_score: score,
          flagged,
        });
        toInsert.push({
          project_id: projectId,
          student_a_id: students[i].id,
          student_b_id: students[j].id,
          similarity_score: score,
          method,
          flagged,
        });
      }
    }

    // Insert results
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("plagiarism_results")
        .insert(toInsert);
      if (insertError) console.error("Insert error:", insertError);
    }

    // Return matrix data for visualization
    return new Response(
      JSON.stringify({
        results: results.sort((a, b) => b.similarity_score - a.similarity_score),
        matrix: similarityMatrix.map((row) =>
          row.map((v) => Math.round(v * 100))
        ),
        studentNames: students.map((s) => s.naam),
        studentIds: students.map((s) => s.id),
        flaggedCount: results.filter((r) => r.flagged).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Plagiarism check error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Onbekende fout",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

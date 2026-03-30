import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-by, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, projectIds } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine which projects to analyze
    const targetIds: string[] = projectIds || (projectId ? [projectId] : []);
    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "projectId of projectIds is vereist" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project names
    const { data: projects } = await supabase
      .from("projects")
      .select("id, naam")
      .in("id", targetIds);

    // Fetch students with scores and feedback
    const { data: students, error: studError } = await supabase
      .from("students")
      .select("id, naam, project_id, ai_feedback, student_scores(ai_suggested_score, final_score, ai_motivatie, ai_detail_feedback, ai_confidence, criterium_id)")
      .in("project_id", targetIds)
      .in("status", ["reviewed", "graded"]);

    if (studError) throw studError;
    if (!students || students.length === 0) {
      return new Response(
        JSON.stringify({ insights: null, message: "Geen beoordeelde studenten gevonden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch criteria
    const { data: criteria } = await supabase
      .from("grading_criteria")
      .select("id, criterium_naam, max_score, is_eindscore, project_id")
      .in("project_id", targetIds)
      .order("volgorde", { ascending: true });

    // Build a compact summary for the AI
    const criteriaMap = new Map((criteria || []).map(c => [c.id, c]));
    const projectMap = new Map((projects || []).map(p => [p.id, p.naam]));

    // Per-criterion aggregation
    const criterionAgg: Record<string, {
      name: string;
      scores: number[];
      maxScore: number;
      feedbackSnippets: string[];
    }> = {};

    for (const student of students) {
      for (const sc of (student.student_scores || [])) {
        const crit = criteriaMap.get(sc.criterium_id);
        if (!crit || crit.is_eindscore) continue;

        if (!criterionAgg[sc.criterium_id]) {
          criterionAgg[sc.criterium_id] = {
            name: crit.criterium_naam,
            scores: [],
            maxScore: Number(crit.max_score),
            feedbackSnippets: [],
          };
        }

        const score = Number(sc.final_score ?? sc.ai_suggested_score ?? 0);
        criterionAgg[sc.criterium_id].scores.push(score);

        // Collect feedback snippets (truncated)
        const fb = (sc.ai_motivatie || "") + " " + (sc.ai_detail_feedback || "");
        if (fb.trim().length > 10) {
          criterionAgg[sc.criterium_id].feedbackSnippets.push(
            `[${student.naam}]: ${fb.trim().slice(0, 300)}`
          );
        }
      }
    }

    // Build prompt with aggregated data
    const totalStudents = students.length;
    const projectNamesStr = [...new Set(targetIds.map(id => projectMap.get(id) || id))].join(", ");

    let dataBlock = `Projecten: ${projectNamesStr}\nAantal studenten: ${totalStudents}\n\n`;

    for (const [, agg] of Object.entries(criterionAgg)) {
      const avg = agg.scores.length > 0
        ? (agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length).toFixed(1)
        : "n/a";
      const lowCount = agg.scores.filter(s => s / agg.maxScore < 0.5).length;
      const highCount = agg.scores.filter(s => s / agg.maxScore >= 0.8).length;

      dataBlock += `## Criterium: ${agg.name} (max ${agg.maxScore})\n`;
      dataBlock += `Gem: ${avg}, Laag (<50%): ${lowCount}/${agg.scores.length}, Hoog (≥80%): ${highCount}/${agg.scores.length}\n`;
      dataBlock += `Feedbackfragmenten:\n`;
      // Send max 8 snippets per criterion to stay within context
      for (const snippet of agg.feedbackSnippets.slice(0, 8)) {
        dataBlock += `- ${snippet}\n`;
      }
      dataBlock += "\n";
    }

    // Also include general AI feedback summaries
    const generalFeedback = students
      .filter(s => s.ai_feedback)
      .map(s => `[${s.naam}]: ${(s.ai_feedback || "").slice(0, 200)}`)
      .slice(0, 15);

    if (generalFeedback.length > 0) {
      dataBlock += `## Algemene feedback\n`;
      for (const fb of generalFeedback) {
        dataBlock += `- ${fb}\n`;
      }
    }

    const systemPrompt = `Je bent een onderwijsanalist die beoordelingsdata van een docent analyseert. Extraheer pedagogische inzichten uit de AI-feedback en scores van alle studenten.

Geef je antwoord als JSON met exact deze structuur (geen markdown codeblocks):
{
  "summary": "Een korte samenvatting van 2-3 zinnen over de algehele prestaties van de klas",
  "themes": [
    {
      "title": "Kort thema (max 8 woorden)",
      "description": "Uitgebreide beschrijving van het patroon (2-3 zinnen)",
      "type": "strength" | "weakness" | "mixed",
      "studentCount": <aantal studenten>,
      "totalStudents": <totaal>,
      "criterion": "naam van het relevante criterium (of null)",
      "quotes": ["Relevante quote uit feedback student A", "Quote student B"]
    }
  ],
  "recommendations": [
    "Concrete aanbeveling voor de docent gebaseerd op de patronen"
  ],
  "criterionInsights": [
    {
      "name": "Criterium naam",
      "avgPct": <gemiddeld percentage 0-100>,
      "insight": "Kort inzicht over dit criterium"
    }
  ]
}

Regels:
- Geef 3-6 thema's, gesorteerd op relevantie
- Gebruik concrete aantallen ("7 van 12 studenten...")
- Quotes moeten afkomstig zijn uit de feedbackfragmenten
- Schrijf in het Nederlands
- type "strength" = goed, "weakness" = verbeterpunt, "mixed" = gemengd
- Geef 2-4 concrete aanbevelingen voor de docent`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dataBlock },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit bereikt. Probeer het later opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits op. Voeg credits toe via Instellingen." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error("AI analyse mislukt");
    }

    const aiResult = await response.json();
    let content = aiResult.choices?.[0]?.message?.content || "";

    // Strip markdown code blocks if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let insights;
    try {
      insights = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "AI-respons kon niet worden verwerkt", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        insights,
        totalStudents,
        projectNames: [...new Set(targetIds.map(id => projectMap.get(id) || id))],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Class insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

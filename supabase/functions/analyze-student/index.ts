import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { studentId, projectId, niveauOverride } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch project and student data
    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();

    if (!project || !student) throw new Error("Project of student niet gevonden");
    if (!project.opdracht_pdf_url || !project.graderingstabel_pdf_url) {
      throw new Error("Upload eerst de opdracht en graderingstabel PDFs");
    }
    if (!student.pdf_url) throw new Error("Student heeft geen PDF");

    // Fetch existing criteria or create from AI
    let { data: existingCriteria } = await supabase
      .from("grading_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("volgorde", { ascending: true });

    const niveau = niveauOverride || (project as any).beoordelingsniveau || "streng";
    
    const niveauInstructies: Record<string, string> = {
      streng: `Wees zeer kritisch: geef geen hoge scores tenzij het werk echt uitblinkt. Een gemiddelde student scoort rond de 60-65% van het maximum. Benoem concreet wat er mist of beter kan. Wees eerlijk, streng en constructief.`,
      neutraal: `Beoordeel evenwichtig: benoem zowel sterke punten als verbeterpunten. Een gemiddelde student scoort rond de 65-75% van het maximum. Wees eerlijk en constructief.`,
      mild: `Beoordeel stimulerend en positief: benadruk wat goed gaat en formuleer verbeterpunten als groeikansen. Een gemiddelde student scoort rond de 70-80% van het maximum. Motiveer de student om verder te groeien.`,
    };

    const systemPrompt = `Je bent een ervaren docent aan de lerarenopleiding kleuteronderwijs (bachelor kleuteronderwijs). Je beoordeelt het werk van studenten rechtvaardig, vanuit hoge verwachtingen voor toekomstige kleuterjuffen.

Let specifiek op:
- Pedagogisch-didactische onderbouwing: Is het werk theoretisch goed onderbouwd? Worden relevante ontwikkelingspsychologische theorieën correct toegepast?
- Praktijkgerichtheid: Kan de student theorie vertalen naar de kleuterpraktijk? Zijn de voorbeelden en uitwerkingen realistisch en toepasbaar?
- Taalgebruik en professionaliteit: Is het taalgebruik professioneel, helder en foutloos? Past het bij het niveau van een HBO-opleiding?
- Reflectief vermogen: Toont de student zelfreflectie en kritisch denkvermogen?
- Creativiteit en eigenheid: Toont het werk originaliteit of is het oppervlakkig en generiek?

${niveauInstructies[niveau] || niveauInstructies["streng"]}

Je MOET altijd antwoorden in valid JSON met deze structuur:
{
  "criteria": [
    {
      "naam": "Criterium naam",
      "max_score": 10,
      "score": 7.5,
      "motivatie": "Korte onderbouwing waarom deze score"
    }
  ],
  "algemene_feedback": "Korte algemene feedback over het werk"
}

Geef concrete verbeterpunten.`;

    let userPrompt: string;
    if (existingCriteria && existingCriteria.length > 0) {
      const criteriaList = existingCriteria.map(c => `- ${c.criterium_naam} (max: ${c.max_score})`).join("\n");
      userPrompt = `Beoordeel het werk van student "${student.naam}" op basis van de volgende criteria:

${criteriaList}

Opdracht PDF: ${project.opdracht_pdf_url}
Graderingstabel PDF: ${project.graderingstabel_pdf_url}
Student PDF: ${student.pdf_url}

Analyseer de inhoud van de PDFs en geef scores per criterium.`;
    } else {
      userPrompt = `Analyseer de graderingstabel en het werk van student "${student.naam}".

1. Eerst: Haal de beoordelingscriteria uit de graderingstabel PDF
2. Dan: Beoordeel het studentwerk per criterium

Opdracht PDF: ${project.opdracht_pdf_url}
Graderingstabel PDF: ${project.graderingstabel_pdf_url}
Student PDF: ${student.pdf_url}

Geef je antwoord in het gevraagde JSON formaat met criteria, scores en motivatie.`;
    }

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_grading",
              description: "Submit the grading results for a student",
              parameters: {
                type: "object",
                properties: {
                  criteria: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        naam: { type: "string", description: "Name of the criterion" },
                        max_score: { type: "number", description: "Maximum score for this criterion" },
                        score: { type: "number", description: "Suggested score" },
                        motivatie: { type: "string", description: "Justification for the score" },
                      },
                      required: ["naam", "max_score", "score", "motivatie"],
                      additionalProperties: false,
                    },
                  },
                  algemene_feedback: { type: "string", description: "General feedback about the work" },
                },
                required: ["criteria", "algemene_feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_grading" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
        return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast, probeer later opnieuw" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
        return new Response(JSON.stringify({ error: "AI credits op, voeg credits toe" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analyse mislukt");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let result;
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Kon AI antwoord niet verwerken");
      }
    }

    // If no criteria exist, create them
    if (!existingCriteria || existingCriteria.length === 0) {
      const criteriaToInsert = result.criteria.map((c: any, i: number) => ({
        project_id: projectId,
        criterium_naam: c.naam,
        max_score: c.max_score,
        volgorde: i,
      }));

      const { data: inserted, error: criteriaError } = await supabase
        .from("grading_criteria")
        .insert(criteriaToInsert)
        .select();

      if (criteriaError) throw criteriaError;
      existingCriteria = inserted;
    }

    // Upsert scores
    for (const aiCriterium of result.criteria) {
      const matchedCriterium = existingCriteria!.find(
        (c: any) => c.criterium_naam.toLowerCase() === aiCriterium.naam.toLowerCase()
      );
      if (matchedCriterium) {
        await supabase.from("student_scores").upsert(
          {
            student_id: studentId,
            criterium_id: matchedCriterium.id,
            ai_suggested_score: aiCriterium.score,
            ai_motivatie: aiCriterium.motivatie,
          },
          { onConflict: "student_id,criterium_id" }
        );
      }
    }

    // Update student status and feedback
    await supabase.from("students").update({
      status: "reviewed",
      ai_feedback: result.algemene_feedback,
    }).eq("id", studentId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    // Reset status on error
    try {
      const { studentId } = await req.clone().json();
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
    } catch {}

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { studentId, projectId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();
    const { data: criteria } = await supabase
      .from("grading_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("volgorde", { ascending: true });
    const { data: scores } = await supabase
      .from("student_scores")
      .select("*, grading_criteria(*)")
      .eq("student_id", studentId);

    if (!project || !student) throw new Error("Project of student niet gevonden");
    if (!criteria || criteria.length === 0) throw new Error("Geen beoordelingscriteria gevonden");

    // Build score summary
    const scoreSummary = criteria.map((c: any) => {
      const sc = scores?.find((s: any) => s.criterium_id === c.id);
      return {
        criterium: c.criterium_naam,
        max: c.max_score,
        score: sc?.final_score ?? sc?.ai_suggested_score ?? null,
        ai_motivatie: sc?.ai_motivatie || "",
        opmerkingen: sc?.opmerkingen || "",
      };
    });

    const totalScore = scoreSummary.reduce((sum: number, s: any) => sum + (s.score || 0), 0);
    const totalMax = scoreSummary.reduce((sum: number, s: any) => sum + s.max, 0);

    const systemPrompt = `Je bent een ervaren, empathische docent aan de lerarenopleiding kleuteronderwijs (bachelor kleuteronderwijs) in België. Je schrijft een eindverslag voor een student. 

BELANGRIJK: Gebruik NOOIT het woord "AI" in het verslag. Verwijs niet naar kunstmatige intelligentie, AI-analyse of AI-feedback. Schrijf alsof jij als docent alles zelf hebt beoordeeld.

Je toon is:
- Empathisch maar rechtvaardig: je erkent inspanningen maar benoemt ook duidelijk tekortkomingen
- Strikt maar opbouwend: je houdt vast aan hoge standaarden maar formuleert feedback als groeikansen
- Professioneel en persoonlijk: je spreekt de student direct aan

Het verslag MOET de volgende secties bevatten:
1. **Inleiding** — Korte context over de opdracht en een algemene indruk
2. **Detailbeoordeling per criterium** — Per criterium een korte toelichting op de score
3. **Conclusie** — Samenvattend oordeel met totaalscore en een aanmoediging of aandachtspunt
4. **Sterktes** — Opsomming van concrete sterke punten
5. **Verbeterpunten** — Opsomming van concrete verbeterpunten met specifieke suggesties

Schrijf in het Nederlands (Belgisch). Gebruik geen opsommingstekens in de inleiding en conclusie, maar wel in sterktes/verbeterpunten. Houd het verslag helder en bondig maar volledig (400-600 woorden). De secties Sterktes en Verbeterpunten staan onderaan het verslag.`;

    const userPrompt = `Schrijf een eindverslag voor student "${student.naam}" voor het project "${project.naam}".

Totaalscore: ${totalScore}/${totalMax} (${totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0}%)

Scores per criterium:
${scoreSummary.map((s: any) => `- ${s.criterium}: ${s.score ?? "n.v.t."}/${s.max}${s.ai_motivatie ? ` — ${s.ai_motivatie}` : ""}${s.opmerkingen ? ` (Opmerking docent: ${s.opmerkingen})` : ""}`).join("\n")}

${student.ai_feedback ? `Analyse van het werk: ${student.ai_feedback}` : ""}
${student.docent_feedback ? `Docent Feedback: ${student.docent_feedback}` : ""}

Schrijf nu het volledige verslag.`;

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
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast, probeer later opnieuw" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op, voeg credits toe" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Verslag genereren mislukt");
    }

    const aiData = await aiResponse.json();
    const verslag = aiData.choices?.[0]?.message?.content || "";

    if (!verslag) throw new Error("Geen verslag ontvangen van AI");

    // Save verslag
    await supabase.from("students").update({ verslag }).eq("id", studentId);

    return new Response(JSON.stringify({ success: true, verslag }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://easy-grader-pro.lovable.app",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-requested-by",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {

    // Verify custom header
    const requestedBy = req.headers.get("x-requested-by");
    if (requestedBy !== "GradeAssist") {
      return new Response(JSON.stringify({ error: "Geen toegang" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const { studentId, projectId } = await req.json();

    // Extract user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Ongeldige sessie" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase.from("projects").select("id, user_id").eq("id", projectId).single();
    if (!project) {
      return new Response(JSON.stringify({ error: "Project niet gevonden" }), {
        status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (project.user_id !== user.id) {
      const { data: reviewer } = await supabase.from("project_reviewers")
        .select("id").eq("project_id", projectId).eq("reviewer_id", user.id).eq("status", "accepted").single();
      const { data: share } = await supabase.from("project_shares")
        .select("id").eq("project_id", projectId).eq("shared_with_user_id", user.id).single();
      if (!reviewer && !share) {
        return new Response(JSON.stringify({ error: "Geen toegang tot dit project" }), {
          status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }
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

    if (!student) throw new Error("Student niet gevonden");
    if (!criteria || criteria.length === 0) throw new Error("Geen beoordelingscriteria gevonden");

    const aiProvider = project.ai_provider || "lovable";

    // Separate sub-criteria from the holistic eindscore
    const subCriteria = criteria.filter((c: any) => !c.is_eindscore);
    const eindscoreCriterium = criteria.find((c: any) => c.is_eindscore);

    // Build score summary for sub-criteria only
    const scoreSummary = subCriteria.map((c: any) => {
      const sc = scores?.find((s: any) => s.criterium_id === c.id);
      return {
        criterium: c.criterium_naam,
        max: c.max_score,
        score: sc?.final_score ?? sc?.ai_suggested_score ?? null,
        motivatie: sc?.opmerkingen || sc?.ai_motivatie || "",
        detail_feedback: (sc as any)?.ai_detail_feedback || "",
      };
    });

    // Sub-criteria totals (not including eindscore)
    const subTotal = scoreSummary.reduce((sum: number, s: any) => sum + (s.score || 0), 0);
    const subMax = scoreSummary.reduce((sum: number, s: any) => sum + s.max, 0);

    // Eindscore (holistic final grade)
    let eindscoreText = "";
    if (eindscoreCriterium) {
      const sc = scores?.find((s: any) => s.criterium_id === eindscoreCriterium.id);
      const eindVal = sc?.final_score ?? sc?.ai_suggested_score ?? null;
      eindscoreText = eindVal !== null
        ? `\nEINDSCORE: ${eindVal}/${eindscoreCriterium.max_score} (${eindscoreCriterium.criterium_naam})`
        : "";
    }

    const systemPrompt = `Je bent een ervaren, empathische docent aan de lerarenopleiding kleuteronderwijs (bachelor kleuteronderwijs) in België. Je schrijft een eindverslag voor een student.

BELANGRIJK: Gebruik NOOIT het woord "AI" in het verslag. Verwijs niet naar kunstmatige intelligentie, AI-analyse of AI-feedback. Schrijf alsof jij als docent alles zelf hebt beoordeeld.

Je toon is:
- Empathisch maar rechtvaardig: je erkent inspanningen maar benoemt ook duidelijk tekortkomingen
- Strikt maar opbouwend: je houdt vast aan hoge standaarden maar formuleert feedback als groeikansen
- Professioneel en persoonlijk: je spreekt de student direct aan

Het verslag MOET de volgende secties bevatten:
1. **Inleiding** — Korte context over de opdracht en een algemene indruk
2. **Detailbeoordeling per criterium** — Per criterium een korte toelichting op de score. Verwerk hierbij de concrete voorbeelden uit de detailfeedback (pagina- en regelnummers van fouten, ontbrekende onderdelen, etc.) — maar schrijf dit als een docent die het zelf heeft opgemerkt, niet als een opsomming van AI-output.
3. **Conclusie** — Samenvattend oordeel met de eindscore (als aanwezig) en een aanmoediging of aandachtspunt
4. **Sterktes** — Opsomming van concrete sterke punten
5. **Verbeterpunten** — Opsomming van concrete verbeterpunten met specifieke suggesties

Schrijf in het Nederlands (Belgisch). Gebruik geen opsommingstekens in de inleiding en conclusie, maar wel in sterktes/verbeterpunten. Houd het verslag helder en bondig maar volledig (400-600 woorden). De secties Sterktes en Verbeterpunten staan onderaan het verslag.`;

    const userPrompt = `Schrijf een eindverslag voor student "${student.naam}" voor het project "${project.naam}".

Deelscores: ${subTotal}/${subMax} (${subMax > 0 ? Math.round((subTotal / subMax) * 100) : 0}%)${eindscoreText}

Scores en feedback per criterium:
${scoreSummary.map((s: any) => {
  let line = `- ${s.criterium}: ${s.score ?? "n.v.t."}/${s.max}`;
  if (s.motivatie) line += `\n  Motivatie: ${s.motivatie}`;
  if (s.detail_feedback) line += `\n  Detailfeedback: ${s.detail_feedback}`;
  return line;
}).join("\n")}

${student.ai_feedback ? `Algemene analyse: ${student.ai_feedback}` : ""}
${student.docent_feedback ? `Docent aantekeningen: ${student.docent_feedback}` : ""}

Schrijf nu het volledige verslag. Verwerk de detailfeedback (concrete fouten met pagina/regelnummers) naturel in de detailbeoordeling — schrijf dit als je eigen observaties als docent.`;

    let verslag = "";

    if (aiProvider === "anthropic") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY niet geconfigureerd");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic error:", response.status, errText);
        if (response.status === 429) throw { status: 429, message: "Anthropic API is tijdelijk overbelast" };
        throw new Error(`Anthropic verslag mislukt: ${response.status}`);
      }

      const data = await response.json();
      verslag = data.content?.find((c: any) => c.type === "text")?.text || "";
    } else {
      // Lovable / Gemini
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast, probeer later opnieuw" }), {
            status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits op, voeg credits toe" }), {
            status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        throw new Error("Verslag genereren mislukt");
      }

      const data = await response.json();
      verslag = data.choices?.[0]?.message?.content || "";
    }

    if (!verslag) throw new Error("Geen verslag ontvangen van AI");

    // Save verslag
    await supabase.from("students").update({ verslag }).eq("id", studentId);

    return new Response(JSON.stringify({ success: true, verslag }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : (error?.message || "Onbekende fout") }),
      { status: error?.status || 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

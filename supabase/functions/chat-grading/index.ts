import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://easy-grader-pro.lovable.app",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Lovable preview domains
  if (origin.endsWith(".lovableproject.com")) return true;
  if (origin.endsWith(".lovable.app") && origin.includes("-preview--")) return true;

  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-requested-by",
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
    const { messages, projectId } = await req.json();

    // Extract user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch project context
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

    // Rate limiting: max 60 AI calls per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: usageCount } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('function_name', 'chat-grading')
      .gte('created_at', oneHourAgo);

    if (usageCount && usageCount >= 60) {
      return new Response(
        JSON.stringify({ error: 'Rate limit bereikt. Maximaal 60 chat-berichten per uur. Probeer het later opnieuw.' }),
        { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    await supabase.from('api_usage').insert({ user_id: user.id, function_name: 'chat-grading' });

    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const { data: criteria } = await supabase
      .from("grading_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("volgorde", { ascending: true });
    const { data: students } = await supabase
      .from("students")
      .select("*, student_scores(*)")
      .eq("project_id", projectId);

    const aiProvider = project?.ai_provider || "lovable";

    // Build context about the project
    const criteriaInfo = criteria?.map((c: any) =>
      `- ${c.criterium_naam} (max: ${c.max_score}${c.is_eindscore ? ", eindscore" : ""})`
    ).join("\n") || "Geen criteria gedefinieerd";

    const studentSummary = students?.map((s: any) => {
      const scores = s.student_scores?.map((sc: any) => `${sc.ai_suggested_score ?? "?"}`).join(", ");
      return `- ${s.naam} (status: ${s.status}${scores ? `, scores: ${scores}` : ""})`;
    }).join("\n") || "Geen studenten";

    const systemPrompt = `Je bent een AI-assistent die een docent helpt bij het beoordelen van studentwerk. Je spreekt Nederlands.

PROJECT CONTEXT:
- Projectnaam: ${project?.naam || "Onbekend"}
- Beoordelingsniveau: ${project?.beoordelingsniveau || "streng"}
- AI provider: ${aiProvider}
- Huidige aangepaste instructies: ${project?.custom_instructions || "Geen"}

BEOORDELINGSCRITERIA:
${criteriaInfo}

STUDENTEN OVERZICHT:
${studentSummary}

JE ROL:
- Help de docent om specifieke beoordelingsinstructies op te stellen.
- Beantwoord vragen over het beoordelingsproces.
- De docent kan instructies geven zoals: "Let extra op spelling", "Wees strenger bij bronvermelding", "Geef meer punten voor creativiteit", etc.
- Wanneer de docent instructies geeft, sla ze LETTERLIJK en EXACT op via save_instructions. Vat NIET samen, bewaar de originele bewoordingen inclusief specifieke criteria-namen en scores.
- Als de docent vraagt om instructies te WISSEN, te RESETTEN, of te VERWIJDEREN, roep dan save_instructions aan met een lege string ("").
- Als er al bestaande instructies zijn, COMBINEER de nieuwe instructies met de bestaande (voeg toe, overschrijf niet tenzij expliciet gevraagd of tenzij de docent vraagt te wissen).
- Vraag aan het einde altijd: "Wil je dat ik een heranalyse start met deze nieuwe instructies?"
- Houd je antwoorden beknopt en praktisch.
- Schrijf GEEN markdown-opmaak. Gewone tekst.

BELANGRIJK: Wanneer de gebruiker instructies geeft voor de beoordeling, gebruik dan de save_instructions tool om deze op te slaan.`;

    const toolDef = {
      name: "save_instructions",
      description: "Sla de aangepaste beoordelingsinstructies op. Bewaar de EXACTE instructies van de docent, inclusief specifieke scoreverwachtingen, criteria-namen en scoreschalen. Vat NIET samen, bewaar letterlijk. Gebruik een lege string om alle instructies te wissen.",
      parameters: {
        type: "object",
        properties: {
          instructions: {
            type: "string",
            description: "De EXACTE en LETTERLIJKE beoordelingsinstructies van de docent. Gebruik een lege string ('') om alle instructies te wissen.",
          },
        },
        required: ["instructions"],
        additionalProperties: false,
      },
    };

    let response: Response;

    if (aiProvider === "anthropic") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY niet geconfigureerd");

      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
          tools: [{
            name: toolDef.name,
            description: toolDef.description,
            input_schema: toolDef.parameters,
          }],
        }),
      });
    } else {
      // Lovable / Gemini
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          tools: [{ type: "function", function: toolDef }],
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast, probeer het later opnieuw." }), {
          status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op. Voeg credits toe via Settings > Workspace > Usage." }), {
          status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI fout: ${response.status}`);
    }

    const data = await response.json();

    // Extract tool call and reply — handle both Anthropic and OpenAI-compatible formats
    let savedInstructions: string | null = null;
    let reply = "";

    if (aiProvider === "anthropic") {
      const toolUse = data.content?.find((c: any) => c.type === "tool_use" && c.name === "save_instructions");
      const textBlock = data.content?.find((c: any) => c.type === "text");
      reply = textBlock?.text || "";
      if (toolUse) {
        savedInstructions = toolUse.input?.instructions ?? null;
      }
    } else {
      const choice = data.choices?.[0]?.message;
      reply = choice?.content || "";
      if (choice?.tool_calls?.length > 0) {
        for (const toolCall of choice.tool_calls) {
          if (toolCall.function?.name === "save_instructions") {
            const args = JSON.parse(toolCall.function.arguments);
            savedInstructions = args.instructions;
          }
        }
      }
    }

    // Persist instructions if the AI called save_instructions
    if (savedInstructions !== null) {
      let merged: string | null;
      if (savedInstructions === "") {
        // Explicit clear request
        merged = null;
      } else {
        const existing = project?.custom_instructions || "";
        merged = existing ? `${existing}\n\n${savedInstructions}` : savedInstructions;
      }

      await supabase
        .from("projects")
        .update({ custom_instructions: merged })
        .eq("id", projectId);

      console.log("Saved custom instructions for project:", projectId);

      if (!reply) {
        reply = savedInstructions === ""
          ? "Alle instructies zijn gewist."
          : `Ik heb de volgende instructies opgeslagen:\n\n"${savedInstructions}"\n\nWil je dat ik een heranalyse start met deze nieuwe instructies?`;
      }
    }

    return new Response(JSON.stringify({
      reply,
      savedInstructions,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

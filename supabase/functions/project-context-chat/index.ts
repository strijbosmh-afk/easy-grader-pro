import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, projectName, aiProvider } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Je bent een vriendelijke AI-assistent die een docent helpt bij het opzetten van een nieuw beoordelingsproject. Je spreekt Nederlands.

HET PROJECT:
- Projectnaam: "${projectName || "Nieuw project"}"
- Gekozen AI model: ${aiProvider === "anthropic" ? "Claude Sonnet 4" : "Gemini 2.5 Flash"}

JE DOEL:
Stel de docent 3-5 korte, gerichte vragen om het beoordelingsproject goed te begrijpen. Dit helpt de AI later om betere beoordelingen te geven.

VRAGEN DIE JE MOET STELLEN (niet allemaal tegelijk, bouw het gesprek op):
1. Welk vak/module wordt beoordeeld en op welk niveau (bv. bachelor kleuteronderwijs)?
2. Wat voor soort materiaal beoordeel je (verslag, portfolio, presentatie, stageverslag, etc.)?
3. Waar let je het meest op bij de beoordeling? Zijn er specifieke aandachtspunten?
4. Hoe streng wil je dat de AI beoordeelt (streng, gemiddeld, mild)?
5. Zijn er specifieke fouten of patronen waar je extra op wilt letten?

REGELS:
- Begin met een korte, warme begroeting en stel direct je eerste 1-2 vragen.
- Stel verdiepingsvragen als antwoorden vaag zijn.
- Na voldoende informatie (minimaal 2-3 antwoorden), vat samen wat je hebt geleerd en gebruik de save_context tool om de context op te slaan.
- Houd je antwoorden beknopt (max 3-4 zinnen per bericht).
- Schrijf GEEN markdown-opmaak. Gewone tekst.
- Als de docent aangeeft klaar te zijn of genoeg info te hebben gegeven, sla dan direct op wat je hebt.`;

    const toolDef = {
      name: "save_context",
      description: "Sla de verzamelde projectcontext op als beoordelingsinstructies. Schrijf een gestructureerde samenvatting van alle informatie die de docent heeft gegeven.",
      parameters: {
        type: "object",
        properties: {
          context_summary: {
            type: "string",
            description: "Gestructureerde samenvatting van de projectcontext: vak, niveau, materiaaltype, aandachtspunten, strengheid, specifieke instructies.",
          },
        },
        required: ["context_summary"],
        additionalProperties: false,
      },
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools: [{ type: "function", function: toolDef }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op. Voeg credits toe via Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI fout: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    let reply = choice?.content || "";
    let contextSummary: string | null = null;

    if (choice?.tool_calls?.length > 0) {
      for (const toolCall of choice.tool_calls) {
        if (toolCall.function?.name === "save_context") {
          const args = JSON.parse(toolCall.function.arguments);
          contextSummary = args.context_summary;
        }
      }
    }

    return new Response(JSON.stringify({ reply, contextSummary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Project context chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

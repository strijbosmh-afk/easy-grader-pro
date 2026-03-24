import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { graderingstabelUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!graderingstabelUrl) throw new Error("Geen graderingstabel URL opgegeven");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Je bent een expert in het analyseren van beoordelingstabellen voor het hoger onderwijs. Analyseer de graderingstabel PDF en extraheer ALLE beoordelingscriteria met hun maximale scores.

Je MOET antwoorden in valid JSON met deze structuur:
{
  "criteria": [
    {
      "naam": "Naam van het criterium",
      "max_score": 10,
      "beschrijving": "Korte beschrijving van wat er beoordeeld wordt"
    }
  ],
  "samenvatting": "Korte samenvatting van de beoordelingstabel"
}

Wees nauwkeurig. Neem alle criteria over exact zoals ze in het document staan. Als er geen expliciete max_score staat, gebruik dan 10 als standaard.`,
          },
          {
            role: "user",
            content: `Analyseer deze graderingstabel PDF en extraheer alle beoordelingscriteria:\n\n${graderingstabelUrl}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_criteria",
              description: "Submit the extracted grading criteria",
              parameters: {
                type: "object",
                properties: {
                  criteria: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        naam: { type: "string" },
                        max_score: { type: "number" },
                        beschrijving: { type: "string" },
                      },
                      required: ["naam", "max_score"],
                      additionalProperties: false,
                    },
                  },
                  samenvatting: { type: "string" },
                },
                required: ["criteria", "samenvatting"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_criteria" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Kon graderingstabel niet analyseren");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Kon AI antwoord niet verwerken");
      }
    }

    return new Response(JSON.stringify(result), {
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPdfAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { graderingstabelUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!graderingstabelUrl) throw new Error("Geen graderingstabel URL opgegeven");

    console.log("Downloading grading table PDF...");
    const pdfBase64 = await fetchPdfAsBase64(graderingstabelUrl);
    console.log("PDF downloaded, size:", Math.round(pdfBase64.length / 1024), "KB base64");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Je bent een expert in het analyseren van beoordelingstabellen voor het hoger onderwijs in België. Analyseer de graderingstabel PDF en extraheer ALLE beoordelingscriteria.

HEEL BELANGRIJK:
- Zoek naar de DEELCRITERIA (de individuele beoordelingspunten) met hun max scores.
- Zoek ook naar het EINDCIJFER — dit is de uiteindelijke totaalscore (vaak "Cijfer", "Totaal", "Eindscore", "Score op /20", etc.).
- Het eindcijfer is NIET de som van de deelscores — het is een apart veld in de tabel.
- Neem de criteria namen EXACT over zoals in het document.
- Neem de max_scores EXACT over.
- Markeer welk criterium het eindcijfer is (is_eindscore: true).
- Als er geen apart eindcijfer staat, markeer geen enkel criterium als eindscore.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyseer deze graderingstabel PDF. Extraheer alle deelcriteria EN identificeer het eindcijfer (totaalscore):",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_criteria",
              description: "Submit the extracted grading criteria from the PDF",
              parameters: {
                type: "object",
                properties: {
                  criteria: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        naam: { type: "string", description: "Exact name of the criterion from the document" },
                        max_score: { type: "number", description: "Maximum score for this criterion" },
                        beschrijving: { type: "string", description: "Description of the criterion" },
                        is_eindscore: { type: "boolean", description: "True if this is the final/total grade (Cijfer, Totaal, Eindscore), false for sub-criteria" },
                      },
                      required: ["naam", "max_score", "is_eindscore"],
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

    console.log("Parsed criteria:", result.criteria?.length, "items");
    const eindscore = result.criteria?.find((c: any) => c.is_eindscore);
    if (eindscore) {
      console.log("Eindscore found:", eindscore.naam, "max:", eindscore.max_score);
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

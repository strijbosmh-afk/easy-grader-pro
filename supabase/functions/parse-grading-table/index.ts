import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const systemPrompt = `Je bent een expert in het analyseren van beoordelingstabellen voor het hoger onderwijs in België. Analyseer de graderingstabel PDF en extraheer ALLE beoordelingscriteria.

Per criterium moet je ook de SCORENIVEAUS extraheren. Dit zijn de discrete scores die in de tabel staan met hun beschrijvingen. Bijvoorbeeld als een criterium scores 0, 4, 7, 10 heeft met elk een beschrijving van wanneer die score geldt, extraheer al deze niveaus.

HEEL BELANGRIJK:
- Zoek naar de DEELCRITERIA (de individuele beoordelingspunten) met hun max scores.
- Zoek ook naar het EINDCIJFER — dit is de uiteindelijke totaalscore (vaak "Cijfer", "Totaal", "Eindscore", "Score op /20", etc.).
- Het eindcijfer is NIET de som van de deelscores — het is een apart veld in de tabel.
- Neem de criteria namen EXACT over zoals in het document.
- Neem de max_scores EXACT over.
- Markeer welk criterium het eindcijfer is (is_eindscore: true).
- Als er geen apart eindcijfer staat, markeer geen enkel criterium als eindscore.
- Bestudeer de graderingstabel ZEER ZORGVULDIG. Let op alle details, gekleurde tekst, voetnoten, instructies, en bijzondere scoreregels (bijv. aftrek/straf-systemen vs positieve punten).

SCORENIVEAUS (rubric_levels):
- Lees de graderingstabel ZEER zorgvuldig en extraheer per criterium ALLE mogelijke scores met hun beschrijvingen.
- Dit zijn de discrete waarden die de docent kan toekennen, met uitleg over wanneer elk niveau geldt.
- Als een criterium een aftrek/straf-systeem heeft (bijv. 0 = geen fouten, -1 per fout), noteer dan de niveaus zoals ze in de tabel staan.
- Als er geen expliciete scoreniveaus in de tabel staan voor een criterium, geef dan een leeg array [].
- De beschrijvingen moeten EXACT overeenkomen met wat in het document staat.`;

const toolDef = {
  name: "submit_criteria",
  description: "Submit the extracted grading criteria from the PDF, including score level descriptions",
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
            rubric_levels: {
              type: "array",
              description: "The discrete score levels defined in the grading table for this criterion. Extract ALL possible scores with their descriptions.",
              items: {
                type: "object",
                properties: {
                  score: { type: "number", description: "The score value for this level" },
                  description: { type: "string", description: "What this score level means / when to award it" },
                },
                required: ["score", "description"],
                additionalProperties: false,
              },
            },
          },
          required: ["naam", "max_score", "is_eindscore", "rubric_levels"],
          additionalProperties: false,
        },
      },
      samenvatting: { type: "string" },
    },
    required: ["criteria", "samenvatting"],
    additionalProperties: false,
  },
};

async function callLovableAI(pdfBase64: string) {
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
        {
          role: "user",
          content: [
            { type: "text", text: "Analyseer deze graderingstabel PDF. Extraheer alle deelcriteria EN identificeer het eindcijfer (totaalscore):" },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
          ],
        },
      ],
      tools: [{ type: "function", function: toolDef }],
      tool_choice: { type: "function", function: { name: "submit_criteria" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Lovable AI error:", response.status, errText);
    if (response.status === 429) throw new Error("AI is tijdelijk overbelast, probeer later opnieuw");
    if (response.status === 402) throw new Error("AI credits op");
    throw new Error("Kon graderingstabel niet analyseren");
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) return JSON.parse(toolCall.function.arguments);
  const content = aiData.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("Kon AI antwoord niet verwerken");
}

async function callAnthropicAI(pdfBase64: string) {
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
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Analyseer deze graderingstabel PDF. Extraheer alle deelcriteria EN identificeer het eindcijfer (totaalscore):" },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        ],
      }],
      tools: [{ name: toolDef.name, description: toolDef.description, input_schema: toolDef.parameters }],
      tool_choice: { type: "tool", name: "submit_criteria" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Anthropic error:", response.status, errText);
    if (response.status === 429) throw new Error("Anthropic API is tijdelijk overbelast");
    throw new Error(`Anthropic analyse mislukt: ${response.status}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find((c: any) => c.type === "tool_use" && c.name === "submit_criteria");
  if (toolUse) return toolUse.input;
  const textBlock = data.content?.find((c: any) => c.type === "text");
  if (textBlock) {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  }
  throw new Error("Kon Anthropic antwoord niet verwerken");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { graderingstabelUrl, aiProvider } = await req.json();

    // Extract user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!graderingstabelUrl) throw new Error("Geen graderingstabel URL opgegeven");

    console.log("Downloading grading table PDF...");
    const pdfBase64 = await fetchPdfAsBase64(graderingstabelUrl);
    console.log("PDF downloaded, size:", Math.round(pdfBase64.length / 1024), "KB base64");

    const provider = aiProvider || "lovable";
    console.log(`Using AI provider: ${provider}`);

    let result;
    if (provider === "anthropic") {
      result = await callAnthropicAI(pdfBase64);
    } else {
      result = await callLovableAI(pdfBase64);
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

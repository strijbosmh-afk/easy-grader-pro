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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractStoragePath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/pdfs\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  const match2 = url.match(/\/object\/(?:public|sign)\/pdfs\/(.+?)(?:\?|$)/);
  if (match2) return match2[1];
  return null;
}

function detectMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.includes(".doc") && !lower.includes(".docx")) return "application/msword";
  return "application/pdf";
}

async function fetchDocAsBase64(url: string, supabaseClient?: any): Promise<string> {
  if (supabaseClient) {
    const storagePath = extractStoragePath(url);
    if (storagePath) {
      const { data, error } = await supabaseClient.storage.from("pdfs").download(decodeURIComponent(storagePath));
      if (!error && data) {
        const buffer = await data.arrayBuffer();
        return arrayBufferToBase64(buffer);
      }
      console.warn(`Storage download failed for ${storagePath}, falling back to URL fetch:`, error?.message);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return arrayBufferToBase64(buffer);
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
  description: "Submit the extracted grading criteria from the PDF, including score level descriptions and a scoring system summary",
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
      scoring_system_summary: {
        type: "string",
        description: "Korte samenvatting van het scoringssysteem: Gebruikt de tabel positieve punten, aftrekpunten, of een combinatie? Wat is de maximale totaalscore? Zijn er speciale rekenregels of gewichten? Zijn er conditionele instructies (bijv. 'indien niet sterk, dan...')?"
      },
    },
    required: ["criteria", "samenvatting", "scoring_system_summary"],
    additionalProperties: false,
  },
};

async function callLovableAI(docBase64: string, mimeType: string, modelOverride?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelOverride || "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyseer deze graderingstabel. Extraheer alle deelcriteria EN identificeer het eindcijfer (totaalscore). Geef ook een samenvatting van het scoringssysteem:" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${docBase64}` } },
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

async function callAnthropicAI(docBase64: string, mimeType: string) {
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
          { type: "text", text: "Analyseer deze graderingstabel. Extraheer alle deelcriteria EN identificeer het eindcijfer (totaalscore). Geef ook een samenvatting van het scoringssysteem:" },
          { type: "document", source: { type: "base64", media_type: mimeType, data: docBase64 } },
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
    const { graderingstabelUrl, aiProvider } = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Ongeldige sessie" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!graderingstabelUrl) throw new Error("Geen graderingstabel URL opgegeven");

    console.log("Downloading grading table document...");
    const mimeType = detectMimeType(graderingstabelUrl);
    const docBase64 = await fetchDocAsBase64(graderingstabelUrl, supabase);
    console.log("Document downloaded, size:", Math.round(docBase64.length / 1024), "KB base64");

    const provider = aiProvider || "lovable";
    console.log(`Using AI provider: ${provider}`);

    let result;
    if (provider === "anthropic") {
      result = await callAnthropicAI(docBase64, mimeType);
    } else {
      const model = provider === "lovable-pro" ? "google/gemini-2.5-pro" : undefined;
      result = await callLovableAI(docBase64, mimeType, model);
    }

    console.log("Parsed criteria:", result.criteria?.length, "items");
    const eindscore = result.criteria?.find((c: any) => c.is_eindscore);
    if (eindscore) {
      console.log("Eindscore found:", eindscore.naam, "max:", eindscore.max_score);
    }
    if (result.scoring_system_summary) {
      console.log("Scoring system summary:", result.scoring_system_summary.substring(0, 100));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Onbekende fout" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

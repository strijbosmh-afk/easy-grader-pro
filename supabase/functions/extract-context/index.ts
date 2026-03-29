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
      console.warn(`Storage download failed, falling back to URL fetch:`, error?.message);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdfUrl } = await req.json();
    if (!pdfUrl) {
      return new Response(JSON.stringify({ error: "pdfUrl is vereist" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64Doc = await fetchDocAsBase64(pdfUrl, supabaseClient);
    const mimeType = detectMimeType(pdfUrl);

    // Use Lovable AI gateway (Gemini Flash) for quick extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI niet geconfigureerd" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Je bent een assistent die de onderwijscontext extraheert uit een opdrachtdocument. Analyseer het document en geef een korte samenvatting (max 400 tekens) die beschrijft:
- Het type opleiding (bachelor, master, mbo, etc.)
- Het vakgebied of de studierichting
- Het studiejaar of niveau
- Het type opdracht (verslag, essay, scriptie, etc.)
- Relevante context over de doelgroep

Schrijf in het Nederlands. Geef ALLEEN de samenvatting, geen extra uitleg of inleiding. Als het document onvoldoende informatie bevat, geef dan weer wat je wel kunt afleiden.`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: pdfUrl.split("/").pop()?.split("?")[0] || "document",
                  file_data: `data:${mimeType};base64,${base64Doc}`,
                },
              },
              {
                type: "text",
                text: "Extraheer de onderwijscontext uit dit opdrachtdocument.",
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "Kon context niet extraheren" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const extractedContext = aiData.choices?.[0]?.message?.content?.trim().slice(0, 500) || "";

    return new Response(JSON.stringify({ context: extractedContext }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Extract context error:", err);
    return new Response(JSON.stringify({ error: err.message || "Onbekende fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

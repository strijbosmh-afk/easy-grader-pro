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

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ ]/g, "").trim();
}

function findBestMatch(aiName: string, criteria: any[]): any | null {
  const norm = normalizeForMatch(aiName);
  
  let match = criteria.find(c => normalizeForMatch(c.criterium_naam) === norm);
  if (match) return match;
  
  match = criteria.find(c => normalizeForMatch(c.criterium_naam).includes(norm) || norm.includes(normalizeForMatch(c.criterium_naam)));
  if (match) return match;
  
  const aiWords = norm.split(/\s+/).filter(w => w.length > 2);
  let bestScore = 0;
  let bestMatch: any = null;
  for (const c of criteria) {
    const cNorm = normalizeForMatch(c.criterium_naam);
    const cWords = cNorm.split(/\s+/).filter((w: string) => w.length > 2);
    const overlap = aiWords.filter(w => cWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
    const score = overlap / Math.max(aiWords.length, cWords.length, 1);
    if (score > bestScore && score >= 0.2) {
      bestScore = score;
      bestMatch = c;
    }
  }
  if (bestMatch) return bestMatch;

  const indexMatch = aiName.match(/^(\d+)/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1]) - 1;
    if (idx >= 0 && idx < criteria.length) return criteria[idx];
  }

  return null;
}

function parseScoreValue(rawScore: unknown): number {
  // If the AI already returned a proper number, trust it directly.
  if (typeof rawScore === "number" && Number.isFinite(rawScore)) return rawScore;

  const rawText = typeof rawScore === "string" ? rawScore : String(rawScore ?? "");
  // Support comma-as-decimal (e.g. "7,5" → 7.5)
  const normalized = rawText.replace(/,/g, ".");
  const matches = normalized.match(/-?\d+(?:\.\d+)?/g);

  if (!matches || matches.length === 0) return 0;

  const parsedNumbers = matches
    .map((m) => Number(m))
    .filter((n) => Number.isFinite(n));

  if (parsedNumbers.length === 0) return 0;

  // Return the first number found. The AI is responsible for returning the
  // correct value based on the grading table — no client-side overrides needed.
  return parsedNumbers[0];
}

function buildPromptParts(project: any, student: any, subCriteria: any[], eindscoreCriterium: any, niveau: string, customInstructions?: string) {
  const niveauInstructies: Record<string, string> = {
    streng: `Wees zeer kritisch: geef geen hoge scores tenzij het werk echt uitblinkt. Een gemiddelde student scoort rond de 50-60% van het maximum per criterium.`,
    neutraal: `Beoordeel evenwichtig: benoem zowel sterke punten als verbeterpunten. Een gemiddelde student scoort rond de 60-70% van het maximum.`,
    mild: `Beoordeel stimulerend en positief: benadruk wat goed gaat. Een gemiddelde student scoort rond de 70-80% van het maximum.`,
  };

  let instruction: string;
  if (subCriteria.length > 0) {
    const criteriaList = subCriteria.map((c: any, idx: number) => {
      let line = `${idx + 1}. [ID: ${c.id}] "${c.criterium_naam}" — max score: ${c.max_score}`;
      // Include structured rubric levels if available
      if (c.rubric_levels && Array.isArray(c.rubric_levels) && c.rubric_levels.length > 0) {
        const levels = c.rubric_levels.map((l: any) => `    Score ${l.score}: ${l.description}`).join("\n");
        line += `\n  Scoreniveaus:\n${levels}`;
      }
      return line;
    }).join("\n");

    let eindscoreInstructie = "";
    if (eindscoreCriterium) {
      eindscoreInstructie = `\n\nDaarnaast moet je ook een EINDSCORE geven:
- [ID: ${eindscoreCriterium.id}] Criterium: "${eindscoreCriterium.criterium_naam}" — max score: ${eindscoreCriterium.max_score}
- Dit is de uiteindelijke beoordeling van het werk als geheel op /${eindscoreCriterium.max_score}.
- De eindscore is NIET simpelweg het gemiddelde van de deelscores, maar een holistische beoordeling.
- Volg de graderingstabel om te bepalen welke score past.`;
    }

    instruction = `Beoordeel het werk van student "${student.naam}".

Geef een score per DEELCRITERIUM. Je MOET de volgende namen EXACT en LETTERLIJK gebruiken (kopieer ze precies):
${criteriaList}
${eindscoreInstructie}

KRITISCH BELANGRIJK — SCORES UIT DE GRADERINGSTABEL:
- Bestudeer de graderingstabel PDF ZEER NAUWKEURIG voordat je scores geeft.
- De tabel definieert per criterium EXACT welke scores mogelijk zijn en wat elk scoreniveau betekent.
- Sommige criteria kunnen een AFTREK/STRAF-systeem gebruiken (bijv. 0 bij volledig, negatieve score bij onvolledig). Andere gebruiken een POSITIEF systeem (bijv. 0 = slecht, max = uitstekend).
- Lees per criterium in de graderingstabel welke DISCRETE waarden mogelijk zijn en kies EXACT een van die waarden. Verzin NOOIT tussenwaarden die niet in de tabel staan.
- Hardcodeer GEEN aannames over scoreschalen. LEES de tabel en volg die EXACT.
- Gebruik de criterium-namen EXACT zoals hierboven vermeld.
- Je MOET ALLE ${subCriteria.length} criteria beoordelen. Sla er GEEN over.
- Lees het studentwerk zorgvuldig en beoordeel op basis van de inhoud.

- BELANGRIJK: Gebruik het ID (het UUID tussen [ID: ...]) als "criterium_id" in je antwoord. Dit is VERPLICHT.`;
  } else {
    instruction = `Analyseer het werk van student "${student.naam}".
1. Lees de graderingstabel PDF en extraheer alle beoordelingscriteria.
2. Beoordeel per criterium.
3. Als er een eindcijfer/totaalscore in de tabel staat, geef dat ook.`;
  }

  const systemPrompt = `Je bent een ervaren docent die studentwerk beoordeelt. Je leest de documenten grondig.

${niveauInstructies[niveau] || niveauInstructies["streng"]}

SCORESCHAAL — LEES DE GRADERINGSTABEL:
- De graderingstabel PDF bepaalt welke scores mogelijk zijn per criterium. Bestudeer dit ZEER zorgvuldig.
- Elk criterium heeft zijn eigen scoreschaal. Lees de tabel om te bepalen welke waarden mogelijk zijn.
- Sommige criteria kunnen een aftrek/strafsysteem hebben, andere een positief puntensysteem. Volg EXACT wat de tabel voorschrijft.
- Geef EXACT een score die overeenkomt met een niveau uit de graderingstabel. Verzin GEEN tussenwaarden die niet in de tabel voorkomen.
- Kijk naar de beschrijvingen bij elk niveau in de tabel en bepaal welk niveau het beste past bij het studentwerk.

HEEL BELANGRIJK — INSTRUCTIES IN DE GRADERINGSTABEL:
- De graderingstabel bevat vaak gekleurde tekst (blauw, rood, etc.) met SPECIFIEKE INSTRUCTIES voor de beoordeling.
- Deze instructies MOET je strikt opvolgen. Bijvoorbeeld:
  - Als er staat "geef een opsomming van de taalfouten (met paginanummer en regelnummer)", dan MOET je dit letterlijk doen in je motivatie.
  - Als er staat "geef aan welke ideeën of verwoording niet duidelijk was (met paginanummer en regelnummers)", doe dit dan ook.
  - Als er condities staan zoals "Indien niet 'sterk':", volg dan de bijbehorende instructies wanneer de score niet het hoogste niveau bereikt.
- Lees ALLE tekst in de graderingstabel, inclusief kleine lettertjes, voetnoten, en gekleurde tekst.
- Verwerk deze instructies concreet in je motivatie per criterium.

SCHRIJFSTIJL MOTIVATIE:
- Schrijf als een menselijke docent, NIET als een AI.
- Gebruik GEEN markdown-opmaak: geen ** voor vet, geen * voor cursief, geen # voor kopjes, geen opsommingstekens met -.
- Schrijf gewone, vloeiende zinnen en alinea's.
- Vermijd AI-typische labels zoals "Aandachtspunten:", "Sterke punten:", "Samenvatting:" als kopjes.

DETAIL FEEDBACK (BLAUWE TEKST INSTRUCTIES):
- De graderingstabel bevat per criterium vaak specifieke instructies (vaak in blauw) over wat je moet rapporteren.
- Volg deze instructies LETTERLIJK en plaats het resultaat in het veld "detail_feedback".
- Voorbeelden van zulke instructies: "geef een opsomming van de taalfouten", "geef aan welke ideeën niet duidelijk waren", "noem de ontbrekende onderdelen".
- In de detail_feedback: geef ALTIJD concrete voorbeelden met paginanummer en regelnummer.
- Formaat: beschrijf elk punt op een nieuwe regel, bijv: "Pagina 3, regel 12: spelfout 'beinvloed' moet 'beïnvloed' zijn."
- BELANGRIJK: Geef voor IEDER criterium detail_feedback. Als er niets te verbeteren is, schrijf dan expliciet: "Geen verbeterpunten gevonden. Het werk voldoet aan alle vereisten voor dit criterium."
- Laat detail_feedback NOOIT leeg. Elk criterium krijgt feedback.
- Schrijf GEEN markdown in detail_feedback. Gewone tekst met regels.${customInstructions ? `

AANGEPASTE INSTRUCTIES VAN DE DOCENT — DEZE HEBBEN ABSOLUTE VOORRANG:
De docent heeft de volgende SPECIFIEKE instructies gegeven die je STRIKT moet opvolgen. Deze instructies overschrijven ALLE andere richtlijnen als er een conflict is. Volg ze LETTERLIJK:

${customInstructions}

HERHALING: Bovenstaande docent-instructies hebben VOORRANG boven alle andere regels in deze prompt. Als de docent zegt dat een criterium een specifieke score moet krijgen, volg dat dan EXACT.` : ""}`;


  return { instruction, systemPrompt };
}

const toolSchema = {
  type: "function" as const,
  function: {
    name: "submit_grading",
    description: "Submit grading results. Use EXACT criteria names as provided. Include the eindscore criterion if present.",
    parameters: {
      type: "object",
      properties: {
        criteria: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterium_id: { type: "string", description: "Het UUID van het criterium, exact zoals opgegeven in [ID: ...]" },
              naam: { type: "string" },
              max_score: { type: "number" },
              score: { type: "number" },
              motivatie: { type: "string", description: "Korte motivatie voor de score" },
              detail_feedback: { type: "string", description: "Gedetailleerde feedback op basis van de instructies in de graderingstabel (blauwe tekst). Bevat concrete voorbeelden met paginanummers en regelnummers. Laat leeg als er geen specifieke instructies zijn voor dit criterium." },
            },
            required: ["criterium_id", "naam", "max_score", "score", "motivatie", "detail_feedback"],
            additionalProperties: false,
          },
        },
        algemene_feedback: { type: "string" },
      },
      required: ["criteria", "algemene_feedback"],
      additionalProperties: false,
    },
  },
};

async function callLovableAI(systemPrompt: string, contentParts: any[]) {
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
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "submit_grading" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Lovable AI error:", response.status, errText);
    if (response.status === 429) throw { status: 429, message: "AI is tijdelijk overbelast" };
    if (response.status === 402) throw { status: 402, message: "AI credits op" };
    throw new Error(`AI analyse mislukt: ${response.status}`);
  }

  const data = await response.json();
  return parseAIResponse(data);
}

async function callAnthropicAI(systemPrompt: string, contentParts: any[], retryCount = 0): Promise<any> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY niet geconfigureerd");

  const MAX_RETRIES = 1;
  const TIMEOUT_MS = 280_000; // 280 seconds

  // Convert contentParts to Anthropic format
  const anthropicContent: any[] = [];
  for (const part of contentParts) {
    if (part.type === "text") {
      anthropicContent.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const url = part.image_url.url;
      if (url.startsWith("data:application/pdf;base64,")) {
        const base64 = url.replace("data:application/pdf;base64,", "");
        anthropicContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        });
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log(`Anthropic call attempt ${retryCount + 1}/${MAX_RETRIES + 1}...`);
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
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: anthropicContent }],
        tools: [{
          name: "submit_grading",
          description: toolSchema.function.description,
          input_schema: toolSchema.function.parameters,
        }],
        tool_choice: { type: "tool", name: "submit_grading" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      if (response.status === 429) {
        if (retryCount < MAX_RETRIES) {
          console.log("Rate limited, retrying in 10s...");
          await new Promise(r => setTimeout(r, 10_000));
          return callAnthropicAI(systemPrompt, contentParts, retryCount + 1);
        }
        throw { status: 429, message: "Anthropic API is tijdelijk overbelast" };
      }
      if (response.status === 529 && retryCount < MAX_RETRIES) {
        console.log("Anthropic overloaded (529), retrying in 15s...");
        await new Promise(r => setTimeout(r, 15_000));
        return callAnthropicAI(systemPrompt, contentParts, retryCount + 1);
      }
      if (response.status === 402 || response.status === 400) {
        const parsed = JSON.parse(errText).error?.message || errText;
        throw new Error(`Anthropic fout: ${parsed}`);
      }
      throw new Error(`Anthropic analyse mislukt: ${response.status}`);
    }

    const data = await response.json();
    const toolUse = data.content?.find((c: any) => c.type === "tool_use" && c.name === "submit_grading");
    if (toolUse) return toolUse.input;

    const textBlock = data.content?.find((c: any) => c.type === "text");
    if (textBlock) {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Kon Anthropic antwoord niet verwerken");
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("Anthropic call timed out after", TIMEOUT_MS / 1000, "seconds");
      if (retryCount < MAX_RETRIES) {
        console.log("Retrying after timeout...");
        return callAnthropicAI(systemPrompt, contentParts, retryCount + 1);
      }
      throw new Error("Claude analyse duurde te lang. Probeer het opnieuw of gebruik Gemini.");
    }
    throw err;
  }
}

function parseAIResponse(aiData: any) {
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  const content = aiData.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  console.error("Unexpected AI response:", JSON.stringify(aiData).substring(0, 500));
  throw new Error("Kon AI antwoord niet verwerken");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Accept optional pre-fetched PDFs from batch caller to avoid re-downloading per student
    const {
      studentId,
      projectId,
      niveauOverride,
      cachedGraderingstabelBase64,
      cachedOpdrachtBase64,
    } = await req.json();

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

    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).single();
    if (!project) {
      return new Response(JSON.stringify({ error: "Project niet gevonden of geen toegang" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();

    if (!student) throw new Error("Student niet gevonden");
    if (!student.pdf_url) throw new Error("Student heeft geen PDF");

    let { data: existingCriteria } = await supabase
      .from("grading_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("volgorde", { ascending: true });

    const niveau = niveauOverride || (project as any).beoordelingsniveau || "streng";
    const aiProvider = (project as any).ai_provider || "lovable";

    const subCriteria = existingCriteria?.filter((c: any) => !c.is_eindscore) || [];
    const eindscoreCriterium = existingCriteria?.find((c: any) => c.is_eindscore);

    // Download PDFs — use pre-fetched base64 when available (batch mode)
    console.log("Downloading PDFs...");
    const pdfPromises: Promise<string>[] = [];
    const pdfLabels: string[] = [];

    if (project.graderingstabel_pdf_url) {
      pdfPromises.push(
        cachedGraderingstabelBase64
          ? Promise.resolve(cachedGraderingstabelBase64)
          : fetchPdfAsBase64(project.graderingstabel_pdf_url)
      );
      pdfLabels.push("graderingstabel");
    }
    if (project.opdracht_pdf_url) {
      pdfPromises.push(
        cachedOpdrachtBase64
          ? Promise.resolve(cachedOpdrachtBase64)
          : fetchPdfAsBase64(project.opdracht_pdf_url)
      );
      pdfLabels.push("opdracht");
    }
    pdfPromises.push(fetchPdfAsBase64(student.pdf_url));
    pdfLabels.push("student");

    const pdfBase64s = await Promise.all(pdfPromises);
    console.log("PDFs loaded:", pdfLabels.join(", "), cachedGraderingstabelBase64 ? "(graderingstabel from cache)" : "");

    // Build multimodal content
    const contentParts: any[] = [];
    for (let i = 0; i < pdfBase64s.length; i++) {
      contentParts.push({ type: "text", text: `--- ${pdfLabels[i].toUpperCase()} PDF ---` });
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${pdfBase64s[i]}` },
      });
    }

    const customInstructions = (project as any).custom_instructions || undefined;
    const { instruction, systemPrompt } = buildPromptParts(project, student, subCriteria, eindscoreCriterium, niveau, customInstructions);
    contentParts.push({ type: "text", text: instruction });

    // Call the appropriate AI provider
    console.log(`Using AI provider: ${aiProvider}`);
    let result;
    try {
      if (aiProvider === "anthropic") {
        result = await callAnthropicAI(systemPrompt, contentParts);
      } else {
        result = await callLovableAI(systemPrompt, contentParts);
      }
    } catch (err: any) {
      if (err.status === 429 || err.status === 402) {
        await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    console.log("AI returned criteria:", result.criteria?.length, "items");

    // If no criteria exist yet, create them
    if (!existingCriteria || existingCriteria.length === 0) {
      const criteriaToInsert = result.criteria.map((c: any, i: number) => ({
        project_id: projectId,
        criterium_naam: c.naam,
        max_score: c.max_score,
        volgorde: i,
        is_eindscore: false,
      }));

      const { data: inserted, error: criteriaError } = await supabase
        .from("grading_criteria")
        .insert(criteriaToInsert)
        .select();

      if (criteriaError) throw criteriaError;
      existingCriteria = inserted;
    }

    // Fetch old scores before deletion for audit logging
    const { data: oldScores } = await supabase
      .from("student_scores")
      .select("criterium_id, ai_suggested_score, final_score, opmerkingen")
      .eq("student_id", studentId);
    const oldScoreMap = new Map((oldScores || []).map((s: any) => [s.criterium_id, s]));

    // Delete existing scores, then batch-insert new ones
    await supabase.from("student_scores").delete().eq("student_id", studentId);

    let matchedCount = 0;
    const usedCriteria = new Set<string>();
    const unmatchedAiCriteria: string[] = [];
    const unmatchedDbCriteria: string[] = [];
    const scoresToInsert: any[] = [];

    // Build a lookup of valid criteria IDs for this project
    const validCriteriaIds = new Set(existingCriteria!.map((c: any) => c.id));

    for (const aiCriterium of result.criteria) {
      // Primary: match by ID (the new way)
      const criteriumId = aiCriterium.criterium_id;
      if (criteriumId && validCriteriaIds.has(criteriumId) && !usedCriteria.has(criteriumId)) {
        usedCriteria.add(criteriumId);
        scoresToInsert.push({
          student_id: studentId,
          criterium_id: criteriumId,
          ai_suggested_score: parseScoreValue(aiCriterium.score),
          ai_motivatie: aiCriterium.motivatie,
          ai_detail_feedback: aiCriterium.detail_feedback || null,
        });
        matchedCount++;
      } else {
        // Fallback: try fuzzy name matching (backward compat for older AI responses)
        const matched = findBestMatch(aiCriterium.naam, existingCriteria!.filter((c: any) => !usedCriteria.has(c.id)));
        if (matched) {
          usedCriteria.add(matched.id);
          scoresToInsert.push({
            student_id: studentId,
            criterium_id: matched.id,
            ai_suggested_score: parseScoreValue(aiCriterium.score),
            ai_motivatie: aiCriterium.motivatie,
            ai_detail_feedback: aiCriterium.detail_feedback || null,
          });
          matchedCount++;
        } else {
          console.warn("No match for AI criterion:", aiCriterium.naam, "ID:", criteriumId);
          unmatchedAiCriteria.push(aiCriterium.naam);
        }
      }
    }

    // Fill unmatched DB criteria with null score and a clear warning message
    for (const c of existingCriteria!) {
      if (!usedCriteria.has(c.id)) {
        console.warn("No AI score for criterion:", c.criterium_naam);
        unmatchedDbCriteria.push(c.criterium_naam);
        scoresToInsert.push({
          student_id: studentId,
          criterium_id: c.id,
          ai_suggested_score: null,
          ai_motivatie: `⚠️ De AI heeft dit criterium niet beoordeeld. Controleer of de criterium-naam in de graderingstabel overeenkomt met "${c.criterium_naam}".`,
        });
      }
    }

    // Single batch insert for all scores
    if (scoresToInsert.length > 0) {
      await supabase.from("student_scores").insert(scoresToInsert);
    }

    // Log score changes to audit trail
    const auditRows = scoresToInsert
      .filter((s: any) => s.ai_suggested_score !== null)
      .map((s: any) => {
        const old = oldScoreMap.get(s.criterium_id);
        return {
          student_id: studentId,
          criterium_id: s.criterium_id,
          user_id: user.id,
          old_score: old?.final_score ?? old?.ai_suggested_score ?? null,
          new_score: s.ai_suggested_score,
          old_opmerkingen: old?.opmerkingen ?? null,
          new_opmerkingen: null,
          change_type: "ai_analysis",
        };
      });
    if (auditRows.length > 0) {
      await supabase.from("score_audit_log").insert(auditRows);
    }

    console.log(`Matched ${matchedCount}/${result.criteria.length} AI criteria to ${existingCriteria!.length} DB criteria`);

    const hasWarnings = unmatchedDbCriteria.length > 0;

    await supabase.from("students").update({
      status: "reviewed",
      ai_feedback: result.algemene_feedback,
    }).eq("id", studentId);

    return new Response(JSON.stringify({
      success: true,
      matched: matchedCount,
      total: existingCriteria!.length,
      warnings: hasWarnings ? {
        unmatchedDbCriteria,
        unmatchedAiCriteria,
        message: `${unmatchedDbCriteria.length} criteria konden niet worden gekoppeld aan AI-output. Controleer de scorekaart.`,
      } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
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

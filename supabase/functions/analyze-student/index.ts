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
  
  // Exact match
  let match = criteria.find(c => normalizeForMatch(c.criterium_naam) === norm);
  if (match) return match;
  
  // Substring match
  match = criteria.find(c => normalizeForMatch(c.criterium_naam).includes(norm) || norm.includes(normalizeForMatch(c.criterium_naam)));
  if (match) return match;
  
  // Word overlap match with lower threshold
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

  // Positional fallback: if AI returns criteria by index number prefix like "1." or "Criterium 1"
  const indexMatch = aiName.match(/^(\d+)/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1]) - 1;
    if (idx >= 0 && idx < criteria.length) return criteria[idx];
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { studentId, projectId, niveauOverride } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();

    if (!project || !student) throw new Error("Project of student niet gevonden");
    if (!student.pdf_url) throw new Error("Student heeft geen PDF");

    let { data: existingCriteria } = await supabase
      .from("grading_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("volgorde", { ascending: true });

    const niveau = niveauOverride || (project as any).beoordelingsniveau || "streng";

    const niveauInstructies: Record<string, string> = {
      streng: `Wees zeer kritisch: geef geen hoge scores tenzij het werk echt uitblinkt. Een gemiddelde student scoort rond de 50-60% van het maximum per criterium.`,
      neutraal: `Beoordeel evenwichtig: benoem zowel sterke punten als verbeterpunten. Een gemiddelde student scoort rond de 60-70% van het maximum.`,
      mild: `Beoordeel stimulerend en positief: benadruk wat goed gaat. Een gemiddelde student scoort rond de 70-80% van het maximum.`,
    };

    // Separate sub-criteria from eindscore criterion
    const subCriteria = existingCriteria?.filter((c: any) => !c.is_eindscore) || [];
    const eindscoreCriterium = existingCriteria?.find((c: any) => c.is_eindscore);

    // Download PDFs
    console.log("Downloading PDFs...");
    const pdfPromises: Promise<string>[] = [];
    const pdfLabels: string[] = [];

    if (project.graderingstabel_pdf_url) {
      pdfPromises.push(fetchPdfAsBase64(project.graderingstabel_pdf_url));
      pdfLabels.push("graderingstabel");
    }
    if (project.opdracht_pdf_url) {
      pdfPromises.push(fetchPdfAsBase64(project.opdracht_pdf_url));
      pdfLabels.push("opdracht");
    }
    pdfPromises.push(fetchPdfAsBase64(student.pdf_url));
    pdfLabels.push("student");

    const pdfBase64s = await Promise.all(pdfPromises);
    console.log("PDFs downloaded:", pdfLabels.join(", "));

    // Build multimodal content
    const contentParts: any[] = [];
    for (let i = 0; i < pdfBase64s.length; i++) {
      contentParts.push({ type: "text", text: `--- ${pdfLabels[i].toUpperCase()} PDF ---` });
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${pdfBase64s[i]}` },
      });
    }

    // Build instruction
    let instruction: string;
    if (subCriteria.length > 0) {
      const criteriaList = subCriteria.map((c: any, idx: number) =>
        `${idx + 1}. "${c.criterium_naam}" — max score: ${c.max_score}`
      ).join("\n");

      let eindscoreInstructie = "";
      if (eindscoreCriterium) {
        eindscoreInstructie = `\n\nDaarnaast moet je ook een EINDSCORE geven:
- Criterium: "${eindscoreCriterium.criterium_naam}" — max score: ${eindscoreCriterium.max_score}
- Dit is de uiteindelijke beoordeling van het werk als geheel op /${eindscoreCriterium.max_score}.
- De eindscore is NIET simpelweg het gemiddelde van de deelscores, maar een holistische beoordeling.
- Volg de graderingstabel om te bepalen welke score past.`;
      }

      instruction = `Beoordeel het werk van student "${student.naam}".

Geef een score per DEELCRITERIUM. Je MOET de volgende namen EXACT en LETTERLIJK gebruiken (kopieer ze precies):
${criteriaList}
${eindscoreInstructie}

KRITISCH BELANGRIJK — SCORES UIT DE GRADERINGSTABEL:
- Bestudeer de graderingstabel ZEER NAUWKEURIG. De tabel definieert EXACT welke scores mogelijk zijn per criterium.
- Sommige criteria gebruiken een AFTREK/STRAF-systeem. Bijvoorbeeld "Volledigheid & naleving opdracht" heeft ALLEEN twee mogelijke scores: 0 (alles aanwezig/volledig) of -5 (onvolledig). Er bestaan GEEN tussenwaarden. Kies EXACT 0 of -5.
- Andere criteria gebruiken een POSITIEF systeem: bijv. 0 = slecht, 30 = uitstekend.
- Lees per criterium in de graderingstabel welke DISCRETE waarden mogelijk zijn en kies EXACT een van die waarden. Verzin NOOIT tussenwaarden.
- Gebruik de criterium-namen EXACT zoals hierboven vermeld.
- Je MOET ALLE ${subCriteria.length} criteria beoordelen. Sla er GEEN over.
- Lees het studentwerk zorgvuldig en beoordeel op basis van de inhoud.`;
    } else {
      instruction = `Analyseer het werk van student "${student.naam}".
1. Lees de graderingstabel PDF en extraheer alle beoordelingscriteria.
2. Beoordeel per criterium.
3. Als er een eindcijfer/totaalscore in de tabel staat, geef dat ook.`;
    }

    contentParts.push({ type: "text", text: instruction });

    const systemPrompt = `Je bent een ervaren docent die studentwerk beoordeelt. Je leest de documenten grondig.

${niveauInstructies[niveau] || niveauInstructies["streng"]}

SCORESCHAAL — LEES DE GRADERINGSTABEL:
- De graderingstabel bepaalt welke DISCRETE scores mogelijk zijn per criterium. Bestudeer dit ZEER zorgvuldig.
- Sommige criteria werken met AFTREK (straf): bijv. "Volledigheid & naleving opdracht" heeft EXACT twee opties: 0 (volledig) of -5 (onvolledig). KIES ALLEEN 0 of -5, niets anders.
- Andere criteria werken met POSITIEVE punten: bijv. 0 = onvoldoende, 30 = uitstekend.
- Geef EXACT een score die overeenkomt met een niveau uit de graderingstabel. Verzin GEEN tussenwaarden.
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
- Schrijf GEEN markdown in detail_feedback. Gewone tekst met regels.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentParts },
        ],
        tools: [
          {
            type: "function",
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
                        naam: { type: "string" },
                        max_score: { type: "number" },
                        score: { type: "number" },
                        motivatie: { type: "string", description: "Korte motivatie voor de score" },
                        detail_feedback: { type: "string", description: "Gedetailleerde feedback op basis van de instructies in de graderingstabel (blauwe tekst). Bevat concrete voorbeelden met paginanummers en regelnummers. Laat leeg als er geen specifieke instructies zijn voor dit criterium." },
                      },
                      required: ["naam", "max_score", "score", "motivatie", "detail_feedback"],
                      additionalProperties: false,
                    },
                  },
                  algemene_feedback: { type: "string" },
                },
                required: ["criteria", "algemene_feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_grading" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
        return new Response(JSON.stringify({ error: "AI is tijdelijk overbelast" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        await supabase.from("students").update({ status: "pending" }).eq("id", studentId);
        return new Response(JSON.stringify({ error: "AI credits op" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analyse mislukt: ${aiResponse.status}`);
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
        console.error("Unexpected AI response:", JSON.stringify(aiData).substring(0, 500));
        throw new Error("Kon AI antwoord niet verwerken");
      }
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

    // Delete existing scores, then insert new
    await supabase.from("student_scores").delete().eq("student_id", studentId);

    let matchedCount = 0;
    const usedCriteria = new Set<string>();

    for (const aiCriterium of result.criteria) {
      const matched = findBestMatch(aiCriterium.naam, existingCriteria!.filter((c: any) => !usedCriteria.has(c.id)));
      if (matched) {
        usedCriteria.add(matched.id);
        const score = Number(aiCriterium.score) || 0;
        await supabase.from("student_scores").insert({
          student_id: studentId,
          criterium_id: matched.id,
          ai_suggested_score: score,
          ai_motivatie: aiCriterium.motivatie,
          ai_detail_feedback: aiCriterium.detail_feedback || null,
        });
        matchedCount++;
      } else {
        console.warn("No match for AI criterion:", aiCriterium.naam);
      }
    }

    // Fill missing criteria with 0
    for (const c of existingCriteria!) {
      if (!usedCriteria.has(c.id)) {
        console.warn("No AI score for criterion:", c.criterium_naam);
        await supabase.from("student_scores").insert({
          student_id: studentId,
          criterium_id: c.id,
          ai_suggested_score: 0,
          ai_motivatie: "Geen beoordeling ontvangen van AI voor dit criterium.",
        });
      }
    }

    console.log(`Matched ${matchedCount}/${result.criteria.length} AI criteria to ${existingCriteria!.length} DB criteria`);

    await supabase.from("students").update({
      status: "reviewed",
      ai_feedback: result.algemene_feedback,
    }).eq("id", studentId);

    return new Response(JSON.stringify({ success: true, matched: matchedCount, total: existingCriteria!.length }), {
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

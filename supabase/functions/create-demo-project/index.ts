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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {

    // Verify custom header
    const requestedBy = req.headers.get("x-requested-by");
    if (requestedBy !== "GradeAssist") {
      return new Response(JSON.stringify({ error: "Geen toegang" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Ongeldige sessie" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if user already has a demo project
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_demo", true)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, projectId: existing[0].id, existed: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Create demo project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        naam: "Demo: Stageverslag beoordelen",
        user_id: user.id,
        is_demo: true,
        education_context:
          "Kleuteronderwijs, bachelor opleiding, Vlaanderen. Studenten schrijven een reflectieverslag over hun stage-ervaring.",
        custom_instructions:
          "Dit is een voorbeeldproject om GradeAssist te leren kennen. Je kunt het na het verkennen verwijderen.",
        beoordelingsniveau: "streng",
        ai_provider: "lovable",
      })
      .select("id")
      .single();

    if (projErr) throw projErr;
    const projectId = project.id;

    // Create 4 criteria
    const criteriaData = [
      { criterium_naam: "Reflectievermogen", max_score: 10, volgorde: 1, project_id: projectId },
      { criterium_naam: "Koppeling theorie-praktijk", max_score: 10, volgorde: 2, project_id: projectId },
      { criterium_naam: "Taalgebruik en structuur", max_score: 10, volgorde: 3, project_id: projectId },
      { criterium_naam: "Professionele houding", max_score: 10, volgorde: 4, project_id: projectId },
    ];

    const { data: criteria, error: critErr } = await supabase
      .from("grading_criteria")
      .insert(criteriaData)
      .select("id, criterium_naam");

    if (critErr) throw critErr;

    const criteriaMap = new Map(criteria.map((c: any) => [c.criterium_naam, c.id]));

    // Create 2 students
    const studentsData = [
      {
        naam: "Anna DemoStudent",
        project_id: projectId,
        status: "graded" as const,
        ai_feedback:
          "Anna toont een sterke reflectieve houding doorheen haar verslag. Ze koppelt haar praktijkervaringen aan theoretische kaders en schrijft in een heldere, academische stijl. Haar professionele houding blijkt uit de manier waarop ze omgaat met feedback van haar mentor.",
      },
      {
        naam: "Ben Demotest",
        project_id: projectId,
        status: "graded" as const,
        ai_feedback:
          "Ben beschrijft zijn stage-ervaringen vrij oppervlakkig. De link met theorie ontbreekt grotendeels en het taalgebruik bevat meerdere fouten. Er is ruimte voor groei in zijn professionele houding.",
      },
    ];

    const { data: students, error: studErr } = await supabase
      .from("students")
      .insert(studentsData)
      .select("id, naam");

    if (studErr) throw studErr;

    const anna = students.find((s: any) => s.naam === "Anna DemoStudent")!;
    const ben = students.find((s: any) => s.naam === "Ben Demotest")!;

    // Scores for Anna (good student: 7-9)
    const annaScores = [
      {
        student_id: anna.id,
        criterium_id: criteriaMap.get("Reflectievermogen"),
        ai_suggested_score: 9,
        final_score: 9,
        ai_confidence: "high",
        ai_motivatie:
          "Anna reflecteert diepgaand over haar stage-ervaringen. Ze beschrijft niet alleen wat er gebeurde, maar analyseert ook waarom bepaalde situaties zo verliepen en wat ze daaruit geleerd heeft. Ze benoemt haar eigen groei en aandachtspunten op een eerlijke manier.",
        ai_detail_feedback:
          "De reflectie gaat verder dan oppervlakkige beschrijvingen. Anna verbindt haar ervaringen met haar persoonlijke ontwikkeling als toekomstige kleuterleidster. Ze benoemt concrete leermomenten en formuleert doelen voor de toekomst. Enkel bij het hoofdstuk over klasmanagement had ze iets dieper kunnen ingaan op haar eigen aandeel.",
      },
      {
        student_id: anna.id,
        criterium_id: criteriaMap.get("Koppeling theorie-praktijk"),
        ai_suggested_score: 8,
        final_score: 8,
        ai_confidence: "high",
        ai_motivatie:
          "Anna verwijst regelmatig naar theoretische kaders uit haar opleiding. Ze koppelt ontwikkelingspsychologische concepten aan haar observaties in de klas. De link met de theorie is duidelijk aanwezig, al had ze in sommige gevallen meer bronnen kunnen raadplegen.",
        ai_detail_feedback:
          "Sterke verwijzingen naar Piaget en Vygotsky bij het beschrijven van spelactiviteiten. De koppeling met het leerplan kleuteronderwijs is aanwezig maar had explicieter gekund. Twee van de vijf beschreven activiteiten missen een theoretische onderbouwing.",
      },
      {
        student_id: anna.id,
        criterium_id: criteriaMap.get("Taalgebruik en structuur"),
        ai_suggested_score: 8,
        final_score: 8,
        ai_confidence: "high",
        ai_motivatie:
          "Het verslag is goed gestructureerd met een duidelijke inleiding, kern en besluit. Het taalgebruik is verzorgd en academisch van aard. Er zijn slechts enkele spelfouten gevonden.",
        ai_detail_feedback:
          "De structuur volgt logisch de stageperiode. Paragrafen zijn goed afgebakend. Twee kleine spelfouten gevonden. De overgangen tussen hoofdstukken zijn soms abrupt. De conclusie vat de belangrijkste bevindingen goed samen.",
      },
      {
        student_id: anna.id,
        criterium_id: criteriaMap.get("Professionele houding"),
        ai_suggested_score: 7,
        final_score: 7,
        ai_confidence: "medium",
        ai_motivatie:
          "Anna toont een positieve professionele houding. Ze beschrijft hoe ze omgaat met feedback van haar mentor en collega's. Er is enige aarzeling zichtbaar in het nemen van eigen initiatief, wat een aandachtspunt is.",
        ai_detail_feedback:
          "De beschrijving van de samenwerking met het team is positief. Anna neemt feedback ter harte en past haar aanpak aan. Ze had meer eigen initiatief kunnen tonen bij het plannen van activiteiten. Haar houding tegenover ouders wordt beperkt beschreven.",
      },
    ];

    // Scores for Ben (weaker student: 4-6)
    const benScores = [
      {
        student_id: ben.id,
        criterium_id: criteriaMap.get("Reflectievermogen"),
        ai_suggested_score: 5,
        final_score: 5,
        ai_confidence: "medium",
        ai_motivatie:
          "Ben beschrijft zijn ervaringen maar reflecteert er weinig op. Hij vertelt wat er gebeurde zonder te analyseren waarom of wat hij ervan geleerd heeft. De reflectie blijft aan de oppervlakte.",
        ai_detail_feedback:
          "Het verslag leest meer als een dagboek dan als een reflectieverslag. Ben somt activiteiten op zonder stil te staan bij het leerproces. Bij het hoofdstuk over groepsmomenten beschrijft hij wel kort wat hij anders zou doen, maar zonder verdere verdieping.",
      },
      {
        student_id: ben.id,
        criterium_id: criteriaMap.get("Koppeling theorie-praktijk"),
        ai_suggested_score: 4,
        final_score: 4,
        ai_confidence: "low",
        ai_motivatie:
          "De koppeling met theorie ontbreekt grotendeels. Ben verwijst eenmaal naar een handboek maar werkt dit niet uit. Er zijn geen verwijzingen naar ontwikkelingspsychologische kaders of het leerplan.",
        ai_detail_feedback:
          "Slechts een bronvermelding in het hele verslag. Geen inhoudelijke koppeling met de theoretische achtergrond uit de opleiding. De beschreven activiteiten worden niet onderbouwd vanuit pedagogisch of didactisch perspectief.",
      },
      {
        student_id: ben.id,
        criterium_id: criteriaMap.get("Taalgebruik en structuur"),
        ai_suggested_score: 5,
        final_score: 5,
        ai_confidence: "medium",
        ai_motivatie:
          "Het verslag heeft een basisstructuur maar de opbouw is niet altijd logisch. Er zijn meerdere taalfouten en de zinsbouw is soms onbeholpen. Het taalgebruik is informeel voor een academisch verslag.",
        ai_detail_feedback:
          "Acht spelfouten en drie grammaticafouten gevonden. De inleiding is te kort en geeft geen duidelijk overzicht van het verslag. Sommige paragrafen bevatten slechts twee zinnen. Het besluit herhaalt de inleiding zonder nieuwe inzichten toe te voegen.",
      },
      {
        student_id: ben.id,
        criterium_id: criteriaMap.get("Professionele houding"),
        ai_suggested_score: 6,
        final_score: 6,
        ai_confidence: "medium",
        ai_motivatie:
          "Ben toont een basisniveau van professionaliteit. Hij is op tijd aanwezig en volgt instructies op. Er is echter weinig eigen initiatief zichtbaar en de omgang met feedback wordt niet beschreven.",
        ai_detail_feedback:
          "Ben beschrijft dat hij de regels van de stageplaats respecteert. Hij vermeldt geen concrete situaties waarin hij feedback kreeg of eigen initiatief nam. De samenwerking met collega's wordt slechts terloops benoemd.",
      },
    ];

    const { error: scoreErr } = await supabase
      .from("student_scores")
      .insert([...annaScores, ...benScores]);

    if (scoreErr) throw scoreErr;

    // Mark onboarding completed
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ success: true, projectId }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error creating demo project:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

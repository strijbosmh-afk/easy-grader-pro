import { BookOpen, Brain, ShieldCheck, Sparkles, Target, AlertTriangle, RotateCcw, MessageSquare, TrendingUp, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const strengths = [
  {
    icon: Brain,
    title: "Tweefase-beoordeling",
    description:
      "De AI leest het studentwerk eerst grondig en schrijft per criterium een analyse: wat is goed, wat ontbreekt, en welk rubric-niveau past het best. Pas daarna worden definitieve scores toegekend. Doordat de AI eerst nadenkt en bewijs verzamelt, zijn de scores beter onderbouwd en consistenter.",
  },
  {
    icon: Target,
    title: "Score Anchoring",
    description:
      "De AI vergelijkt het studentwerk met elke niveaubeschrijving in de rubric, van hoog naar laag, en kiest exact het niveau dat het best overeenkomt. Nooit een tussenwaarde die niet in de rubric staat. Valt het werk tussen twee niveaus, dan wordt het lagere niveau gekozen.",
  },
  {
    icon: ShieldCheck,
    title: "Server-side scorevalidatie",
    description:
      "Elke score wordt achteraf gevalideerd: overschrijdt een score het maximum of komt het niet overeen met een gedefinieerd rubric-niveau, dan wordt deze automatisch gecorrigeerd naar de dichtstbijzijnde geldige waarde. U wordt hiervan op de hoogte gebracht.",
  },
  {
    icon: AlertTriangle,
    title: "Betrouwbaarheidsindicatie",
    description:
      "Per criterium geeft de AI aan of het hoog, gemiddeld of laag vertrouwen heeft in de score. Lage betrouwbaarheid wordt gemarkeerd zodat u weet waar extra controle nodig is.",
  },
  {
    icon: RotateCcw,
    title: "Automatische herpoging",
    description:
      "Als de AI criteria mist, wordt automatisch een tweede poging gedaan met een gerichte correctieprompt. Alleen het beste resultaat wordt bewaard.",
  },
  {
    icon: MessageSquare,
    title: "Constructieve feedback",
    description:
      "Feedback begint altijd met positieve punten, gevolgd door concrete verbeterpunten met paginaverwijzingen, en eindigt met een ontwikkelingsgericht advies. De AI volgt instructies in de graderingstabel letterlijk op.",
  },
];

const features = [
  {
    title: "Onderwijscontext",
    description:
      "Stel per project in welke opleiding en welk type studenten u beoordeelt. De AI past verwachtingsniveau en taal hierop aan.",
  },
  {
    title: "Scoringssysteemanalyse",
    description:
      "Bij het inlezen van de graderingstabel maakt de AI eerst een samenvatting van het scoringssysteem: positieve punten, aftrekpunten, gewichten of formules. Dit voorkomt verkeerde interpretaties.",
  },
  {
    title: "Eindscore-detectie",
    description:
      "De AI controleert of de graderingstabel een formule bevat voor de eindscore en berekent deze. Zonder formule geeft het een holistische eindscore die coherent is met de deelscores.",
  },
  {
    title: "Gedetailleerde feedback",
    description:
      "De AI volgt instructies in de graderingstabel (vaak gekleurde tekst) letterlijk op en geeft concrete feedback met paginaverwijzingen.",
  },
];

const workflowSteps = [
  {
    step: 1,
    title: "Project instellen",
    description:
      "Upload de graderingstabel en optioneel de opdrachtomschrijving. Vul de onderwijscontext in zodat de AI weet welk type studenten u beoordeelt. De AI analyseert automatisch de graderingstabel en extraheert criteria met scoreniveaus.",
  },
  {
    step: 2,
    title: "Studenten uploaden",
    description:
      "Upload de PDF-bestanden van alle studenten. U kunt ze individueel of in batch laten beoordelen.",
  },
  {
    step: 3,
    title: "AI-beoordeling starten",
    description:
      "De AI doorloopt het tweefase-proces per student. In batchmodus worden meerdere studenten parallel verwerkt.",
  },
  {
    step: 4,
    title: "Controleren en bijsturen",
    description:
      "Bekijk de scorekaart per student. Let vooral op scores met lage betrouwbaarheid en eventuele validatiewaarschuwingen. Pas scores en feedback aan waar nodig.",
  },
  {
    step: 5,
    title: "Finaliseren",
    description:
      "Wanneer u tevreden bent, finaliseert u de scores. Alleen gefinaliseerde scores worden meegenomen in rapporten.",
  },
];

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Handleiding AI-Beoordeling
          </h1>
        </div>
      </div>

      {/* Introduction */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            GradeAssist gebruikt geavanceerde AI-modellen om het werk van studenten te analyseren en te beoordelen op basis van uw graderingstabel. Het systeem leest drie documenten: de graderingstabel (rubric), de opdrachtomschrijving en het ingediende studentwerk. Vervolgens produceert het per criterium een score met motivatie, gedetailleerde feedback en een betrouwbaarheidsindicatie.
          </p>
          <div className="mt-4 rounded-lg bg-primary/5 border border-primary/10 p-4">
            <p className="text-sm font-medium text-foreground">
              De AI vervangt de docent niet. De AI levert een grondige eerste beoordeling die u als docent vervolgens controleert, bijstuurt en finaliseert. Dit bespaart tijd en verhoogt de consistentie, terwijl het eindoordeel altijd bij u als professional blijft.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Strengths */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Sterktes van de AI</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {strengths.map((s) => (
            <Card key={s.title} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm">{s.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Smart Features Table */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Slimme functies</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {features.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <span className="text-sm font-medium text-foreground min-w-[180px] shrink-0">
                    {f.title}
                  </span>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Validation */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Validatie en betrouwbaarheid</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              De AI is krachtig, maar niet onfeilbaar. Daarom heeft GradeAssist meerdere veiligheidslagen ingebouwd:
            </p>
            <ul className="space-y-3">
              {[
                "Server-side scorevalidatie: Elke score wordt gecontroleerd tegen het maximum en de gedefinieerde rubric-niveaus. Ongeldige scores worden automatisch gecorrigeerd en de docent krijgt een melding.",
                "Betrouwbaarheidsindicator: Scores waar de AI onzeker over is, worden gemarkeerd met een waarschuwingsicoon. Dit zijn de scores die u als eerste moet controleren.",
                "Validatiewaarschuwingen: Als scores zijn gecorrigeerd of criteria niet gekoppeld konden worden, verschijnt een samenvatting bovenaan de scorekaart.",
                "Audit trail: Elke scorewijziging (door AI of handmatig) wordt gelogd met tijdstip, oude waarde en nieuwe waarde. Zo is altijd traceerbaar wie wat heeft aangepast.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Workflow */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Uw workflow</h2>
        <div className="space-y-3">
          {workflowSteps.map((ws) => (
            <Card key={ws.step} className="border-border/60">
              <CardContent className="flex items-start gap-4 pt-4 pb-4">
                <span className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">
                  {ws.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{ws.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{ws.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Closing */}
      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="pt-6">
          <p className="text-sm text-foreground leading-relaxed">
            GradeAssist combineert de analytische kracht van AI met uw professioneel oordeel als docent. De AI leest grondig, redeneert stap voor stap, en levert onderbouwde scores met verifieerbare feedback. U behoudt altijd de controle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

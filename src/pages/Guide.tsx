import { BookOpen, Brain, ShieldCheck, Sparkles, Target, AlertTriangle, RotateCcw, MessageSquare, TrendingUp, CheckCircle, X, Users, FileText, BarChart3, Upload, Globe, Lock, Keyboard, Undo2, Share2, Eye, Zap, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
    title: "AI Kwaliteit",
    description:
      "Kies per project de AI-kwaliteit: 'Snel' (snelle beoordeling, geschikt voor de meeste opdrachten), 'Uitgebreid' (grondiger analyse voor complexe opdrachten), of 'Premium' (meest nauwkeurige beoordeling). De technische modelnamen zijn verborgen — u kiest eenvoudig op basis van snelheid vs. diepgang.",
  },
  {
    title: "Onderwijscontext",
    description:
      "Stel per project in welke opleiding en welk type studenten u beoordeelt. De AI past verwachtingsniveau en taal hierop aan. Dit veld wordt gesaniteerd zodat het de AI nooit kan verwarren — leeg laten is altijd veilig.",
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
  {
    title: "AI-chat per project",
    description:
      "Stel vragen over de opdracht, rubric of specifieke studenten via een ingebouwde chatfunctie. De AI heeft volledige context over uw project en geeft direct antwoord.",
  },
  {
    title: "Inklapbare secties",
    description:
      "De projectdetailpagina is opgedeeld in inklapbare secties (Instellingen, Documenten, Studenten) met statusbadges. De inklap-status wordt per project onthouden, zodat u altijd snel bij uw werkgebied bent.",
  },
];

const collaborationFeatures = [
  {
    title: "Moderatie / tweede beoordelaar",
    description:
      "Nodig een collega uit als reviewer of moderator. De reviewer kan per criterium akkoord gaan, scores aanpassen, of opmerkingen toevoegen. U als eigenaar ziet alle review-activiteit en kunt scores definitief maken.",
  },
  {
    title: "Project delen",
    description:
      "Deel een project met collega's zodat zij het studentwerk en de beoordelingen kunnen inzien. U behoudt altijd de eigenaarschap.",
  },
  {
    title: "E-mailnotificaties",
    description:
      "Wanneer een reviewer klaar is met het beoordelen van alle studenten, ontvangt de projecteigenaar automatisch een e-mailnotificatie.",
  },
  {
    title: "Feedback delen met studenten",
    description:
      "Genereer per student een deelbare link naar een feedbackportaal. Studenten kunnen via deze link (zonder account) hun scores, AI-feedback en docentfeedback inzien. Ze kunnen per criterium reageren met 'Eens', 'Oneens' of een vraag stellen. U kunt links individueel of in bulk genereren en toegang per student in- of uitschakelen.",
  },
  {
    title: "Studentreacties",
    description:
      "Bekijk alle reacties van studenten op hun feedback in een overzichtelijk tabblad op de projectpagina, filterbaar per student en criterium. U ontvangt een notificatiebadge wanneer er nieuwe reacties zijn.",
  },
];

const exportFeatures = [
  {
    title: "Excel-rapport",
    description:
      "Exporteer een compleet Excel-bestand met drie tabbladen: Overzicht (scores per student), Feedback (gedetailleerde AI-feedback per student) en Statistieken (gemiddelden, mediaan, standaarddeviatie).",
  },
  {
    title: "PDF-beoordelingsverslag",
    description:
      "Genereer per student een professioneel PDF-verslag met scores, motivatie en feedback. Beschikbaar als individueel bestand of als batch-export in een ZIP-archief.",
  },
  {
    title: "Word-verslag",
    description:
      "Exporteer beoordelingen als professioneel Word-document, geoptimaliseerd voor afdrukken zonder AI-labels of markdown-opmaak.",
  },
];

const analyticsFeatures = [
  {
    title: "Scoreverdelingen",
    description:
      "Bekijk histogrammen van scoreverdelingen, gemiddelden, mediaan, standaarddeviatie, minimum en maximum per project of over alle projecten.",
  },
  {
    title: "AI-betrouwbaarheid",
    description:
      "Overzicht van AI-betrouwbaarheid per criterium en een top-studenten ranglijst.",
  },
  {
    title: "Pedagogische klasinzichten",
    description:
      "De AI analyseert alle feedback over een hele klas (of meerdere projecten) en extraheert terugkerende thema's. Bijvoorbeeld: '7 van de 12 studenten worstelen met reflectieve diepgang' of 'De meeste studenten scoren goed op structuur maar zwak op bronintegratie'. U krijgt kleurgecodeerde prestatiebalken per criterium, uitklapbare citaten uit studentwerk, en concrete pedagogische aanbevelingen.",
  },
];

const plagiarismFeatures = [
  {
    title: "Automatische gelijkenisdetectie",
    description:
      "Na batch-beoordeling vergelijkt het systeem automatisch alle inzendingen binnen een project op tekstovereenkomst. Dit vangt intern kopieergedrag op — de meest voorkomende vorm van academische oneerlijkheid bij verslagen en essays.",
  },
  {
    title: "Twee vergelijkingsmethoden",
    description:
      "Kies tussen TF-IDF (snelle cosinus-gelijkenis) en AI-embeddings (diepere semantische vergelijking), of gebruik beide methoden naast elkaar voor de meest betrouwbare resultaten.",
  },
  {
    title: "Instelbare gevoeligheid",
    description:
      "Stel per project de drempelwaarde in waarboven paren als verdacht worden gemarkeerd. Standaard 70%, aanpasbaar naar uw voorkeur.",
  },
  {
    title: "Visuele resultaten",
    description:
      "Bekijk gemarkeerde paren met gelijkenisscores in een overzichtelijk tabblad. Alleen paren boven de drempel worden als verdacht gemarkeerd.",
  },
];

const productivityFeatures = [
  {
    title: "Score ongedaan maken (Undo)",
    description:
      "Wanneer u een score aanpast en opslaat, verschijnt een zwevende 'Ongedaan maken'-knop linksonder die 10 seconden zichtbaar blijft. U kunt ook Ctrl+Z (of Cmd+Z op Mac) gebruiken om de laatste scorewijziging terug te draaien. De undo-stack onthoudt tot 50 wijzigingen per sessie en toont precies welke score wordt teruggezet.",
  },
  {
    title: "Sneltoetsen",
    description:
      "Versnel uw beoordelingsworkflow met toetsenbordsneltoetsen. Druk op '?' om het volledige overzicht te bekijken. Belangrijke sneltoetsen: Ctrl+S (opslaan), Ctrl+Enter (opslaan & volgende student), Alt+↑/↓ (navigeren tussen studenten), Escape (terug naar project). Op de studentenlijst kunt u met pijltjestoetsen navigeren en Enter drukken om een student te openen.",
  },
  {
    title: "Studentsortering",
    description:
      "Sorteer de studentenlijst op naam, status of score. Gebruik de zoekfunctie om snel een specifieke student te vinden.",
  },
];

const securityFeatures = [
  "Pad-gebaseerde opslagbeveiliging: bestanden zijn alleen toegankelijk voor de eigenaar van het project.",
  "Rate limiting: maximaal 60 AI-beoordelingen per uur per gebruiker om misbruik te voorkomen.",
  "CORS-beveiliging: alleen verzoeken van geautoriseerde domeinen worden geaccepteerd.",
  "Audit trail: elke scorewijziging (door AI, docent of reviewer) wordt gelogd met tijdstip, oude waarde en nieuwe waarde. Undo-acties worden apart geregistreerd.",
  "Row Level Security: alle database-tabellen zijn beveiligd zodat gebruikers alleen hun eigen data kunnen zien.",
  "Projecttoegangscontrole: backend-functies verifiëren dat de gebruiker eigenaar of geaccepteerde reviewer is voordat data wordt verwerkt.",
  "Studentfeedbacklinks: anonieme toegang is beperkt tot uitsluitend de data van de betreffende student, met optie om per student de toegang in of uit te schakelen.",
];

const workflowSteps = [
  {
    step: 1,
    title: "Project aanmaken",
    description:
      "Maak een nieuw project aan via de wizard. Kies een AI-kwaliteitsniveau (Snel, Uitgebreid of Premium), vul optioneel de onderwijscontext in, en doorloop het AI-contextgesprek dat uw project beter leert kennen. U kunt ook direct collega's uitnodigen als reviewer.",
  },
  {
    step: 2,
    title: "Rubric en opdracht uploaden",
    description:
      "Upload de graderingstabel (PDF of Word) en optioneel de opdrachtomschrijving. De AI analyseert automatisch de rubric en extraheert criteria met scoreniveaus.",
  },
  {
    step: 3,
    title: "Studentwerk uploaden",
    description:
      "Upload PDF- of Word-bestanden van studenten. Meerdere bestanden tegelijk uploaden is mogelijk via drag-and-drop.",
  },
  {
    step: 4,
    title: "AI-beoordeling starten",
    description:
      "Start de beoordeling individueel of in batch. De AI doorloopt het tweefase-proces per student. In batchmodus worden meerdere studenten parallel verwerkt met wachtrij-status en voortgangsindicatie inclusief geschatte resterende tijd.",
  },
  {
    step: 5,
    title: "Controleren en bijsturen",
    description:
      "Bekijk de scorekaart per student. Let op scores met lage betrouwbaarheid en validatiewaarschuwingen. Pas scores en feedback aan waar nodig. Gebruik de AI-chat voor vragen over specifieke beoordelingen. Gebruik Ctrl+Z om onbedoelde wijzigingen ongedaan te maken en sneltoetsen (?) om sneller te werken.",
  },
  {
    step: 6,
    title: "Plagiaatcontrole",
    description:
      "Het systeem vergelijkt automatisch alle inzendingen op onderlinge gelijkenis na de batch-analyse. Bekijk de resultaten in het Plagiaatsignaal-tabblad en stel de gevoeligheidsdrempel in.",
  },
  {
    step: 7,
    title: "Review (optioneel)",
    description:
      "Als u een reviewer heeft uitgenodigd, kan deze per criterium scores beoordelen. Na afloop ontvangt u een notificatie en kunt u de review-resultaten verwerken.",
  },
  {
    step: 8,
    title: "Feedback delen met studenten",
    description:
      "Genereer deelbare links zodat studenten hun feedback kunnen inzien en erop kunnen reageren. Kopieer de link en plak deze in een e-mail of uw LMS (Smartschool, Toledo, etc.).",
  },
  {
    step: 9,
    title: "Exporteren en finaliseren",
    description:
      "Exporteer de resultaten als Excel, PDF of Word. Bekijk statistieken en pedagogische klasinzichten in het analytics-dashboard.",
  },
];

export default function Guide() {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10 relative">
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-8 right-4 h-8 w-8"
        onClick={() => navigate(-1)}
      >
        <X className="h-4 w-4" />
      </Button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Handleiding GradeAssist
          </h1>
        </div>
      </div>

      {/* Introduction */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            GradeAssist gebruikt geavanceerde AI-modellen om het werk van studenten te analyseren en te beoordelen op basis van uw graderingstabel. Het systeem leest drie documenten: de graderingstabel (rubric), de opdrachtomschrijving en het ingediende studentwerk (PDF of Word). Vervolgens produceert het per criterium een score met motivatie, gedetailleerde feedback en een betrouwbaarheidsindicatie.
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

      {/* Smart Features */}
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

      {/* Productivity */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Productiviteit</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {productivityFeatures.map((f) => (
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

      {/* Collaboration */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Samenwerking</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {collaborationFeatures.map((f) => (
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

      {/* Plagiarism */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Plagiaatsignaal</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {plagiarismFeatures.map((f) => (
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

      {/* Export */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Exportmogelijkheden</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {exportFeatures.map((f) => (
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

      {/* Analytics */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Analytics dashboard</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {analyticsFeatures.map((f) => (
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

      {/* Validation & Security */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Beveiliging en validatie</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              GradeAssist heeft meerdere beveiligings- en validatielagen ingebouwd:
            </p>
            <ul className="space-y-3">
              {securityFeatures.map((item, i) => (
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

      {/* Supported file types */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Ondersteunde bestandstypen</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              GradeAssist ondersteunt <strong>PDF</strong>, <strong>Word (.docx)</strong> en <strong>Word (.doc)</strong> bestanden voor zowel rubrics, opdrachtomschrijvingen als studentwerk. Bestanden worden veilig opgeslagen en zijn alleen toegankelijk voor de eigenaar en geautoriseerde reviewers.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Closing */}
      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="pt-6">
          <p className="text-sm text-foreground leading-relaxed">
            GradeAssist combineert de analytische kracht van AI met uw professioneel oordeel als docent. De AI leest grondig, redeneert stap voor stap, en levert onderbouwde scores met verifieerbare feedback. U behoudt altijd de controle — van eerste beoordeling tot definitieve export.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

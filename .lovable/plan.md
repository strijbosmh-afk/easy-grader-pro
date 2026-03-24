

## Huiswerk Grading Tool

### Overzicht
Een tool waarmee docenten huiswerkopdrachten van studenten beoordelen met AI-ondersteuning. Geen login vereist, één gebruiker. Data wordt persistent opgeslagen via Lovable Cloud (Supabase).

### Pagina's & Functionaliteit

#### 1. Dashboard (Hoofdpagina)
- Overzicht van alle projecten met naam, aantal studenten, en gemiddelde score
- Knop om nieuw project aan te maken
- Filter/zoek op projectnaam
- Per project een samenvatting (totaalscores, voortgang)

#### 2. Project Aanmaken / Bewerken
- Projectnaam invoeren (achteraf wijzigbaar)
- Upload opdracht-PDF en graderingstabel-PDF
- PDFs worden opgeslagen in Supabase Storage

#### 3. Project Detail Pagina
- **Studenten toevoegen**: Drag & drop zone + bestandskiezer voor student-PDFs
- **Studentenlijst**: Tabel met naam (afgeleid uit bestandsnaam), AI-status, en totaalscore
- **AI Analyse starten**: Per student wordt de PDF geanalyseerd tegen de opdracht en graderingstabel via Lovable AI
- AI geeft suggesties per criterium uit de graderingstabel — docent kan scores aanpassen/bevestigen
- **Projectoverzicht**: Totaaloverzicht van alle studenten met scores per criterium

#### 4. Individuele Scorekaart
- Gedetailleerde weergave per student
- Per criterium uit de graderingstabel: AI-suggestie, eindscore (door docent bevestigd), en opmerkingen
- Mogelijkheid om scores handmatig aan te passen

#### 5. Export
- Export naar Excel (alle studenten in een project, of individueel)
- Export naar PDF (individuele scorekaart)

### Database (Supabase)
- **projects**: id, naam, opdracht_pdf_url, graderingstabel_pdf_url, created_at
- **students**: id, project_id, naam, pdf_url, status (pending/analyzed/graded)
- **grading_criteria**: id, project_id, criterium_naam, max_score, volgorde
- **student_scores**: id, student_id, criterium_id, ai_suggested_score, final_score, opmerkingen

### AI Integratie
- Lovable AI (via edge function) parseert de student-PDF samen met de opdracht en graderingstabel
- Retourneert gesuggereerde scores per criterium + korte onderbouwing
- Docent bevestigt of past scores aan

### UX Details
- Drag & drop upload met voortgangsindicator
- Toast notificaties bij succesvolle uploads en analyses
- Responsive design voor desktop gebruik
- Duidelijke visuele status-indicatoren (pending → analyzing → ready for review → graded)


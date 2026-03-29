
-- AI confidence per score
ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS ai_confidence TEXT;

-- Scoring system summary from rubric parsing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scoring_system_summary TEXT;

-- Education context for adaptive prompting
ALTER TABLE projects ADD COLUMN IF NOT EXISTS education_context TEXT;

-- Store validation warnings per student analysis
ALTER TABLE students ADD COLUMN IF NOT EXISTS ai_validation_warnings JSONB;

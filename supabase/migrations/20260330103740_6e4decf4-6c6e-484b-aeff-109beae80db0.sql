
-- Add similarity threshold to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS similarity_threshold numeric NOT NULL DEFAULT 70;

-- Create plagiarism results table
CREATE TABLE public.plagiarism_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  student_a_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_b_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  similarity_score numeric NOT NULL,
  method text NOT NULL DEFAULT 'tfidf',
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.plagiarism_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage plagiarism results in own projects"
  ON public.plagiarism_results
  FOR ALL
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid() UNION SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_plagiarism_results_project ON public.plagiarism_results(project_id);

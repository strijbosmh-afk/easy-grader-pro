
-- Add user_id to projects (owner)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add rubric_levels JSONB to grading_criteria
ALTER TABLE public.grading_criteria ADD COLUMN IF NOT EXISTS rubric_levels JSONB;

-- Add unique constraint on student_scores for upsert
ALTER TABLE public.student_scores ADD CONSTRAINT student_scores_student_criterium_unique UNIQUE (student_id, criterium_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- Drop ALL old permissive RLS policies
DROP POLICY IF EXISTS "Anyone can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can manage students" ON public.students;
DROP POLICY IF EXISTS "Anyone can manage grading_criteria" ON public.grading_criteria;
DROP POLICY IF EXISTS "Anyone can manage student_scores" ON public.student_scores;

-- Create scoped RLS: projects
CREATE POLICY "Users manage own projects" ON public.projects
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Create scoped RLS: students (via project ownership)
CREATE POLICY "Users manage students in own projects" ON public.students
  FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Create scoped RLS: grading_criteria (via project ownership)
CREATE POLICY "Users manage criteria in own projects" ON public.grading_criteria
  FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Create scoped RLS: student_scores (via student → project ownership)
CREATE POLICY "Users manage scores in own projects" ON public.student_scores
  FOR ALL USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  ) WITH CHECK (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- Create audit log table
CREATE TABLE public.score_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  criterium_id UUID NOT NULL REFERENCES public.grading_criteria(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  old_score NUMERIC,
  new_score NUMERIC,
  old_opmerkingen TEXT,
  new_opmerkingen TEXT,
  change_type TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own audit logs" ON public.score_audit_log
  FOR SELECT USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "System inserts audit logs" ON public.score_audit_log
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_audit_log_student ON public.score_audit_log(student_id);
CREATE INDEX idx_audit_log_created ON public.score_audit_log(created_at DESC);

-- Storage policies for authenticated access
DROP POLICY IF EXISTS "Anyone can read pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete pdfs" ON storage.objects;

CREATE POLICY "Authenticated users can upload pdfs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read own pdfs" ON storage.objects
  FOR SELECT USING (bucket_id = 'pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete own pdfs" ON storage.objects
  FOR DELETE USING (bucket_id = 'pdfs' AND auth.role() = 'authenticated');

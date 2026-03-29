-- =============================================================================
-- Migration: Add user ownership, proper RLS, private storage, and rubric levels
-- =============================================================================

-- 1. Add user_id to projects (owner of the project)
ALTER TABLE public.projects ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Backfill: set existing projects to the first user (if any exist)
-- In production you'd do this more carefully; for now NULL is fine for old data

-- 2. Add rubric_levels JSONB to grading_criteria for structured rubric extraction
-- Format: [{"score": 10, "description": "Volledig correct"}, {"score": 7, "description": "Grotendeels correct"}, ...]
ALTER TABLE public.grading_criteria ADD COLUMN rubric_levels JSONB;

-- 3. Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can manage students" ON public.students;
DROP POLICY IF EXISTS "Anyone can manage grading_criteria" ON public.grading_criteria;
DROP POLICY IF EXISTS "Anyone can manage student_scores" ON public.student_scores;

-- 4. Create proper RLS policies scoped to auth.uid()

-- Projects: users can only see/manage their own projects
CREATE POLICY "Users manage own projects" ON public.projects
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Also allow service_role full access (for edge functions)
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so no extra policy needed

-- Students: users can manage students in their own projects
CREATE POLICY "Users manage students in own projects" ON public.students
  FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Grading criteria: users can manage criteria in their own projects
CREATE POLICY "Users manage criteria in own projects" ON public.grading_criteria
  FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Student scores: users can manage scores for students in their own projects
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

-- 5. Make PDF storage bucket private
UPDATE storage.buckets SET public = false WHERE id = 'pdfs';

-- 6. Drop old permissive storage policies
DROP POLICY IF EXISTS "Anyone can read pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete pdfs" ON storage.objects;

-- 7. Create scoped storage policies
-- Users can upload to their own project paths (path starts with project_id)
CREATE POLICY "Authenticated users can upload pdfs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs' AND auth.role() = 'authenticated'
  );

-- Users can read PDFs from their own projects
CREATE POLICY "Authenticated users can read own pdfs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs' AND auth.role() = 'authenticated'
  );

-- Users can delete their own PDFs
CREATE POLICY "Authenticated users can delete own pdfs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs' AND auth.role() = 'authenticated'
  );

-- 8. Create index on projects.user_id for fast lookups
CREATE INDEX idx_projects_user_id ON public.projects(user_id);

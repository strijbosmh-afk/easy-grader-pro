
-- Allow anonymous SELECT on students via share_token
CREATE POLICY "Public access shared students"
  ON public.students FOR SELECT
  TO anon
  USING (share_enabled = true AND share_token IS NOT NULL);

-- Allow anonymous SELECT on student_scores for shared students
CREATE POLICY "Public access shared student scores"
  ON public.student_scores FOR SELECT
  TO anon
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE share_enabled = true AND share_token IS NOT NULL
    )
  );

-- Allow anonymous SELECT on grading_criteria for shared students' projects
CREATE POLICY "Public access shared student criteria"
  ON public.grading_criteria FOR SELECT
  TO anon
  USING (
    project_id IN (
      SELECT project_id FROM public.students WHERE share_enabled = true AND share_token IS NOT NULL
    )
  );

-- Allow anonymous SELECT on projects for shared students (name only needed)
CREATE POLICY "Public access shared student project"
  ON public.projects FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT project_id FROM public.students WHERE share_enabled = true AND share_token IS NOT NULL
    )
  );

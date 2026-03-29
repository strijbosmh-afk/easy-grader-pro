
-- Allow authenticated users to also see and claim orphaned projects (user_id IS NULL)
-- This is a temporary policy to handle the migration from open access to user-scoped access
DROP POLICY IF EXISTS "Users manage own projects" ON public.projects;
CREATE POLICY "Users manage own projects" ON public.projects
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL) WITH CHECK (user_id = auth.uid());

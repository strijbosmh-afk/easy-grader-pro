
-- Create a security definer function to get collaborator IDs without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.get_collaborator_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pr.reviewer_id FROM project_reviewers pr
    JOIN projects p ON pr.project_id = p.id
    WHERE p.user_id = _user_id
  UNION
  SELECT p.user_id FROM projects p
    JOIN project_reviewers pr ON pr.project_id = p.id
    WHERE pr.reviewer_id = _user_id
  UNION
  SELECT ps.shared_with_user_id FROM project_shares ps
    JOIN projects p ON ps.project_id = p.id
    WHERE p.user_id = _user_id
  UNION
  SELECT p.user_id FROM projects p
    JOIN project_shares ps ON ps.project_id = p.id
    WHERE ps.shared_with_user_id = _user_id
$$;

-- Create a security definer function to get user's own project IDs
CREATE OR REPLACE FUNCTION public.get_user_project_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM projects WHERE user_id = _user_id
$$;

-- Create a security definer function to get shared project IDs
CREATE OR REPLACE FUNCTION public.get_shared_project_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT project_id FROM project_shares WHERE shared_with_user_id = _user_id
$$;

-- Fix profiles: replace collaborator policy with one using the function
DROP POLICY IF EXISTS "Users read collaborator profiles" ON public.profiles;
CREATE POLICY "Users read collaborator profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (id IN (SELECT get_collaborator_ids(auth.uid())));

-- Fix projects: replace policy to avoid querying project_shares with RLS
DROP POLICY IF EXISTS "Users manage own projects" ON public.projects;
CREATE POLICY "Users manage own projects"
ON public.projects FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR user_id IS NULL
  OR id IN (SELECT get_shared_project_ids(auth.uid()))
)
WITH CHECK (user_id = auth.uid());

-- Fix project_shares: use function instead of subquery on projects
DROP POLICY IF EXISTS "Owners manage shares" ON public.project_shares;
CREATE POLICY "Owners manage shares"
ON public.project_shares FOR ALL
TO authenticated
USING (project_id IN (SELECT get_user_project_ids(auth.uid())))
WITH CHECK (project_id IN (SELECT get_user_project_ids(auth.uid())));

-- Fix project_reviewers: use function instead of subquery on projects
DROP POLICY IF EXISTS "Owners manage reviewers" ON public.project_reviewers;
CREATE POLICY "Owners manage reviewers"
ON public.project_reviewers FOR ALL
TO authenticated
USING (project_id IN (SELECT get_user_project_ids(auth.uid())))
WITH CHECK (project_id IN (SELECT get_user_project_ids(auth.uid())));

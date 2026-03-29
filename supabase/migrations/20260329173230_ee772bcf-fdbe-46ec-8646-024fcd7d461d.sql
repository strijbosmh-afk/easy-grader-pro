
CREATE POLICY "Users read collaborator profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT pr.reviewer_id FROM project_reviewers pr
    JOIN projects p ON pr.project_id = p.id
    WHERE p.user_id = auth.uid()
    UNION
    SELECT p.user_id FROM projects p
    JOIN project_reviewers pr ON pr.project_id = p.id
    WHERE pr.reviewer_id = auth.uid()
    UNION
    SELECT ps.shared_with_user_id FROM project_shares ps
    JOIN projects p ON ps.project_id = p.id
    WHERE p.user_id = auth.uid()
    UNION
    SELECT p.user_id FROM projects p
    JOIN project_shares ps ON ps.project_id = p.id
    WHERE ps.shared_with_user_id = auth.uid()
  )
);

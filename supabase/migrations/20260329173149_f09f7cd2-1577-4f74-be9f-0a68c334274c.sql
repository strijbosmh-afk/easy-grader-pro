
DROP POLICY IF EXISTS "Reviewers manage own reviews" ON public.score_reviews;

CREATE POLICY "Reviewers manage own reviews"
ON public.score_reviews
FOR ALL
TO authenticated
USING (
  reviewer_id = auth.uid()
  AND student_score_id IN (
    SELECT ss.id FROM student_scores ss
    JOIN students s ON ss.student_id = s.id
    JOIN project_reviewers pr ON s.project_id = pr.project_id
    WHERE pr.reviewer_id = auth.uid() AND pr.status = 'accepted'
  )
)
WITH CHECK (
  reviewer_id = auth.uid()
  AND student_score_id IN (
    SELECT ss.id FROM student_scores ss
    JOIN students s ON ss.student_id = s.id
    JOIN project_reviewers pr ON s.project_id = pr.project_id
    WHERE pr.reviewer_id = auth.uid() AND pr.status = 'accepted'
  )
);

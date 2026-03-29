
-- New table: project_reviewers
CREATE TABLE public.project_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'reviewer',
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (project_id, reviewer_id)
);
ALTER TABLE public.project_reviewers ENABLE ROW LEVEL SECURITY;

-- Owner can manage reviewers for their projects
CREATE POLICY "Owners manage reviewers" ON public.project_reviewers
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Reviewers can see their own invitations
CREATE POLICY "Reviewers see own invitations" ON public.project_reviewers
  FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid());

-- Reviewers can update their own invitation (accept/decline)
CREATE POLICY "Reviewers update own invitation" ON public.project_reviewers
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- New table: score_reviews
CREATE TABLE public.score_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_score_id uuid NOT NULL REFERENCES public.student_scores(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  original_score numeric,
  adjusted_score numeric,
  comment text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.score_reviews ENABLE ROW LEVEL SECURITY;

-- Reviewers can manage reviews for projects they're invited to
CREATE POLICY "Reviewers manage own reviews" ON public.score_reviews
  FOR ALL TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- Owners can read reviews for their projects
CREATE POLICY "Owners read reviews" ON public.score_reviews
  FOR SELECT TO authenticated
  USING (
    student_score_id IN (
      SELECT ss.id FROM student_scores ss
      JOIN students s ON ss.student_id = s.id
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- Add review_status to student_scores
ALTER TABLE public.student_scores ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed';

-- Trigger to notify reviewer when invited
CREATE OR REPLACE FUNCTION public.notify_reviewer_invited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_name text;
  inviter_name text;
BEGIN
  SELECT naam INTO project_name FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE(display_name, email, 'Iemand') INTO inviter_name
    FROM profiles WHERE id = (SELECT user_id FROM projects WHERE id = NEW.project_id);

  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.reviewer_id,
    'reviewer_invited',
    'Review uitnodiging',
    inviter_name || ' nodigt je uit om "' || project_name || '" te reviewen',
    '/project/' || NEW.project_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_reviewer_invited
  AFTER INSERT ON public.project_reviewers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_reviewer_invited();

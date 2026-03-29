-- Audit log for tracking score changes
CREATE TABLE public.score_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  criterium_id UUID NOT NULL REFERENCES public.grading_criteria(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  old_score NUMERIC,
  new_score NUMERIC,
  old_opmerkingen TEXT,
  new_opmerkingen TEXT,
  change_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ai_analysis' | 'finalization'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs for their own projects
CREATE POLICY "Users view own audit logs" ON public.score_audit_log
  FOR SELECT USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- Only service role (edge functions) can insert audit logs
-- The anon/authenticated key can only SELECT
CREATE POLICY "Service role inserts audit logs" ON public.score_audit_log
  FOR INSERT WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_audit_log_student ON public.score_audit_log(student_id);
CREATE INDEX idx_audit_log_created ON public.score_audit_log(created_at DESC);


DROP POLICY IF EXISTS "System inserts audit logs" ON public.score_audit_log;
DROP POLICY IF EXISTS "Service role inserts audit logs" ON public.score_audit_log;

CREATE POLICY "Users insert own audit entries"
ON public.score_audit_log FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

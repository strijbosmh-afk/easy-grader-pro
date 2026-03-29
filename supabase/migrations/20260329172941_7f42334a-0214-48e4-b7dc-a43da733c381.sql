
CREATE TABLE IF NOT EXISTS public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage"
ON public.api_usage FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service inserts usage"
ON public.api_usage FOR INSERT
WITH CHECK (true);

CREATE INDEX idx_api_usage_user_time ON public.api_usage(user_id, created_at);

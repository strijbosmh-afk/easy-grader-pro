-- Make PDF bucket private
UPDATE storage.buckets SET public = false WHERE id = 'pdfs';

-- Drop old permissive storage policies if they exist
DROP POLICY IF EXISTS "Anyone can read pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete pdfs" ON storage.objects;

-- Create authenticated-only storage policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload pdfs' AND tablename = 'objects') THEN
    CREATE POLICY "Authenticated users can upload pdfs" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'pdfs' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read own pdfs' AND tablename = 'objects') THEN
    CREATE POLICY "Authenticated users can read own pdfs" ON storage.objects
      FOR SELECT USING (bucket_id = 'pdfs' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can delete own pdfs' AND tablename = 'objects') THEN
    CREATE POLICY "Authenticated users can delete own pdfs" ON storage.objects
      FOR DELETE USING (bucket_id = 'pdfs' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_student ON public.score_audit_log(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.score_audit_log(created_at DESC);
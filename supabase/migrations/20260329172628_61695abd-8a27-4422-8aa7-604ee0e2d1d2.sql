
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can read PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own PDFs" ON storage.objects;

-- New path-based policies
CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read own PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] IN (
      SELECT p.id::text FROM projects p
      JOIN project_shares ps ON ps.project_id = p.id
      WHERE ps.shared_with_user_id = auth.uid()
    )
    OR (storage.foldername(name))[2] IN (
      SELECT p.id::text FROM projects p
      JOIN project_reviewers pr ON pr.project_id = p.id
      WHERE pr.reviewer_id = auth.uid() AND pr.status = 'accepted'
    )
  )
);

CREATE POLICY "Users delete own PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

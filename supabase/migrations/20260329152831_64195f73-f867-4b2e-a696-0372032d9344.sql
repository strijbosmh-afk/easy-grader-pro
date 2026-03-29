
-- Add archived column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS projects_archived_idx ON projects(archived);

-- Create project_shares table for sharing projects between users
CREATE TABLE IF NOT EXISTS project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS project_shares_user_idx ON project_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS project_shares_project_idx ON project_shares(project_id);

ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares
CREATE POLICY "Owners manage shares" ON project_shares
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Shared users can see their shares
CREATE POLICY "Users see own shares" ON project_shares
  FOR SELECT USING (shared_with_user_id = auth.uid());

-- Update projects RLS to include shared projects
DROP POLICY IF EXISTS "Users manage own projects" ON projects;

CREATE POLICY "Users manage own projects" ON projects
  FOR ALL USING (
    (user_id = auth.uid()) OR (user_id IS NULL) OR
    (id IN (SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid()))
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- Update students RLS to include shared projects
DROP POLICY IF EXISTS "Users manage students in own projects" ON students;

CREATE POLICY "Users manage students in own projects" ON students
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid()
    )
  ) WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid() AND permission = 'edit'
    )
  );

-- Update grading_criteria RLS to include shared projects
DROP POLICY IF EXISTS "Users manage criteria in own projects" ON grading_criteria;

CREATE POLICY "Users manage criteria in own projects" ON grading_criteria
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid()
    )
  ) WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM project_shares WHERE shared_with_user_id = auth.uid() AND permission = 'edit'
    )
  );

-- Update student_scores RLS to include shared projects
DROP POLICY IF EXISTS "Users manage scores in own projects" ON student_scores;

CREATE POLICY "Users manage scores in own projects" ON student_scores
  FOR ALL USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
      UNION
      SELECT s.id FROM students s
      JOIN project_shares ps ON s.project_id = ps.project_id
      WHERE ps.shared_with_user_id = auth.uid()
    )
  ) WITH CHECK (
    student_id IN (
      SELECT s.id FROM students s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
      UNION
      SELECT s.id FROM students s
      JOIN project_shares ps ON s.project_id = ps.project_id
      WHERE ps.shared_with_user_id = auth.uid() AND ps.permission = 'edit'
    )
  );

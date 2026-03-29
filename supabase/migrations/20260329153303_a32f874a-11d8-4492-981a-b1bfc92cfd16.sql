
-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'project_shared',
  title text NOT NULL,
  message text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Allow system/service role to insert
CREATE POLICY "System inserts notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Trigger function to create notification on project share
CREATE OR REPLACE FUNCTION notify_project_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_name text;
  sharer_name text;
BEGIN
  SELECT naam INTO project_name FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE(display_name, email, 'Iemand') INTO sharer_name
    FROM profiles WHERE id = (SELECT user_id FROM projects WHERE id = NEW.project_id);

  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.shared_with_user_id,
    'project_shared',
    'Project gedeeld',
    sharer_name || ' heeft "' || project_name || '" met je gedeeld',
    '/project/' || NEW.project_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_project_shared
  AFTER INSERT ON project_shares
  FOR EACH ROW EXECUTE FUNCTION notify_project_shared();

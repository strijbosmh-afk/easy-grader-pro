
-- Add share columns to students
ALTER TABLE public.students
  ADD COLUMN share_token uuid UNIQUE DEFAULT NULL,
  ADD COLUMN share_enabled boolean NOT NULL DEFAULT false;

-- Create reaction type enum
CREATE TYPE public.student_reaction_type AS ENUM ('agree', 'disagree', 'question');

-- Create student_reactions table
CREATE TABLE public.student_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.grading_criteria(id) ON DELETE CASCADE,
  reaction_type public.student_reaction_type NOT NULL,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_reactions ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert via share token (no auth needed for students)
CREATE POLICY "Anyone can insert reactions for shared students"
  ON public.student_reactions FOR INSERT
  TO public
  WITH CHECK (
    student_id IN (
      SELECT id FROM public.students WHERE share_enabled = true AND share_token IS NOT NULL
    )
  );

CREATE POLICY "Anyone can read reactions for shared students"
  ON public.student_reactions FOR SELECT
  TO public
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE share_enabled = true AND share_token IS NOT NULL
    )
  );

-- Project owners can also manage reactions
CREATE POLICY "Owners manage reactions"
  ON public.student_reactions FOR ALL
  TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT s.id FROM students s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );


-- Create status enum
CREATE TYPE public.student_status AS ENUM ('pending', 'analyzing', 'reviewed', 'graded');

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  opdracht_pdf_url TEXT,
  graderingstabel_pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- Students table
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  pdf_url TEXT,
  status public.student_status NOT NULL DEFAULT 'pending',
  ai_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage students" ON public.students FOR ALL USING (true) WITH CHECK (true);

-- Grading criteria table
CREATE TABLE public.grading_criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  criterium_naam TEXT NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 10,
  volgorde INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.grading_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage grading_criteria" ON public.grading_criteria FOR ALL USING (true) WITH CHECK (true);

-- Student scores table
CREATE TABLE public.student_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  criterium_id UUID NOT NULL REFERENCES public.grading_criteria(id) ON DELETE CASCADE,
  ai_suggested_score NUMERIC,
  final_score NUMERIC,
  ai_motivatie TEXT,
  opmerkingen TEXT,
  UNIQUE(student_id, criterium_id)
);

ALTER TABLE public.student_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage student_scores" ON public.student_scores FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', true);

CREATE POLICY "Anyone can read pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
CREATE POLICY "Anyone can upload pdfs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pdfs');
CREATE POLICY "Anyone can delete pdfs" ON storage.objects FOR DELETE USING (bucket_id = 'pdfs');

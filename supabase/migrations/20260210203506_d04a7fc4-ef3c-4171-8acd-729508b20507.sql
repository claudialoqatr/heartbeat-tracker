
-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Selectors table (CSS selectors per domain for the Tampermonkey script)
CREATE TABLE public.selectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  title_selector TEXT NOT NULL,
  doc_id_source TEXT NOT NULL DEFAULT 'url',
  doc_id_pattern TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents table (maps doc IDs/URLs to projects)
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_identifier TEXT NOT NULL UNIQUE,
  title TEXT,
  domain TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  auto_tagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Heartbeats table (one row per active minute)
CREATE TABLE public.heartbeats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_heartbeats_recorded_at ON public.heartbeats(recorded_at);
CREATE INDEX idx_heartbeats_document_id ON public.heartbeats(document_id);
CREATE INDEX idx_documents_project_id ON public.documents(project_id);
CREATE INDEX idx_documents_doc_identifier ON public.documents(doc_identifier);

-- Enable RLS (open policies since no auth)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;

-- Open RLS policies (no auth, small team with shared access)
CREATE POLICY "Allow all access to projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to selectors" ON public.selectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to heartbeats" ON public.heartbeats FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-tagger trigger: when a document is inserted, try to match its title to project keywords
CREATE OR REPLACE FUNCTION public.auto_tag_document()
RETURNS TRIGGER AS $$
DECLARE
  matched_project_id UUID;
BEGIN
  IF NEW.project_id IS NULL AND NEW.title IS NOT NULL THEN
    SELECT p.id INTO matched_project_id
    FROM public.projects p
    WHERE EXISTS (
      SELECT 1 FROM unnest(p.keywords) AS kw
      WHERE lower(NEW.title) LIKE '%' || lower(kw) || '%'
    )
    LIMIT 1;
    
    IF matched_project_id IS NOT NULL THEN
      NEW.project_id := matched_project_id;
      NEW.auto_tagged := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER auto_tag_document_trigger BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.auto_tag_document();

-- Seed default selectors for supported domains
INSERT INTO public.selectors (domain, title_selector, doc_id_source, doc_id_pattern) VALUES
  ('docs.google.com', '.docs-title-input', 'url', '/document/d/([^/]+)'),
  ('meet.google.com', '[data-meeting-title]', 'url', '/([a-z]{3}-[a-z]{4}-[a-z]{3})'),
  ('chatgpt.com', 'nav [data-testid="chat-title"]', 'url', '/c/([^/?]+)'),
  ('gemini.google.com', 'h1.conversation-title', 'url', '/app/([^/?]+)');


-- daily_stats table
CREATE TABLE public.daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  domain text NOT NULL,
  total_minutes integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, document_id, date)
);

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User daily_stats" ON public.daily_stats
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Combined analytics view
CREATE OR REPLACE VIEW public.combined_analytics AS
  SELECT
    h.user_id,
    h.document_id,
    d.project_id,
    h.domain,
    DATE(h.recorded_at) AS date,
    COUNT(*)::integer AS total_minutes
  FROM public.heartbeats h
  LEFT JOIN public.documents d ON d.id = h.document_id
  WHERE h.recorded_at >= CURRENT_DATE - INTERVAL '31 days'
  GROUP BY h.user_id, h.document_id, d.project_id, h.domain, DATE(h.recorded_at)

  UNION ALL

  SELECT
    user_id,
    document_id,
    project_id,
    domain,
    date,
    total_minutes
  FROM public.daily_stats;

-- Rollup function
CREATE OR REPLACE FUNCTION public.perform_31day_rollup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date timestamptz := CURRENT_DATE - INTERVAL '31 days';
BEGIN
  INSERT INTO daily_stats (user_id, document_id, project_id, domain, date, total_minutes)
  SELECT
    h.user_id,
    h.document_id,
    d.project_id,
    h.domain,
    DATE(h.recorded_at),
    COUNT(*)::integer
  FROM heartbeats h
  LEFT JOIN documents d ON d.id = h.document_id
  WHERE h.recorded_at < cutoff_date
    AND h.user_id IS NOT NULL
  GROUP BY h.user_id, h.document_id, d.project_id, h.domain, DATE(h.recorded_at)
  ON CONFLICT (user_id, document_id, date)
  DO UPDATE SET total_minutes = daily_stats.total_minutes + EXCLUDED.total_minutes;

  DELETE FROM heartbeats WHERE recorded_at < cutoff_date AND user_id IS NOT NULL;
END;
$$;

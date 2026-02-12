
-- Recreate view as SECURITY INVOKER (default) to resolve linter warning
CREATE OR REPLACE VIEW public.combined_analytics WITH (security_invoker = true) AS
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

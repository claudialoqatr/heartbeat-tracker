
CREATE OR REPLACE FUNCTION public.perform_31day_rollup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date timestamptz := CURRENT_DATE - INTERVAL '31 days';
BEGIN
  INSERT INTO daily_stats (user_id, document_id, project_id, domain, date, total_minutes)
  SELECT
    h.user_id,
    h.document_id,
    MAX(d.project_id),
    MAX(h.domain),
    DATE(h.recorded_at),
    COUNT(*)::integer
  FROM heartbeats h
  LEFT JOIN documents d ON d.id = h.document_id
  WHERE h.recorded_at < cutoff_date
    AND h.user_id IS NOT NULL
  GROUP BY h.user_id, h.document_id, DATE(h.recorded_at)
  ON CONFLICT (user_id, document_id, date)
  DO UPDATE SET total_minutes = daily_stats.total_minutes + EXCLUDED.total_minutes;

  DELETE FROM heartbeats WHERE recorded_at < cutoff_date AND user_id IS NOT NULL;
END;
$function$;

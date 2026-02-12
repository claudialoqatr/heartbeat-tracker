

## 31-Day Heartbeat Aggregation and Data Retention

### Overview

Implement a data retention strategy that rolls up raw heartbeats older than 31 days into daily summaries, preserving full analytics accuracy while reducing storage growth over time.

### How It Works

Raw heartbeats accumulate at ~1 row per minute of activity. After 31 days, a nightly job aggregates them into one row per user/document/day in a `daily_stats` table, then deletes the originals. A database view (`combined_analytics`) merges both sources so the frontend sees one seamless dataset.

### Changes

**1. Database Migration**

- Create `daily_stats` table with columns: `id`, `date`, `user_id`, `document_id`, `project_id` (nullable), `domain`, `total_minutes`
- Add a unique constraint on `(user_id, document_id, date)` for safe upserts
- Enable RLS on `daily_stats` with the same `auth.uid() = user_id` policy
- Create the `combined_analytics` view using `UNION ALL`:
  - Recent data: counts from `heartbeats` grouped by user, document, project, domain, date (last 31 days)
  - Historical data: rows from `daily_stats` (older than 31 days)
- Create a `perform_31day_rollup()` function (SECURITY DEFINER) that in a single transaction:
  1. Aggregates heartbeats older than 31 days into `daily_stats` via `INSERT ... ON CONFLICT DO UPDATE`
  2. Deletes only the successfully aggregated heartbeats
- Schedule the rollup nightly at 2:00 AM UTC using `pg_cron` + `pg_net`

**2. Frontend Updates**

- **Index.tsx (Dashboard)**: "Active Today" and "Heartbeats Today" keep querying raw `heartbeats` (current-day data is always raw). No change needed for these cards.
- **FocusScore.tsx**: Currently only shows today's hourly breakdown from raw heartbeats. No change needed (today's data is always raw).
- **Reports.tsx**: Update to query `combined_analytics` view instead of raw `heartbeats` when the selected date range extends beyond 31 days. This ensures monthly reports show the full picture.
- **ProjectDetail.tsx**: Update heartbeat queries to use `combined_analytics` view so that the 30d/90d preset filters work correctly with historical data.

**3. Pages That Do NOT Change**

- **Unallocated.tsx**: Queries `documents` table only, no heartbeat dependency.
- **Projects.tsx**: Queries `projects` table only.
- **Setup.tsx / Auth.tsx**: No analytics queries.

### Technical Details

**Migration SQL:**

```text
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
  -- Recent raw heartbeats (last 31 days), counted per day
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

  -- Historical aggregated data
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
  -- Aggregate old heartbeats into daily_stats
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

  -- Delete the rolled-up heartbeats
  DELETE FROM heartbeats WHERE recorded_at < cutoff_date AND user_id IS NOT NULL;
END;
$$;
```

**Cron scheduling** (executed via SQL insert tool, not migration):

```text
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule nightly at 2:00 AM UTC
SELECT cron.schedule(
  'nightly-heartbeat-rollup',
  '0 2 * * *',
  $$SELECT public.perform_31day_rollup()$$
);
```

**Frontend query changes:**

- Reports.tsx and ProjectDetail.tsx will query the `combined_analytics` view via Supabase client: `supabase.from("combined_analytics").select(...)` with the same filters currently used on heartbeats.
- The view returns the same shape: `user_id`, `document_id`, `project_id`, `domain`, `date`, `total_minutes` -- so chart logic just sums `total_minutes` instead of counting rows.
- FocusScore.tsx and Index.tsx continue querying raw `heartbeats` for today's data (unchanged).


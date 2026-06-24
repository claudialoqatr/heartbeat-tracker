## Goal
Schedule the existing `nightly-rollup` edge function to run automatically every night at 00:00 SAST, so heartbeats older than 31 days are rolled into `daily_stats` without losing reporting accuracy.

## What stays accurate
- Hours per document are preserved. `perform_31day_rollup()` aggregates old raw heartbeats into `daily_stats` (one row per user + document + day, with `total_minutes`).
- Reports use the `combined_analytics` view, which unions the last 31 days of raw `heartbeats` with older `daily_stats` rows, so totals remain exact.
- No UI changes and no manual trigger button are needed.

## Implementation steps

1. **Enable required extensions**
   - Enable `pg_cron` and `pg_net` extensions on the database. These power the scheduled HTTP call.

2. **Create the scheduled job**
   - Use `cron.schedule()` with `net.http_post()` to call `https://frbbhhwzmrbznpjjhytm.supabase.co/functions/v1/nightly-rollup`.
   - Schedule: `0 22 * * *` UTC (00:00 SAST, UTC+2).
   - Name the job `nightly-rollup-daily`.
   - Pass headers `Content-Type: application/json` and the project's anon API key.
   - Run this SQL via the Supabase insert tool (not a migration), because it contains project-specific URL and key.

3. **Verify the job is registered**
   - Query `cron.job` to confirm the schedule exists and has the expected run time.
   - The next automatic run will confirm the function is invoked.

## Out of scope
- No manual "Run rollup now" button in the app.
- No changes to the rollup logic, reports, or analytics view.

## Risk / note
The first nightly run processes heartbeats older than 31 days. If there is a large backlog, the initial run may take longer than subsequent daily runs; after that, each run handles about one day's worth of newly-aged-out data.
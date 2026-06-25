## Goal
Make adding a row to the `selectors` table actually start tracking that domain — no code edits needed.

## Why it's broken today
1. The Tampermonkey script has a hardcoded `@match` list in `src/pages/Setup.tsx`. Tampermonkey only injects the script on listed domains, so a DB-only addition does nothing on the new site.
2. The selector lookup in `log-heartbeat` filters by `user_id` when an API key is present. A row inserted with `user_id = NULL` is invisible to authenticated calls.

## Changes

### 1. Selector fetch — global fallback
Edit `supabase/functions/log-heartbeat/index.ts` GET branch:
- Query selectors for the domain matching either the user's `user_id` OR `user_id IS NULL`.
- Prefer the user-specific row if both exist; otherwise return the global row.

### 2. Dynamic `@match` list in the userscript
Edit `src/pages/Setup.tsx`:
- Fetch all distinct domains from the `selectors` table (user's own + global rows) via the existing `useQuery`.
- Generate the `// @match https://<domain>/*` block dynamically inside the script template string, replacing the hardcoded list.
- Keep `*.lovable.app` and any baseline matches that aren't necessarily in the selectors table.
- The "Copy script" / install flow stays the same — the displayed script body simply includes the current domain set.

### 3. Setup Guide copy update
Short note on the Setup page explaining:
- Adding a row in `selectors` (domain + title_selector + optional doc_id_pattern/url_template) automatically extends the script's `@match` list.
- After adding a domain, **reinstall the userscript** (Tampermonkey caches the `@match` header at install time — DB changes alone won't re-grant page access on already-installed scripts).
- Global selectors (`user_id` NULL) apply to everyone; user-specific selectors override them.

## Out of scope
- No selector management UI (you're inserting via DB directly, as today).
- No change to heartbeat POST logic, rollup, or schema.

## Verification
- Insert a selector row for a new domain, reinstall the script, load the page, confirm a heartbeat is written and the selector's title/doc_id rules are applied.

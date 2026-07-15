## Goal
Fix silent heartbeat failures on `docs.google.com/spreadsheets/...` (and any other compound-path selector like `docs.google.com/document`) and surface real HTTP errors from the userscript so we stop guessing.

## Root causes
1. **Compound-domain selectors don't match at runtime.** The userscript uses `window.location.hostname` (`docs.google.com`) as its `domain` for both the selector GET and the heartbeat POST, but the `selectors` table stores `docs.google.com/spreadsheets` and `docs.google.com/document`. Result: no selector is found, doc_identifier degrades to the raw pathname, and Sheets/Docs/Slides all collapse under `docs.google.com`.
2. **Fire-and-forget POST hides errors.** `GM_xmlhttpRequest` is dispatched without `onload`/`onerror`, and `console.log('Heartbeat sent…')` runs unconditionally. Any 4xx (identity mismatch, missing field) or 5xx looks identical to success in the console — which is exactly what the user is seeing now.

## Changes

### 1. `src/pages/Setup.tsx` — compute compound domain in the userscript
Inside `buildScript()`:
- Replace the single `const domain = window.location.hostname` with a resolver that picks the longest matching selector domain for the current page:
  ```js
  const HOST = window.location.hostname;
  const PATH = window.location.pathname;
  const KNOWN_DOMAINS = ${JSON.stringify(domains)}; // injected at build time
  function resolveDomain() {
    const candidates = KNOWN_DOMAINS
      .filter(d => d === HOST || d.startsWith(HOST + '/'))
      .filter(d => d === HOST || PATH.startsWith('/' + d.slice(HOST.length + 1)))
      .sort((a, b) => b.length - a.length);
    return candidates[0] || HOST;
  }
  const domain = resolveDomain();
  ```
- The list of known domains is already available on the page via the `selectors` query; pass it into `buildScript(domains)` (already done for `@match`) and reuse it here.
- Both the selector GET (`?domain=` + domain) and the heartbeat POST (`{ domain, … }`) then send `docs.google.com/spreadsheets` on Sheets URLs.

### 2. `src/pages/Setup.tsx` — attach `onload` / `onerror` to the heartbeat POST
Rewrite the `try { GM_xmlhttpRequest({…}) }` block so:
- `lastSent = now` and the success `console.log('[TimeTracker] Heartbeat sent …')` fire **only** inside `onload` when `status >= 200 && status < 300`.
- Non-2xx responses log `console.warn('[TimeTracker] Heartbeat rejected', status, responseText)` and do NOT advance `lastSent` (so we retry on next tick).
- `onerror` / `ontimeout` log `console.error('[TimeTracker] Heartbeat network error', …)`.
- Bump script version to `v2.2` in the `@version` header and the loaded-banner `console.log`.

### 3. Setup page copy — reinstall reminder for compound domains
Add one line to the existing yellow reinstall notice: "If you added a compound-path selector (e.g. `docs.google.com/spreadsheets`), reinstall the script so the new domain resolver ships to Tampermonkey."

## Out of scope
- No changes to `log-heartbeat`, RLS, schema, or `selectors` rows.
- No new UI for adding selectors; DB inserts stay the workflow.
- No change to activity/idle detection or the 60s cooldown.

## Verification
1. Copy the v2.2 script, reinstall in Tampermonkey.
2. Open the failing Sheets URL. Console should now show `Heartbeat script v2.2 loaded for docs.google.com/spreadsheets`.
3. Watch the console at the next 30s tick: either a real `Heartbeat sent for … (docs.google.com/spreadsheets)` after a 200, or a specific `Heartbeat rejected 4xx …` telling us the true failure (identity mismatch, etc.) which we can then address.
4. Confirm a new row lands in `heartbeats` with `domain = 'docs.google.com/spreadsheets'` and a document row keyed by the Sheets `/d/{id}` doc_identifier.
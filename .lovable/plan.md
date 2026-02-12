

## URL Template Support for Selectors

### Context

The `documents.url` column and direct `window.location.href` capture are already implemented. This plan adds a `url_template` column to `selectors` so URLs can be reconstructed from extracted `doc_identifier` values -- useful as a fallback and for cleaner, canonical URLs.

### Changes

**1. Database Migration**

Add `url_template` (text, nullable) to the `selectors` table, then update existing rows:

| Domain | url_template |
|---|---|
| docs.google.com | `https://docs.google.com/document/d/{id}` |
| gemini.google.com | `https://gemini.google.com/app/{id}` |
| chatgpt.com | `https://chatgpt.com/c/{id}` |
| meet.google.com | `https://meet.google.com/{id}` |
| figma.com | `https://www.figma.com/file/{id}` |
| github.com | `https://github.com/{id}` |
| mail.google.com | `https://mail.google.com/mail/#inbox/{id}` |

Note: Google Sheets and Slides share the `docs.google.com` domain with Docs. Since there is only one selector row per domain, the current template will default to the Docs pattern. The direct `window.location.href` (already captured) will always be the accurate URL for Sheets/Slides documents.

**2. Tampermonkey Script Update (src/pages/Setup.tsx)**

After fetching the selector and extracting `doc_identifier`, add logic to build a `finalUrl`:

- If the selector has a `url_template`, replace `{id}` with the extracted `doc_identifier`.
- Otherwise, fall back to `window.location.href` (current behavior).
- Send `finalUrl` as the `url` field in the heartbeat payload.

**3. Edge Function (supabase/functions/log-heartbeat/index.ts)**

Already handles `url` in the upsert -- no changes needed.

**4. UI (Unallocated, ProjectDetail, Reports)**

Clickable document titles are already implemented on Unallocated and ProjectDetail. Will also check and update the Reports page if document titles appear there.

### Technical Details

- Migration SQL:
  ```
  ALTER TABLE public.selectors ADD COLUMN url_template text;
  UPDATE selectors SET url_template = 'https://docs.google.com/document/d/{id}' WHERE domain = 'docs.google.com';
  UPDATE selectors SET url_template = 'https://gemini.google.com/app/{id}' WHERE domain = 'gemini.google.com';
  UPDATE selectors SET url_template = 'https://chatgpt.com/c/{id}' WHERE domain = 'chatgpt.com';
  UPDATE selectors SET url_template = 'https://meet.google.com/{id}' WHERE domain = 'meet.google.com';
  UPDATE selectors SET url_template = 'https://www.figma.com/file/{id}' WHERE domain = 'figma.com';
  UPDATE selectors SET url_template = 'https://github.com/{id}' WHERE domain = 'github.com';
  UPDATE selectors SET url_template = 'https://mail.google.com/mail/#inbox/{id}' WHERE domain = 'mail.google.com';
  ```

- Tampermonkey script addition (after `getTitle`):
  ```javascript
  function buildUrl(selector, docId) {
    if (selector?.url_template) {
      return selector.url_template.replace('{id}', docId);
    }
    return window.location.href;
  }
  ```
  Then in `sendHeartbeat`: `const url = buildUrl(selector, doc_identifier);`

- The GET endpoint in `log-heartbeat` already returns the full selector row, so `url_template` will automatically be included in the response -- no edge function changes needed.


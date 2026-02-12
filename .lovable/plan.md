

## Identity-Verified Heartbeat Security Handshake

### Overview

Add an email-matching layer so that heartbeats are only accepted when the Google account active in the browser matches the email on file for the API key owner. This prevents misattributed time tracking if someone uses a shared machine or switches Google accounts.

### Changes

**1. Database Migration**

- Add an `email` column (text, nullable, unique) to the `profiles` table.
- Create a trigger `on_auth_user_sync_email` on `auth.users` that copies `email` into `profiles.email` on INSERT and UPDATE.
- Backfill existing profiles from `auth.users`.
- Update `get_user_id_by_api_key` to accept `(_key uuid, _email text)` and match both `api_key` and `LOWER(email)`.

```text
-- Add email column
ALTER TABLE public.profiles ADD COLUMN email text UNIQUE;

-- Backfill from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id;

-- Trigger to keep in sync
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_sync_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Updated lookup function
CREATE OR REPLACE FUNCTION public.get_user_id_by_api_key(_key uuid, _email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.profiles
  WHERE api_key = _key AND LOWER(email) = LOWER(_email)
  LIMIT 1;
$$;
```

**2. Edge Function Update (`supabase/functions/log-heartbeat/index.ts`)**

- On POST requests, extract `email` from the JSON body alongside existing fields.
- Change the user lookup query to match both `api_key` and `LOWER(email)`.
- If no match is found, return `403 Forbidden` with `{"error": "Identity mismatch. Heartbeat rejected."}`.
- GET requests (selector fetch) remain unchanged -- no email required.

**3. Tampermonkey Script Update (`TAMPERMONKEY_SCRIPT` in `src/pages/Setup.tsx`)**

- Add a `getActiveUserEmail()` helper that tries these selectors in order:
  1. GSuite: `a[href^="https://accounts.google.com/SignOutOptions"] div:last-child`
  2. Fallback: `.gb_d.gb_wa.gb_A`
  3. Gemini: profile menu selector
  4. Returns `null` if none found, with a console warning.
- Update `sendHeartbeat()` to include `email: getActiveUserEmail()` in the POST payload.
- If email is null, log a warning and skip the heartbeat (it would be rejected anyway).
- Bump script version to 1.2.

**4. Setup Page UI (`src/pages/Setup.tsx`)**

- Add a "Troubleshooting" card after the "Test Connection" card explaining:
  - The tracker only records time when the active Google account matches the signup email.
  - Common causes of failures (wrong Google account, incognito mode, Google UI changes breaking selectors).
- Update the "Test Connection" button to include the logged-in user's email in the test payload (sourced from `user.email`).

### Technical Details

**Edge function change summary:**

The POST handler currently does:
1. Look up `userId` by `api_key` alone
2. Parse body for `doc_identifier`, `title`, `domain`, `url`
3. Upsert document, insert heartbeat

It will change to:
1. Parse body (now also includes `email`)
2. Look up `userId` by `api_key` AND `email` match
3. If no match -> 403
4. Otherwise proceed as before

**Tampermonkey `getActiveUserEmail()` function:**

```text
function getActiveUserEmail() {
  // GSuite primary
  const gsuite = document.querySelector(
    'a[href^="https://accounts.google.com/SignOutOptions"] div:last-child'
  );
  if (gsuite?.innerText?.includes('@')) return gsuite.innerText.trim();

  // GSuite fallback
  const fallback = document.querySelector('.gb_d.gb_wa.gb_A');
  if (fallback?.innerText?.includes('@')) return fallback.innerText.trim();

  // Gemini profile
  const gemini = document.querySelector('[data-email]');
  if (gemini) return gemini.getAttribute('data-email');

  console.warn('[TimeTracker] Could not detect Google account email.');
  return null;
}
```

**Files modified:**

| File | Change |
|---|---|
| Database migration (new) | Add `email` column, trigger, update function |
| `supabase/functions/log-heartbeat/index.ts` | Add email validation on POST |
| `src/pages/Setup.tsx` | Add `getActiveUserEmail()` to script, add troubleshooting card, update test button |




## Authentication and User-Scoped Data

### Overview

Add email/password authentication with API key-based access for the Tampermonkey script. All data becomes user-scoped so each user only sees their own tracked time.

### Changes

**1. Database Migration**

- Create a `profiles` table with `id` (FK to auth.users), `api_key` (unique, auto-generated UUID), and `created_at`
- Add `user_id` (uuid, nullable initially) column to `documents`, `heartbeats`, `projects`, and `selectors`
- Create a trigger to auto-create a profile with a generated API key when a user signs up
- Create a security definer function `get_user_id_by_api_key(text)` that looks up the user_id from profiles by api_key (used by the edge function)
- Drop existing permissive RLS policies and replace with proper user-scoped policies:
  - `documents`: SELECT/INSERT/UPDATE/DELETE WHERE `auth.uid() = user_id`
  - `heartbeats`: SELECT/DELETE WHERE `auth.uid() = user_id`; INSERT handled by edge function
  - `projects`: full CRUD WHERE `auth.uid() = user_id`
  - `selectors`: full CRUD WHERE `auth.uid() = user_id`
  - `profiles`: users can only read their own profile
- Note: `user_id` starts nullable to preserve existing data. New records will always have it set.

**2. Auth Page (`src/pages/Auth.tsx`)**

- New page at `/auth` with Login, Sign Up, and Forgot Password tabs/forms
- Uses `supabase.auth.signInWithPassword`, `supabase.auth.signUp`, `supabase.auth.resetPasswordForEmail`
- Clean card-based UI consistent with existing design

**3. Auth Context (`src/hooks/useAuth.tsx`)**

- React context providing `user`, `session`, `loading`, `signOut`
- Uses `onAuthStateChange` listener (set up before `getSession`)
- Wraps the app in `App.tsx`

**4. Route Protection (`src/components/DashboardLayout.tsx`)**

- Check auth state; if not authenticated, redirect to `/auth`
- Show loading spinner while session is being resolved

**5. Edge Function Update (`supabase/functions/log-heartbeat/index.ts`)**

- On POST: read `x-api-key` header
- Look up the user by API key using a query to the `profiles` table
- Attach the resolved `user_id` to both the document upsert and heartbeat insert
- On GET (selector fetch): also validate `x-api-key` and scope to user's selectors

**6. Setup Page Update (`src/pages/Setup.tsx`)**

- Fetch and display the logged-in user's API key from the `profiles` table
- Update the Tampermonkey script template to include `'x-api-key': API_KEY` in all `GM_xmlhttpRequest` headers
- Add a placeholder `const API_KEY = 'YOUR_API_KEY';` at the top of the script

**7. Sidebar Update (`src/components/AppSidebar.tsx`)**

- Add a sign-out button at the bottom of the sidebar

**8. All Query Pages (Index, Projects, ProjectDetail, Unallocated, FocusScore, Reports)**

- No code changes needed -- RLS will automatically scope queries to the authenticated user's data via `auth.uid() = user_id`

### Technical Details

Migration SQL (single migration):

```text
-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security definer for API key lookup (used by edge function)
CREATE OR REPLACE FUNCTION public.get_user_id_by_api_key(_key uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE api_key = _key LIMIT 1;
$$;

-- Add user_id to existing tables
ALTER TABLE public.documents ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.heartbeats ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.selectors ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old permissive policies
DROP POLICY "Allow all access to documents" ON public.documents;
DROP POLICY "Allow all access to heartbeats" ON public.heartbeats;
DROP POLICY "Allow all access to projects" ON public.projects;
DROP POLICY "Allow all access to selectors" ON public.selectors;

-- New RLS policies
CREATE POLICY "User documents" ON public.documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User heartbeats" ON public.heartbeats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User selectors" ON public.selectors FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS, so the edge function (using service role key) can insert with any user_id
```

Edge function auth flow:

```text
POST /log-heartbeat
  -> Read x-api-key header
  -> Call profiles table with service role: SELECT id FROM profiles WHERE api_key = key
  -> If no match, return 401
  -> Upsert document with user_id
  -> Insert heartbeat with user_id
```

Tampermonkey script header additions:

```text
const API_KEY = 'YOUR_API_KEY';  // replaced by Setup page

// In GM_xmlhttpRequest headers:
headers: {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'x-api-key': API_KEY,
}
```

Frontend mutations (Projects, Selectors, etc.) will include `user_id` automatically via the authenticated session -- RLS uses `auth.uid()` so the client just needs to be logged in. For inserts, `user_id` must be set explicitly in the insert payload (e.g., `user_id: session.user.id`).


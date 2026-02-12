
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
DROP POLICY IF EXISTS "Allow all access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow all access to heartbeats" ON public.heartbeats;
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all access to selectors" ON public.selectors;

-- New RLS policies
CREATE POLICY "User documents" ON public.documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User heartbeats" ON public.heartbeats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User selectors" ON public.selectors FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

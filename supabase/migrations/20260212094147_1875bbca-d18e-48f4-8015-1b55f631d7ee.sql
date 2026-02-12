
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

-- Updated lookup function (replaces old single-param version)
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

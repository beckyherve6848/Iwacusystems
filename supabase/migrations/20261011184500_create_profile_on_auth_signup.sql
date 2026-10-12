CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'New user'),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    'tenant',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO public.profiles (id, full_name, email, phone, role, is_active)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'New user'
  ),
  u.email,
  NULLIF(u.raw_user_meta_data ->> 'phone', ''),
  'tenant',
  true
FROM auth.users AS u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = u.id
  );

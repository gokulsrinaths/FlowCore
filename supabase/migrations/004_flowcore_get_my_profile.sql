-- Reliable profile read for the signed-in user (bypasses RLS quirks on public.users).
-- Fixes redirect loops: (app) layout was redirecting to /login when .from("users").select()
-- returned null even after flowcore_ensure_profile() succeeded.

CREATE OR REPLACE FUNCTION public.flowcore_get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(r);
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_get_my_profile() TO authenticated;

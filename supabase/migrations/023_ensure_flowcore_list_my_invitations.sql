-- Ensures flowcore_list_my_invitations() exists for the invitations inbox.
-- If you see PostgREST: "Could not find the function ... without parameters in the schema cache",
-- apply this migration (or full 018+) and/or reload the API schema in the Supabase dashboard.
--
-- Depends on: public._flowcore_sync_invitations_for_user_email (018 or migration 024).

CREATE OR REPLACE FUNCTION public.flowcore_list_my_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_pending jsonb;
  v_accepted jsonb;
  v_rejected jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'pending', '[]'::jsonb,
      'accepted', '[]'::jsonb,
      'rejected', '[]'::jsonb
    );
  END IF;

  PERFORM public._flowcore_sync_invitations_for_user_email(v_uid, v_email);

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'organization_id', i.organization_id,
          'organization_name', coalesce(o.name, ''),
          'case_id', i.case_id,
          'case_title', c.title,
          'role', i.role,
          'invited_by_name', coalesce(u.name, u.email, ''),
          'invited_by_email', coalesce(u.email, ''),
          'email', i.email,
          'created_at', i.created_at,
          'expires_at', i.expires_at,
          'token', i.token,
          'status', i.status
        )
        ORDER BY i.created_at DESC
      )
      FROM public.invitations i
      JOIN public.organizations o ON o.id = i.organization_id
      LEFT JOIN public.cases c ON c.id = i.case_id
      LEFT JOIN public.users u ON u.id = i.invited_by
      WHERE lower(trim(i.email)) = v_email
        AND i.status IN ('invited', 'registered')
        AND i.expires_at > now()
    ),
    '[]'::jsonb
  )
  INTO v_pending;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'organization_id', i.organization_id,
          'organization_name', coalesce(o.name, ''),
          'case_id', i.case_id,
          'case_title', c.title,
          'role', i.role,
          'invited_by_name', coalesce(u.name, u.email, ''),
          'invited_by_email', coalesce(u.email, ''),
          'email', i.email,
          'created_at', i.created_at,
          'expires_at', i.expires_at,
          'token', i.token,
          'status', i.status
        )
        ORDER BY i.accepted_at DESC NULLS LAST, i.created_at DESC
      )
      FROM public.invitations i
      JOIN public.organizations o ON o.id = i.organization_id
      LEFT JOIN public.cases c ON c.id = i.case_id
      LEFT JOIN public.users u ON u.id = i.invited_by
      WHERE lower(trim(i.email)) = v_email
        AND i.status = 'accepted'
    ),
    '[]'::jsonb
  )
  INTO v_accepted;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'organization_id', i.organization_id,
          'organization_name', coalesce(o.name, ''),
          'case_id', i.case_id,
          'case_title', c.title,
          'role', i.role,
          'invited_by_name', coalesce(u.name, u.email, ''),
          'invited_by_email', coalesce(u.email, ''),
          'email', i.email,
          'created_at', i.created_at,
          'expires_at', i.expires_at,
          'token', i.token,
          'status', i.status
        )
        ORDER BY i.created_at DESC
      )
      FROM public.invitations i
      JOIN public.organizations o ON o.id = i.organization_id
      LEFT JOIN public.cases c ON c.id = i.case_id
      LEFT JOIN public.users u ON u.id = i.invited_by
      WHERE lower(trim(i.email)) = v_email
        AND i.status = 'rejected'
    ),
    '[]'::jsonb
  )
  INTO v_rejected;

  RETURN jsonb_build_object(
    'ok', true,
    'pending', coalesce(v_pending, '[]'::jsonb),
    'accepted', coalesce(v_accepted, '[]'::jsonb),
    'rejected', coalesce(v_rejected, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_list_my_invitations() TO authenticated;

NOTIFY pgrst, 'reload schema';

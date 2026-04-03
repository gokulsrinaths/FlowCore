-- Public invitation preview by token + clearer activity text for case invites.

-- ---------------------------------------------------------------------------
-- 1. flowcore_get_invitation_preview (anon + authenticated — token is secret)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_get_invitation_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations%ROWTYPE;
  v_org_name text;
  v_case_title text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid token');
  END IF;

  SELECT * INTO inv FROM public.invitations WHERE token = trim(p_token);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Invitation already used',
      'accepted', true
    );
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = inv.organization_id;

  IF inv.case_id IS NOT NULL THEN
    SELECT title INTO v_case_title FROM public.cases WHERE id = inv.case_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_name', coalesce(v_org_name, ''),
    'case_title', v_case_title,
    'email', inv.email,
    'has_case', inv.case_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_get_invitation_preview(text) TO anon;
GRANT EXECUTE ON FUNCTION public.flowcore_get_invitation_preview(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Activity log: "Invitation sent to <email>" (action column)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_case_invitation(
  p_organization_id uuid,
  p_case_id uuid,
  p_email text,
  p_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_case_org uuid;
  v_part_id uuid;
  v_token text;
  v_inv_role text := coalesce(nullif(trim(p_role), ''), 'org_worker');
  v_actor_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid email required');
  END IF;

  IF v_inv_role NOT IN ('org_owner', 'org_admin', 'org_manager', 'org_worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid invite role');
  END IF;

  SELECT organization_id INTO v_case_org FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
  END IF;
  IF v_case_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
  END IF;

  SELECT lower(trim(email)) INTO v_actor_email FROM auth.users WHERE id = v_uid;
  IF v_actor_email IS NOT NULL AND v_actor_email = v_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot invite your own email');
  END IF;

  SELECT id INTO v_part_id
  FROM public.case_participants
  WHERE case_id = p_case_id
    AND organization_id = p_organization_id
    AND type = 'external'
    AND lower(trim(email)) = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.case_participants (
      organization_id, case_id, user_id, email, type, role, created_by
    )
    VALUES (
      p_organization_id,
      p_case_id,
      NULL,
      v_email,
      'external',
      'external',
      v_uid
    )
    RETURNING id INTO v_part_id;
  END IF;

  DELETE FROM public.invitations
  WHERE organization_id = p_organization_id
    AND case_id IS NOT DISTINCT FROM p_case_id
    AND lower(trim(email)) = v_email
    AND accepted_at IS NULL;

  v_token := substring(
    md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text)
    from 1 for 48
  );

  INSERT INTO public.invitations (
    organization_id,
    email,
    role,
    token,
    invited_by,
    expires_at,
    case_id,
    participant_id
  )
  VALUES (
    p_organization_id,
    v_email,
    v_inv_role,
    v_token,
    v_uid,
    now() + interval '14 days',
    p_case_id,
    v_part_id
  );

  INSERT INTO public.activity_logs (
    item_id, user_id, action, old_value, new_value, organization_id, case_id
  )
  VALUES (
    NULL,
    v_uid,
    'Invitation sent to ' || v_email,
    NULL,
    NULL,
    p_organization_id,
    p_case_id
  );

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'participant_id', v_part_id::text);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A pending invite already exists for this email on this case');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

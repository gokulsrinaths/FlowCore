-- User onboarding columns, case-linked invitations, and RPCs for profile completion,
-- case invitations, and auto-accept on login (email match).

-- ---------------------------------------------------------------------------
-- 1. users: department, description, onboarding_completed (name already exists)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Grandfather existing accounts so only new signups see profile onboarding.
UPDATE public.users SET onboarding_completed = true WHERE onboarding_completed = false;

-- ---------------------------------------------------------------------------
-- 2. invitations: optional case + participant link (case invites)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_id uuid REFERENCES public.case_participants (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_case ON public.invitations (case_id)
  WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_participant ON public.invitations (participant_id)
  WHERE participant_id IS NOT NULL;

-- One pending org-wide invite per org + email (case_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_invitations_pending_org_email
  ON public.invitations (organization_id, lower(trim(email)))
  WHERE accepted_at IS NULL AND case_id IS NULL;

-- One pending case invite per org + case + email
CREATE UNIQUE INDEX IF NOT EXISTS ux_invitations_pending_case_email
  ON public.invitations (organization_id, case_id, lower(trim(email)))
  WHERE accepted_at IS NULL AND case_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Helper: merge case-invitation participant row when user accepts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_merge_case_invitation_participant(
  p_organization_id uuid,
  p_case_id uuid,
  p_participant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_org_role text;
  v_pr text;
BEGIN
  SELECT cp.id INTO v_existing
  FROM public.case_participants cp
  WHERE cp.case_id = p_case_id
    AND cp.user_id = p_user_id
    AND cp.type = 'internal'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.items
    SET assigned_participant_id = v_existing
    WHERE assigned_participant_id = p_participant_id
      AND organization_id = p_organization_id;

    DELETE FROM public.case_participants WHERE id = p_participant_id;
    RETURN;
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, p_user_id);
  v_pr := public.flowcore_org_role_to_participant_role(v_org_role);

  UPDATE public.case_participants
  SET
    user_id = p_user_id,
    email = NULL,
    type = 'internal',
    role = v_pr
  WHERE id = p_participant_id
    AND case_id = p_case_id
    AND organization_id = p_organization_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. flowcore_complete_onboarding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_complete_onboarding(
  p_name text,
  p_department text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.users
  SET
    name = nullif(trim(p_name), ''),
    department = nullif(trim(p_department), ''),
    description = nullif(trim(p_description), ''),
    onboarding_completed = true
  WHERE id = v_uid;

  SELECT m.organization_id INTO v_org
  FROM public.organization_members m
  WHERE m.user_id = v_uid
  ORDER BY m.organization_id
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      item_id, user_id, action, old_value, new_value, organization_id, case_id
    )
    VALUES (
      NULL,
      v_uid,
      'Onboarding completed',
      NULL,
      coalesce(nullif(trim(p_name), ''), 'profile'),
      v_org,
      NULL
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. flowcore_create_case_invitation
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
    'Invitation sent',
    NULL,
    v_email,
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

-- ---------------------------------------------------------------------------
-- 6. flowcore_accept_pending_invitations (call after login / signup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_accept_pending_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations%ROWTYPE;
  n int := 0;
  v_added_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', true, 'accepted', 0);
  END IF;

  FOR inv IN
    SELECT *
    FROM public.invitations
    WHERE lower(trim(email)) = v_email
      AND accepted_at IS NULL
      AND expires_at > now()
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = inv.organization_id AND m.user_id = v_uid
    ) THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (inv.organization_id, v_uid, inv.role);
    END IF;

    IF inv.case_id IS NOT NULL AND inv.participant_id IS NOT NULL THEN
      PERFORM public.flowcore_merge_case_invitation_participant(
        inv.organization_id,
        inv.case_id,
        inv.participant_id,
        v_uid
      );

      INSERT INTO public.activity_logs (
        item_id, user_id, action, old_value, new_value, organization_id, case_id
      )
      VALUES (
        NULL,
        v_uid,
        'User joined case',
        NULL,
        v_email,
        inv.organization_id,
        inv.case_id
      );

      INSERT INTO public.activity_logs (
        item_id, user_id, action, old_value, new_value, organization_id, case_id
      )
      VALUES (
        NULL,
        v_uid,
        'Invitation accepted',
        NULL,
        v_email,
        inv.organization_id,
        inv.case_id
      );
    ELSIF v_added_member THEN
      INSERT INTO public.activity_logs (
        item_id, user_id, action, old_value, new_value, organization_id, case_id
      )
      VALUES (
        NULL,
        v_uid,
        'Invitation accepted',
        NULL,
        v_email,
        inv.organization_id,
        NULL
      );
    END IF;

    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'accepted', n);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Replace flowcore_accept_invitation: handle case-linked invites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not found');
  END IF;

  SELECT * INTO inv
  FROM public.invitations
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in with the invited email address');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = inv.organization_id AND user_id = v_uid
  ) THEN
    IF inv.case_id IS NOT NULL AND inv.participant_id IS NOT NULL THEN
      PERFORM public.flowcore_merge_case_invitation_participant(
        inv.organization_id,
        inv.case_id,
        inv.participant_id,
        v_uid
      );

      INSERT INTO public.activity_logs (
        item_id, user_id, action, old_value, new_value, organization_id, case_id
      )
      VALUES (
        NULL,
        v_uid,
        'User joined case',
        NULL,
        lower(trim(v_email)),
        inv.organization_id,
        inv.case_id
      );

      INSERT INTO public.activity_logs (
        item_id, user_id, action, old_value, new_value, organization_id, case_id
      )
      VALUES (
        NULL,
        v_uid,
        'Invitation accepted',
        NULL,
        lower(trim(v_email)),
        inv.organization_id,
        inv.case_id
      );
    END IF;

    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
    RETURN jsonb_build_object(
      'ok',
      true,
      'organization_id',
      inv.organization_id::text,
      'slug',
      (SELECT slug FROM public.organizations WHERE id = inv.organization_id)
    );
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, v_uid, inv.role);

  IF inv.case_id IS NOT NULL AND inv.participant_id IS NOT NULL THEN
    PERFORM public.flowcore_merge_case_invitation_participant(
      inv.organization_id,
      inv.case_id,
      inv.participant_id,
      v_uid
    );

    INSERT INTO public.activity_logs (
      item_id, user_id, action, old_value, new_value, organization_id, case_id
    )
    VALUES (
      NULL,
      v_uid,
      'User joined case',
      NULL,
      lower(trim(v_email)),
      inv.organization_id,
      inv.case_id
    );

    INSERT INTO public.activity_logs (
      item_id, user_id, action, old_value, new_value, organization_id, case_id
    )
    VALUES (
      NULL,
      v_uid,
      'Invitation accepted',
      NULL,
      lower(trim(v_email)),
      inv.organization_id,
      inv.case_id
    );
  ELSE
    INSERT INTO public.activity_logs (
      item_id, user_id, action, old_value, new_value, organization_id, case_id
    )
    VALUES (
      NULL,
      v_uid,
      'Invitation accepted',
      NULL,
      lower(trim(v_email)),
      inv.organization_id,
      NULL
    );
  END IF;

  UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok',
    true,
    'organization_id',
    inv.organization_id::text,
    'slug',
    (SELECT slug FROM public.organizations WHERE id = inv.organization_id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. flowcore_list_case_participants: department + invite status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_case_participants(
  p_organization_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_j jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = p_case_id AND c.organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
  END IF;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cp.id,
          'case_id', cp.case_id,
          'organization_id', cp.organization_id,
          'user_id', cp.user_id,
          'email', cp.email,
          'type', cp.type,
          'role', cp.role,
          'user_name', u.name,
          'user_email', u.email,
          'department', u.department,
          'invited',
          EXISTS (
            SELECT 1 FROM public.invitations inv
            WHERE inv.participant_id = cp.id
              AND inv.accepted_at IS NULL
              AND inv.expires_at > now()
          )
        )
        ORDER BY cp.created_at
      )
      FROM public.case_participants cp
      LEFT JOIN public.users u ON u.id = cp.user_id
      WHERE cp.case_id = p_case_id AND cp.organization_id = p_organization_id
    ),
    '[]'::jsonb
  )
  INTO v_j;

  RETURN jsonb_build_object('ok', true, 'participants', v_j);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_complete_onboarding(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_case_invitation(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_accept_pending_invitations() TO authenticated;

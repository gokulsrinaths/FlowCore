-- Invitation lifecycle: invited | registered | accepted | rejected — in-app only (no email).
-- Migrates pending → invited, adds registration sync + participant linking, accept/reject guards,
-- assignment guard for open invites, list/count RPC updates, merge idempotency fix.

-- ---------------------------------------------------------------------------
-- 1. Status values + indexes
-- ---------------------------------------------------------------------------
UPDATE public.invitations
SET status = 'invited'
WHERE status = 'pending';

ALTER TABLE public.invitations
  ALTER COLUMN status SET DEFAULT 'invited';

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_status_check;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('invited', 'registered', 'accepted', 'rejected'));

DROP INDEX IF EXISTS ux_invitations_pending_org_email;
DROP INDEX IF EXISTS ux_invitations_pending_case_email;

CREATE UNIQUE INDEX ux_invitations_pending_org_email
  ON public.invitations (organization_id, lower(trim(email)))
  WHERE status IN ('invited', 'registered') AND case_id IS NULL;

CREATE UNIQUE INDEX ux_invitations_pending_case_email
  ON public.invitations (organization_id, case_id, lower(trim(email)))
  WHERE status IN ('invited', 'registered') AND case_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Merge participant: idempotent when row already internal + same user
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
    IF v_existing = p_participant_id THEN
      v_org_role := public.flowcore_membership_role(p_organization_id, p_user_id);
      v_pr := public.flowcore_org_role_to_participant_role(v_org_role);
      UPDATE public.case_participants
      SET role = coalesce(v_pr, role)
      WHERE id = p_participant_id
        AND case_id = p_case_id
        AND organization_id = p_organization_id;
      RETURN;
    END IF;

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
-- 3. Sync invited → registered + participant link + notify inviter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._flowcore_sync_invitations_for_user_email(
  p_uid uuid,
  p_email text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  rec RECORD;
  n int := 0;
  v_link text := '/invitations';
  v_invitee text;
BEGIN
  IF p_uid IS NULL OR p_email IS NULL OR trim(p_email) = '' THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT i.*
    FROM public.invitations i
    WHERE lower(trim(i.email)) = lower(trim(p_email))
      AND i.status = 'invited'
    FOR UPDATE OF i
  LOOP
    UPDATE public.invitations
    SET status = 'registered'
    WHERE id = rec.id;

    IF rec.participant_id IS NOT NULL THEN
      UPDATE public.case_participants cp
      SET
        user_id = p_uid,
        email = NULL,
        type = 'internal'
      WHERE cp.id = rec.participant_id
        AND cp.case_id IS NOT DISTINCT FROM rec.case_id
        AND cp.organization_id = rec.organization_id;
    END IF;

    IF rec.invited_by IS NOT NULL THEN
      SELECT coalesce(nullif(trim(u.name), ''), nullif(trim(u.email), ''), trim(rec.email))
      INTO v_invitee
      FROM public.users u
      WHERE u.id = p_uid;

      PERFORM public._flowcore_insert_notification(
        rec.organization_id,
        rec.invited_by,
        coalesce(v_invitee, 'Someone') || ' has registered for your invitation',
        v_link,
        'invitation',
        rec.id
      );
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_mark_invitation_registered()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  n int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;

  n := public._flowcore_sync_invitations_for_user_email(v_uid, v_email);
  RETURN jsonb_build_object('ok', true, 'updated', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Accept body + inviter notification on accept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._flowcore_apply_invitation_accept(
  inv public.invitations,
  v_uid uuid,
  v_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_slug text;
  v_display text;
BEGIN
  IF inv.status IS DISTINCT FROM 'registered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation is not ready to accept');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  SELECT slug INTO v_slug FROM public.organizations WHERE id = inv.organization_id;

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
        'User accepted invitation',
        NULL,
        lower(trim(v_email)),
        inv.organization_id,
        inv.case_id
      );
    END IF;

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;

    IF inv.invited_by IS NOT NULL AND inv.invited_by IS DISTINCT FROM v_uid THEN
      SELECT coalesce(nullif(trim(u.name), ''), nullif(trim(u.email), ''), 'Someone')
      INTO v_display
      FROM public.users u
      WHERE u.id = v_uid;

      PERFORM public._flowcore_insert_notification(
        inv.organization_id,
        inv.invited_by,
        coalesce(v_display, 'Someone') || ' accepted your invitation',
        '/invitations',
        'invitation',
        inv.id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'organization_id', inv.organization_id::text,
      'slug', v_slug
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
      'User accepted invitation',
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
      'User accepted invitation',
      NULL,
      lower(trim(v_email)),
      inv.organization_id,
      NULL
    );
  END IF;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = inv.id;

  IF inv.invited_by IS NOT NULL AND inv.invited_by IS DISTINCT FROM v_uid THEN
    SELECT coalesce(nullif(trim(u.name), ''), nullif(trim(u.email), ''), 'Someone')
    INTO v_display
    FROM public.users u
    WHERE u.id = v_uid;

    PERFORM public._flowcore_insert_notification(
      inv.organization_id,
      inv.invited_by,
      coalesce(v_display, 'Someone') || ' accepted your invitation',
      '/invitations',
      'invitation',
      inv.id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', inv.organization_id::text,
    'slug', v_slug
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Accept by token / id (sync before load)
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

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not found');
  END IF;

  PERFORM public._flowcore_sync_invitations_for_user_email(v_uid, v_email);

  SELECT * INTO inv
  FROM public.invitations
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation was declined');
  END IF;

  IF inv.status = 'accepted' OR inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in with the invited email address');
  END IF;

  RETURN public._flowcore_apply_invitation_accept(inv, v_uid, v_email);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_accept_invitation_by_id(p_invitation_id uuid)
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

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not found');
  END IF;

  PERFORM public._flowcore_sync_invitations_for_user_email(v_uid, v_email);

  SELECT * INTO inv
  FROM public.invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation was declined');
  END IF;

  IF inv.status = 'accepted' OR inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation is for a different email');
  END IF;

  RETURN public._flowcore_apply_invitation_accept(inv, v_uid, v_email);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reject: only registered + email match
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_reject_invitation(p_invitation_id uuid)
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

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not found');
  END IF;

  PERFORM public._flowcore_sync_invitations_for_user_email(v_uid, v_email);

  SELECT * INTO inv
  FROM public.invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.status IS DISTINCT FROM 'registered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only decline when the invitation is ready');
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation is for a different email');
  END IF;

  UPDATE public.invitations SET status = 'rejected' WHERE id = inv.id;

  INSERT INTO public.activity_logs (
    item_id, user_id, action, old_value, new_value, organization_id, case_id
  )
  VALUES (
    NULL,
    v_uid,
    'User rejected invitation',
    NULL,
    lower(trim(v_email)),
    inv.organization_id,
    inv.case_id
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. List all invitation groups for current user (sync first)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flowcore_list_my_pending_invitations();

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

CREATE OR REPLACE FUNCTION public.flowcore_count_my_pending_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', true, 'count', 0);
  END IF;

  PERFORM public._flowcore_sync_invitations_for_user_email(v_uid, v_email);

  SELECT count(*)::int INTO n
  FROM public.invitations i
  WHERE lower(trim(i.email)) = v_email
    AND i.status IN ('invited', 'registered')
    AND i.expires_at > now();

  RETURN jsonb_build_object('ok', true, 'count', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Preview + participants + cancel + create (invited / registered)
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

  IF inv.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation was declined');
  END IF;

  IF inv.status = 'accepted' OR inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Invitation already used',
      'accepted', true
    );
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  IF inv.status NOT IN ('invited', 'registered') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation is not available');
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
          'invite_status',
          (
            SELECT i2.status
            FROM public.invitations i2
            WHERE i2.participant_id = cp.id
            ORDER BY i2.created_at DESC
            LIMIT 1
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

CREATE OR REPLACE FUNCTION public.flowcore_cancel_invitation(
  p_organization_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  DELETE FROM public.invitations
  WHERE id = p_invitation_id
    AND organization_id = p_organization_id
    AND status IN ('invited', 'registered');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_token text;
  v_email text := lower(trim(p_email));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only owners and admins can invite');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid email required');
  END IF;

  IF p_role NOT IN ('org_admin', 'org_manager', 'org_worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid invite role');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u WHERE lower(trim(coalesce(u.email, ''))) = v_email
  ) AND EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.organization_members m ON m.user_id = u.id AND m.organization_id = p_organization_id
    WHERE lower(trim(coalesce(u.email, ''))) = v_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User is already a member');
  END IF;

  DELETE FROM public.invitations
  WHERE organization_id = p_organization_id
    AND lower(trim(email)) = v_email
    AND status IN ('invited', 'registered')
    AND case_id IS NULL;

  v_token := substring(
    md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text)
    from 1 for 48
  );

  INSERT INTO public.invitations (
    organization_id, email, role, token, invited_by, expires_at, status
  )
  VALUES (
    p_organization_id,
    v_email,
    p_role,
    v_token,
    v_uid,
    now() + interval '14 days',
    'invited'
  );

  INSERT INTO public.activity_logs (
    item_id, user_id, action, old_value, new_value, organization_id, case_id
  )
  VALUES (
    NULL,
    v_uid,
    'Invitation created for ' || v_email,
    NULL,
    NULL,
    p_organization_id,
    NULL
  );

  PERFORM public._flowcore_notify_invitee_invitation(p_organization_id, v_email, false, NULL);

  RETURN jsonb_build_object('ok', true, 'token', v_token);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'An open invite may already exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

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
    AND status IN ('invited', 'registered');

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
    participant_id,
    status
  )
  VALUES (
    p_organization_id,
    v_email,
    v_inv_role,
    v_token,
    v_uid,
    now() + interval '14 days',
    p_case_id,
    v_part_id,
    'invited'
  );

  INSERT INTO public.activity_logs (
    item_id, user_id, action, old_value, new_value, organization_id, case_id
  )
  VALUES (
    NULL,
    v_uid,
    'Invitation created for ' || v_email,
    NULL,
    NULL,
    p_organization_id,
    p_case_id
  );

  PERFORM public._flowcore_notify_invitee_invitation(p_organization_id, v_email, true, p_case_id);

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'participant_id', v_part_id::text);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A pending invite already exists for this email on this case');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Assignment: block open invitations (invited or registered) on participant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_assign_item_to_participant(
  p_organization_id uuid,
  p_item_id uuid,
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_wf text;
  v_item_org uuid;
  v_item_case uuid;
  v_prev_user uuid;
  v_prev_part uuid;
  v_part_case uuid;
  v_part_org uuid;
  v_part_email text;
  v_part_user uuid;
  v_part_type text;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
  v_item_title text;
  v_link text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);
  IF v_wf NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can reassign items');
  END IF;

  SELECT assigned_to, assigned_participant_id, organization_id, case_id, title
  INTO v_prev_user, v_prev_part, v_item_org, v_item_case, v_item_title
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF p_participant_id IS NULL THEN
    IF v_prev_user IS NOT NULL THEN
      SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev_user;
    ELSIF v_prev_part IS NOT NULL THEN
      SELECT coalesce(
        (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
        cp.email,
        'External'
      )
      INTO old_label
      FROM public.case_participants cp WHERE cp.id = v_prev_part;
    END IF;

    UPDATE public.items
    SET
      assigned_to = null,
      assigned_participant_id = null,
      escalation_sent_at = null
    WHERE id = p_item_id;

    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (p_item_id, v_uid, 'Assignment', old_label, 'Unassigned', p_organization_id, v_item_case);

    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_item_case IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item must belong to a case to assign a case participant');
  END IF;

  SELECT case_id, organization_id, email, user_id, type
  INTO v_part_case, v_part_org, v_part_email, v_part_user, v_part_type
  FROM public.case_participants
  WHERE id = p_participant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not found');
  END IF;

  IF v_part_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not in this workspace');
  END IF;

  IF v_part_case IS DISTINCT FROM v_item_case THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant does not belong to this item''s case');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE i.participant_id = p_participant_id
      AND i.status IN ('invited', 'registered')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This participant must accept the case invitation before they can be assigned tasks'
    );
  END IF;

  IF v_part_type = 'external' AND v_part_user IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This participant must accept the case invitation before they can be assigned tasks'
    );
  END IF;

  IF v_prev_user IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev_user;
  ELSIF v_prev_part IS NOT NULL THEN
    SELECT coalesce(
      (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
      cp.email,
      'External'
    )
    INTO old_label
    FROM public.case_participants cp WHERE cp.id = v_prev_part;
  END IF;

  IF v_part_user IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = v_part_user;
  ELSE
    new_label := coalesce(v_part_email, 'External');
  END IF;

  IF v_prev_part IS NOT DISTINCT FROM p_participant_id THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.items
  SET
    assigned_to = null,
    assigned_participant_id = p_participant_id,
    escalation_sent_at = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_item_case);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF v_part_user IS NOT NULL AND v_part_user IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_part_user,
      'You were assigned a task: "' || left(coalesce(v_item_title, 'Task'), 200) || '"',
      v_link,
      'assignment',
      p_item_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_mark_invitation_registered() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_my_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_accept_invitation_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_reject_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_count_my_pending_invitations() TO authenticated;

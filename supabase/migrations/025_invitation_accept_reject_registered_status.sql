-- Fix "Invitation is not pending" when rows use invited | registered | accepted | rejected
-- (migration 017 RPCs still expected status = 'pending'). Align accept/reject with 018 lifecycle.
-- Inviter notification uses direct INSERT (base columns) so _flowcore_insert_notification is optional.
--
-- Requires: public._flowcore_sync_invitations_for_user_email (023/024), flowcore_merge_case_invitation_participant (018).

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

      INSERT INTO public.notifications (organization_id, user_id, message, link)
      VALUES (
        inv.organization_id,
        inv.invited_by,
        left(coalesce(v_display, 'Someone') || ' accepted your invitation', 2000),
        '/invitations'
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

    INSERT INTO public.notifications (organization_id, user_id, message, link)
    VALUES (
      inv.organization_id,
      inv.invited_by,
      left(coalesce(v_display, 'Someone') || ' accepted your invitation', 2000),
      '/invitations'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', inv.organization_id::text,
    'slug', v_slug
  );
END;
$$;

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

NOTIFY pgrst, 'reload schema';

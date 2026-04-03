-- Internal helper used by flowcore_list_my_invitations, flowcore_mark_invitation_registered,
-- accept/reject paths, etc. (defined in 018; add here if 018 was skipped on the project.)

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

NOTIFY pgrst, 'reload schema';

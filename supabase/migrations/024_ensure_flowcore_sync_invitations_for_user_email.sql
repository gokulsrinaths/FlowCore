-- Idempotent refresh of _flowcore_sync_invitations_for_user_email (same body as in 023).
-- Uses direct INSERT into notifications (base columns) so it does not depend on
-- _flowcore_insert_notification from migration 013.

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

      INSERT INTO public.notifications (organization_id, user_id, message, link)
      VALUES (
        rec.organization_id,
        rec.invited_by,
        left(coalesce(v_invitee, 'Someone') || ' has registered for your invitation', 2000),
        v_link
      );
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

NOTIFY pgrst, 'reload schema';

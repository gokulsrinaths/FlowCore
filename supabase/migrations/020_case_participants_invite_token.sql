-- Expose latest open-invite token on case participant rows (for mailto / copy link in UI).
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
          ),
          'invite_token',
          (
            SELECT i3.token
            FROM public.invitations i3
            WHERE i3.participant_id = cp.id
              AND i3.status IN ('invited', 'registered')
            ORDER BY i3.created_at DESC
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

-- Case participants (internal users + external emails) and optional item assignment via assigned_participant_id.
-- Extends items without removing assigned_to.

-- ---------------------------------------------------------------------------
-- 1. case_participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,

  user_id uuid REFERENCES public.users (id),
  email text,

  type text NOT NULL CHECK (type IN ('internal', 'external')),
  role text CHECK (role IN ('sp', 'dsp', 'officer', 'external')),

  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT participant_identity_check CHECK (
    (user_id IS NOT NULL AND email IS NULL AND type = 'internal')
    OR (user_id IS NULL AND email IS NOT NULL AND type = 'external')
  )
);

CREATE INDEX IF NOT EXISTS idx_case_participants_case ON public.case_participants (case_id);
CREATE INDEX IF NOT EXISTS idx_case_participants_org ON public.case_participants (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_case_participants_case_user
  ON public.case_participants (case_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_case_participants_case_email_lower
  ON public.case_participants (case_id, lower(trim(email)))
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. items.assigned_participant_id (mutually exclusive with assigned_to for assignment)
-- ---------------------------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS assigned_participant_id uuid REFERENCES public.case_participants (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_assigned_participant ON public.items (assigned_participant_id);

-- Allow both null; forbid both set (assignment target must be at most one)
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_assignment_mutex;
ALTER TABLE public.items
  ADD CONSTRAINT items_assignment_mutex CHECK (
    NOT (assigned_to IS NOT NULL AND assigned_participant_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 3. RLS: case_participants (read org members; writes via RPC only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.case_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_participants_select_member" ON public.case_participants;
DROP POLICY IF EXISTS "case_participants_insert_block" ON public.case_participants;
DROP POLICY IF EXISTS "case_participants_update_block" ON public.case_participants;
DROP POLICY IF EXISTS "case_participants_delete_block" ON public.case_participants;

CREATE POLICY "case_participants_select_member"
  ON public.case_participants FOR SELECT
  TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));

CREATE POLICY "case_participants_insert_block"
  ON public.case_participants FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "case_participants_update_block"
  ON public.case_participants FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "case_participants_delete_block"
  ON public.case_participants FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- 4. Helper: map org membership role → participant role label
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_org_role_to_participant_role(p_org_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_org_role
    WHEN 'org_owner' THEN 'sp'
    WHEN 'org_admin' THEN 'sp'
    WHEN 'org_manager' THEN 'dsp'
    WHEN 'org_worker' THEN 'officer'
    ELSE 'officer'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 5. flowcore_add_case_participant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_add_case_participant(
  p_organization_id uuid,
  p_case_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_case_org uuid;
  v_member_role text;
  v_pr text;
  v_email_norm text;
  v_id uuid;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT organization_id INTO v_case_org FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
  END IF;
  IF v_case_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
  END IF;

  IF (p_user_id IS NOT NULL) = (trim(coalesce(p_email, '')) <> '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Provide either user_id or email, not both');
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF NOT public.flowcore_is_org_member(p_organization_id, p_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'User must be a member of this workspace');
    END IF;
    v_member_role := public.flowcore_membership_role(p_organization_id, p_user_id);
    v_pr := public.flowcore_org_role_to_participant_role(v_member_role);

    INSERT INTO public.case_participants (
      organization_id, case_id, user_id, email, type, role, created_by
    )
    VALUES (
      p_organization_id,
      p_case_id,
      p_user_id,
      NULL,
      'internal',
      v_pr,
      v_uid
    )
    RETURNING id INTO v_id;

    SELECT coalesce(name, email, 'User') INTO v_label FROM public.users WHERE id = p_user_id;

    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (null, v_uid, 'Participant added', null, v_label, p_organization_id, p_case_id);

    RETURN jsonb_build_object('ok', true, 'id', v_id::text);
  END IF;

  v_email_norm := lower(trim(p_email));
  IF v_email_norm = '' OR position('@' IN v_email_norm) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid email is required');
  END IF;

  INSERT INTO public.case_participants (
    organization_id, case_id, user_id, email, type, role, created_by
  )
  VALUES (
    p_organization_id,
    p_case_id,
    NULL,
    v_email_norm,
    'external',
    'external',
    v_uid
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (
    null,
    v_uid,
    'Email added',
    null,
    v_email_norm || coalesce(' — ' || nullif(trim(p_note), ''), ''),
    p_organization_id,
    p_case_id
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant already on this case');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. flowcore_log_requisition_email (Step 4: log “email sent” without second insert)
--     Called after add participant for requisition UX — logs “Email sent to X”
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_log_requisition_email(
  p_organization_id uuid,
  p_case_id uuid,
  p_email text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_em text := lower(trim(p_email));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;
  IF v_em = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email required');
  END IF;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (
    null,
    v_uid,
    'Email sent',
    null,
    'Email sent to ' || v_em || coalesce(' — ' || nullif(trim(p_description), ''), ''),
    p_organization_id,
    p_case_id
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. flowcore_remove_case_participant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_remove_case_participant(
  p_organization_id uuid,
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_case_id uuid;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT case_id, coalesce(
    (SELECT coalesce(u.name, u.email, '') FROM public.users u WHERE u.id = case_participants.user_id),
    case_participants.email,
    ''
  )
  INTO v_case_id, v_label
  FROM public.case_participants
  WHERE id = p_participant_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not found');
  END IF;

  DELETE FROM public.case_participants WHERE id = p_participant_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (null, v_uid, 'Participant removed', v_label, null, p_organization_id, v_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. flowcore_list_case_participants
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
          'user_email', u.email
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
-- 9. flowcore_assign_item_to_participant
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
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
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

  SELECT assigned_to, assigned_participant_id, organization_id, case_id
  INTO v_prev_user, v_prev_part, v_item_org, v_item_case
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
    SET assigned_to = null, assigned_participant_id = null
    WHERE id = p_item_id;

    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (p_item_id, v_uid, 'Assignment', old_label, 'Unassigned', p_organization_id, v_item_case);

    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_item_case IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item must belong to a case to assign a case participant');
  END IF;

  SELECT case_id, organization_id, email, user_id
  INTO v_part_case, v_part_org, v_part_email, v_part_user
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
  SET assigned_to = null, assigned_participant_id = p_participant_id
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_item_case);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Replace flowcore_create_item (add p_assigned_participant_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flowcore_create_item(uuid, text, text, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.flowcore_create_item(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text,
  p_assigned_to uuid,
  p_case_id uuid DEFAULT NULL,
  p_assigned_participant_id uuid DEFAULT NULL
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
  v_id uuid;
  v_case_org uuid;
  v_part_case uuid;
  v_part_org uuid;
  v_part_user uuid;
  v_part_email text;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);
  IF v_wf IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid membership');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_assigned_to IS NOT NULL AND p_assigned_participant_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Assign to either a user or a case participant, not both');
  END IF;

  IF p_case_id IS NOT NULL THEN
    SELECT organization_id INTO v_case_org FROM public.cases WHERE id = p_case_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
    END IF;
    IF v_case_org IS DISTINCT FROM p_organization_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
    END IF;
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF v_wf NOT IN ('admin', 'manager') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
    END IF;
    IF NOT public.flowcore_is_org_member(p_organization_id, p_assigned_to) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a member of this workspace');
    END IF;
  END IF;

  IF p_assigned_participant_id IS NOT NULL THEN
    IF v_wf NOT IN ('admin', 'manager') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
    END IF;
    IF p_case_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Case is required when assigning a case participant');
    END IF;
    SELECT case_id, organization_id, user_id, email
    INTO v_part_case, v_part_org, v_part_user, v_part_email
    FROM public.case_participants
    WHERE id = p_assigned_participant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant not found');
    END IF;
    IF v_part_org IS DISTINCT FROM p_organization_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant not in this workspace');
    END IF;
    IF v_part_case IS DISTINCT FROM p_case_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant does not belong to the selected case');
    END IF;
  END IF;

  INSERT INTO public.items (
    title,
    description,
    type,
    priority,
    status,
    created_by,
    assigned_to,
    assigned_participant_id,
    organization_id,
    case_id
  )
  VALUES (
    trim(p_title),
    nullif(trim(p_description), ''),
    nullif(trim(p_type), ''),
    nullif(trim(p_priority), ''),
    'created',
    v_uid,
    p_assigned_to,
    CASE WHEN p_assigned_participant_id IS NOT NULL THEN p_assigned_participant_id ELSE null END,
    p_organization_id,
    p_case_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (v_id, v_uid, 'Item created', null, trim(p_title), p_organization_id, p_case_id);

  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (
      v_id,
      v_uid,
      'Assignment',
      null,
      (SELECT coalesce(name, email, 'User') FROM public.users WHERE id = p_assigned_to),
      p_organization_id,
      p_case_id
    );
  END IF;

  IF p_assigned_participant_id IS NOT NULL THEN
    IF v_part_user IS NOT NULL THEN
      SELECT coalesce(name, email, 'User') INTO v_label FROM public.users WHERE id = v_part_user;
    ELSE
      v_label := coalesce(v_part_email, 'External');
    END IF;
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (v_id, v_uid, 'Assignment', null, v_label, p_organization_id, p_case_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Replace flowcore_update_item_assignee (clear assigned_participant_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_item_assignee(
  p_organization_id uuid,
  p_item_id uuid,
  p_assignee uuid
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
  v_prev uuid;
  v_prev_part uuid;
  v_item_org uuid;
  v_case_id uuid;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
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

  SELECT assigned_to, assigned_participant_id, organization_id, case_id
  INTO v_prev, v_prev_part, v_item_org, v_case_id
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF p_assignee IS NOT NULL AND NOT public.flowcore_is_org_member(p_organization_id, p_assignee) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a member of this workspace');
  END IF;

  IF v_prev IS NOT DISTINCT FROM p_assignee AND v_prev_part IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_prev IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev;
  ELSIF v_prev_part IS NOT NULL THEN
    SELECT coalesce(
      (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
      cp.email,
      'External'
    )
    INTO old_label
    FROM public.case_participants cp WHERE cp.id = v_prev_part;
  END IF;

  IF p_assignee IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = p_assignee;
  END IF;

  UPDATE public.items
  SET assigned_to = p_assignee, assigned_participant_id = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_add_case_participant(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_log_requisition_email(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_remove_case_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_case_participants(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_assign_item_to_participant(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_item(uuid, text, text, text, text, uuid, uuid, uuid) TO authenticated;

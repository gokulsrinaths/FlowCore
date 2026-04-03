-- Depends on 006: items.case_id + activity_logs.case_id columns exist.

DROP FUNCTION IF EXISTS public.flowcore_create_item(uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.flowcore_create_item(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text,
  p_assigned_to uuid,
  p_case_id uuid DEFAULT NULL
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

  INSERT INTO public.items (
    title,
    description,
    type,
    priority,
    status,
    created_by,
    assigned_to,
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

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_update_item_status(
  p_organization_id uuid,
  p_item_id uuid,
  p_new_status text
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
  v_old text;
  v_item_org uuid;
  v_case_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT status, organization_id, case_id INTO v_old, v_item_org, v_case_id
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_old = p_new_status THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF NOT public.flowcore_can_transition(v_wf, v_old, p_new_status) THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'This role cannot move the item from ' || v_old || ' to ' || p_new_status
    );
  END IF;

  UPDATE public.items SET status = p_new_status WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Status change', v_old, p_new_status, p_organization_id, v_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

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

  SELECT assigned_to, organization_id, case_id INTO v_prev, v_item_org, v_case_id
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

  IF v_prev IS NOT DISTINCT FROM p_assignee THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_prev IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev;
  END IF;
  IF p_assignee IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = p_assignee;
  END IF;

  UPDATE public.items SET assigned_to = p_assignee WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_update_item_details(
  p_organization_id uuid,
  p_item_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text
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
  rec public.items%ROWTYPE;
  v_summary text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT * INTO rec FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF rec.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_wf NOT IN ('admin', 'manager')
     AND rec.created_by IS DISTINCT FROM v_uid
     AND rec.assigned_to IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot edit this item');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  v_summary :=
    'title: ' || coalesce(rec.title, '') || ' → ' || trim(p_title) ||
    '; desc/type/priority updated';

  UPDATE public.items
  SET
    title = trim(p_title),
    description = nullif(trim(p_description), ''),
    type = nullif(trim(p_type), ''),
    priority = nullif(trim(p_priority), '')
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Item updated', 'previous snapshot', v_summary, p_organization_id, rec.case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_delete_item(p_organization_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_wf text;
  v_title text;
  v_created_by uuid;
  v_item_org uuid;
  v_case_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT title, created_by, organization_id, case_id INTO v_title, v_created_by, v_item_org, v_case_id
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_wf IS DISTINCT FROM 'admin' AND v_created_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only admins or the creator can delete this item');
  END IF;

  DELETE FROM public.items WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (null, v_uid, 'Item deleted', v_title, p_item_id::text, p_organization_id, v_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_create_item(uuid, text, text, text, text, uuid, uuid) TO authenticated;

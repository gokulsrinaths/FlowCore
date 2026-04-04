-- Workspace owners and org admins: edit form templates and case records (RPC enforcement).
-- Questionnaires: owners/admins may assign to themselves; others must assign to a teammate.

-- ---------------------------------------------------------------------------
-- flowcore_update_case — org_owner / org_admin only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_case(
  p_organization_id uuid,
  p_case_id uuid,
  p_title text,
  p_crime_number text,
  p_district text,
  p_description text,
  p_accused jsonb,
  p_financial_impact numeric,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_org uuid;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF v_org_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'Only workspace owners and admins can edit case details'
    );
  END IF;

  SELECT organization_id, title INTO v_org, v_title
  FROM public.cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
  END IF;

  IF v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case name is required');
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'active', 'under_investigation', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid case status');
  END IF;

  UPDATE public.cases
  SET
    title = trim(p_title),
    crime_number = nullif(trim(p_crime_number), ''),
    district = nullif(trim(p_district), ''),
    description = nullif(trim(p_description), ''),
    accused = p_accused,
    financial_impact = p_financial_impact,
    status = coalesce(nullif(trim(p_status), ''), status),
    updated_at = now()
  WHERE id = p_case_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (null, v_uid, 'Case updated', v_title, trim(p_title), p_organization_id, p_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- Form templates — org_owner / org_admin only (create / update / delete)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_form_template(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'Only workspace owners and admins can create forms'
    );
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fields must be a JSON array');
  END IF;

  INSERT INTO public.form_templates (
    organization_id,
    title,
    description,
    fields,
    created_by
  )
  VALUES (
    p_organization_id,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_fields,
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_update_form_template(
  p_organization_id uuid,
  p_form_id uuid,
  p_title text,
  p_description text,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'Only workspace owners and admins can edit forms'
    );
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fields must be a JSON array');
  END IF;

  UPDATE public.form_templates
  SET
    title = trim(p_title),
    description = nullif(trim(coalesce(p_description, '')), ''),
    fields = p_fields,
    updated_at = now()
  WHERE id = p_form_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Form not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_delete_form_template(
  p_organization_id uuid,
  p_form_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'Only workspace owners and admins can delete forms'
    );
  END IF;

  DELETE FROM public.form_templates
  WHERE id = p_form_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Form not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_create_item_questionnaire — admins may assign to self; notify only others
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_item_questionnaire(
  p_organization_id uuid,
  p_item_id uuid,
  p_question_text text,
  p_description text,
  p_assigned_to_user_id uuid,
  p_sort_order int
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
  v_item record;
  v_id uuid;
  v_sort int;
  v_slug text;
  v_msg text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);

  IF p_assigned_to_user_id IS NOT DISTINCT FROM v_uid THEN
    IF v_org_role IS NULL OR v_org_role NOT IN ('org_owner', 'org_admin') THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'Assign the questionnaire to a teammate. Workspace owners and admins may assign to themselves.'
      );
    END IF;
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT i.id, i.organization_id, i.created_by, i.assigned_to, i.status, i.title
  INTO v_item
  FROM public.items i
  WHERE i.id = p_item_id;

  IF NOT FOUND OR v_item.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_wf NOT IN ('admin', 'manager')
     AND v_item.created_by IS DISTINCT FROM v_uid
     AND v_item.assigned_to IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers/admins, creator, or assignee can add questionnaires');
  END IF;

  IF trim(coalesce(p_question_text, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question text is required');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, p_assigned_to_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a workspace member');
  END IF;

  SELECT o.slug INTO v_slug FROM public.organizations o WHERE o.id = p_organization_id;
  IF v_slug IS NULL OR trim(v_slug) = '' THEN
    v_slug := '';
  END IF;

  v_sort := coalesce(p_sort_order, 0);

  INSERT INTO public.item_questionnaires (
    organization_id,
    item_id,
    question_text,
    description,
    assigned_to_user_id,
    sort_order,
    status,
    created_by
  )
  VALUES (
    p_organization_id,
    p_item_id,
    trim(p_question_text),
    nullif(trim(coalesce(p_description, '')), ''),
    p_assigned_to_user_id,
    v_sort,
    'pending_accept',
    v_uid
  )
  RETURNING id INTO v_id;

  PERFORM public.flowcore_refresh_item_workflow_from_questionnaires(p_item_id);

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (p_item_id, v_uid, 'Questionnaire added', null, trim(p_question_text), p_organization_id);

  IF p_assigned_to_user_id IS DISTINCT FROM v_uid THEN
    v_msg := 'New questionnaire on ' || left(trim(coalesce(v_item.title, 'Item')), 80);
    IF length(trim(p_question_text)) > 0 THEN
      v_msg := v_msg || ': ' || left(trim(p_question_text), 100);
    END IF;

    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      p_assigned_to_user_id,
      v_msg,
      CASE
        WHEN v_slug <> '' THEN '/' || v_slug || '/questionnaires'
        ELSE '/questionnaires'
      END,
      'assignment',
      p_item_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
END;
$$;

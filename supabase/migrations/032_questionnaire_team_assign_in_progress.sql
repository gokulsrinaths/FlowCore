-- Questionnaires: assign only to other members; parent item goes to In Progress (not Created)
-- when any questionnaire is pending accept or in progress; notify assignee.

CREATE OR REPLACE FUNCTION public.flowcore_refresh_item_workflow_from_questionnaires(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt int;
  v_new text;
  v_org uuid;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.item_questionnaires WHERE item_id = p_item_id;
  IF v_cnt = 0 THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org FROM public.items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Priority: review > active work > waiting for accept (still "in progress" on the board)
  IF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'under_review'
  ) THEN
    v_new := 'under_review';
  ELSIF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'in_progress'
  ) THEN
    v_new := 'in_progress';
  ELSIF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'pending_accept'
  ) THEN
    v_new := 'in_progress';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status <> 'completed'
  ) THEN
    v_new := 'completed';
  ELSE
    v_new := 'in_progress';
  END IF;

  UPDATE public.items
  SET status = v_new, updated_at = now()
  WHERE id = p_item_id AND organization_id = v_org;
END;
$$;

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

  IF p_assigned_to_user_id IS NOT DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'Assign the questionnaire to another teammate, not yourself'
    );
  END IF;

  v_wf := public.flowcore_org_workflow_role(public.flowcore_membership_role(p_organization_id, v_uid));

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

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
END;
$$;

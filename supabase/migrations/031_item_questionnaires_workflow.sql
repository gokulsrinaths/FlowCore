-- Item-linked questionnaires: assign questions to org members; accept → answer → manager review.
-- Drives item Kanban status when any questionnaire rows exist for that item.

CREATE TABLE IF NOT EXISTS public.item_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items (id) ON DELETE CASCADE,
  question_text text NOT NULL,
  description text,
  assigned_to_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_accept' CHECK (
    status IN ('pending_accept', 'in_progress', 'under_review', 'completed')
  ),
  answer_text text,
  accepted_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_questionnaires_item ON public.item_questionnaires (item_id);
CREATE INDEX IF NOT EXISTS idx_item_questionnaires_org ON public.item_questionnaires (organization_id);
CREATE INDEX IF NOT EXISTS idx_item_questionnaires_assignee ON public.item_questionnaires (organization_id, assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_item_questionnaires_status ON public.item_questionnaires (item_id, status);

ALTER TABLE public.item_questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_questionnaires_select_member" ON public.item_questionnaires;
DROP POLICY IF EXISTS "item_questionnaires_mutate_block" ON public.item_questionnaires;
CREATE POLICY "item_questionnaires_select_member"
  ON public.item_questionnaires FOR SELECT TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));
CREATE POLICY "item_questionnaires_mutate_block"
  ON public.item_questionnaires FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Sync parent item.status from questionnaire states (no-op if no rows).
-- ---------------------------------------------------------------------------
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

  IF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'pending_accept'
  ) THEN
    v_new := 'created';
  ELSIF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'in_progress'
  ) THEN
    v_new := 'in_progress';
  ELSIF EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status = 'under_review'
  ) THEN
    v_new := 'under_review';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id AND status <> 'completed'
  ) THEN
    v_new := 'completed';
  ELSE
    v_new := 'created';
  END IF;

  UPDATE public.items
  SET status = v_new, updated_at = now()
  WHERE id = p_item_id AND organization_id = v_org;
END;
$$;

-- Block manual Kanban status changes when questionnaires drive workflow (admin override).
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT status, organization_id INTO v_old, v_item_org
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF EXISTS (SELECT 1 FROM public.item_questionnaires WHERE item_id = p_item_id) THEN
    IF v_wf IS DISTINCT FROM 'admin' THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'This item''s status follows the questionnaire workflow (accept → submit → review). Admins can still override.'
      );
    END IF;
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

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (p_item_id, v_uid, 'Status change', v_old, p_new_status, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_list_item_questionnaires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_item_questionnaires(
  p_organization_id uuid,
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = p_item_id AND i.organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'questions',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', q.id::text,
            'item_id', q.item_id::text,
            'question_text', q.question_text,
            'description', q.description,
            'assigned_to_user_id', q.assigned_to_user_id::text,
            'sort_order', q.sort_order,
            'status', q.status,
            'answer_text', q.answer_text,
            'accepted_at', q.accepted_at,
            'submitted_at', q.submitted_at,
            'reviewed_at', q.reviewed_at,
            'reviewed_by', CASE WHEN q.reviewed_by IS NULL THEN NULL ELSE q.reviewed_by::text END,
            'created_at', q.created_at,
            'updated_at', q.updated_at
          )
          ORDER BY q.sort_order, q.created_at
        )
        FROM public.item_questionnaires q
        WHERE q.organization_id = p_organization_id AND q.item_id = p_item_id
      ),
      '[]'::jsonb
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_list_my_item_questionnaires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_my_item_questionnaires(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'questions',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', q.id::text,
            'item_id', q.item_id::text,
            'item_title', i.title,
            'case_id', CASE WHEN i.case_id IS NULL THEN NULL ELSE i.case_id::text END,
            'question_text', q.question_text,
            'description', q.description,
            'status', q.status,
            'answer_text', q.answer_text,
            'accepted_at', q.accepted_at,
            'submitted_at', q.submitted_at,
            'updated_at', q.updated_at
          )
          ORDER BY q.updated_at DESC
        )
        FROM public.item_questionnaires q
        INNER JOIN public.items i ON i.id = q.item_id AND i.organization_id = q.organization_id
        WHERE q.organization_id = p_organization_id
          AND q.assigned_to_user_id = v_uid
      ),
      '[]'::jsonb
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_count_my_actionable_item_questionnaires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_count_my_actionable_item_questionnaires(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated', 'count', 0);
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden', 'count', 0);
  END IF;

  SELECT count(*)::int INTO v_n
  FROM public.item_questionnaires
  WHERE organization_id = p_organization_id
    AND assigned_to_user_id = v_uid
    AND status IN ('pending_accept', 'in_progress');

  RETURN jsonb_build_object('ok', true, 'count', v_n);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_create_item_questionnaire
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
  v_wf text;
  v_item record;
  v_id uuid;
  v_sort int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(public.flowcore_membership_role(p_organization_id, v_uid));

  SELECT id, organization_id, created_by, assigned_to, status
  INTO v_item
  FROM public.items
  WHERE id = p_item_id;

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

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_delete_item_questionnaire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_delete_item_questionnaire(
  p_organization_id uuid,
  p_questionnaire_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wf text;
  v_item_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(public.flowcore_membership_role(p_organization_id, v_uid));

  SELECT item_id INTO v_item_id
  FROM public.item_questionnaires
  WHERE id = p_questionnaire_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not found');
  END IF;

  IF v_wf NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can remove questionnaires');
  END IF;

  DELETE FROM public.item_questionnaires WHERE id = p_questionnaire_id;

  PERFORM public.flowcore_refresh_item_workflow_from_questionnaires(v_item_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_accept_item_questionnaire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_accept_item_questionnaire(
  p_organization_id uuid,
  p_questionnaire_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT item_id INTO v_item_id
  FROM public.item_questionnaires
  WHERE id = p_questionnaire_id
    AND organization_id = p_organization_id
    AND assigned_to_user_id = v_uid
    AND status = 'pending_accept'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nothing to accept or not assigned to you');
  END IF;

  UPDATE public.item_questionnaires
  SET
    status = 'in_progress',
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_questionnaire_id;

  PERFORM public.flowcore_refresh_item_workflow_from_questionnaires(v_item_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_submit_item_questionnaire_answer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_submit_item_questionnaire_answer(
  p_organization_id uuid,
  p_questionnaire_id uuid,
  p_answer_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF trim(coalesce(p_answer_text, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Answer is required');
  END IF;

  SELECT item_id INTO v_item_id
  FROM public.item_questionnaires
  WHERE id = p_questionnaire_id
    AND organization_id = p_organization_id
    AND assigned_to_user_id = v_uid
    AND status = 'in_progress'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Submit not allowed (accept first or already submitted)');
  END IF;

  UPDATE public.item_questionnaires
  SET
    status = 'under_review',
    answer_text = trim(p_answer_text),
    submitted_at = now(),
    updated_at = now()
  WHERE id = p_questionnaire_id;

  PERFORM public.flowcore_refresh_item_workflow_from_questionnaires(v_item_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_review_item_questionnaire (manager/admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_review_item_questionnaire(
  p_organization_id uuid,
  p_questionnaire_id uuid,
  p_approve boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wf text;
  v_item_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_wf := public.flowcore_org_workflow_role(public.flowcore_membership_role(p_organization_id, v_uid));
  IF v_wf NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can review');
  END IF;

  SELECT item_id INTO v_item_id
  FROM public.item_questionnaires
  WHERE id = p_questionnaire_id AND organization_id = p_organization_id AND status = 'under_review'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nothing under review');
  END IF;

  IF p_approve THEN
    UPDATE public.item_questionnaires
    SET
      status = 'completed',
      reviewed_at = now(),
      reviewed_by = v_uid,
      updated_at = now()
    WHERE id = p_questionnaire_id;
  ELSE
    UPDATE public.item_questionnaires
    SET
      status = 'in_progress',
      answer_text = null,
      submitted_at = null,
      reviewed_at = null,
      reviewed_by = null,
      updated_at = now()
    WHERE id = p_questionnaire_id;
  END IF;

  PERFORM public.flowcore_refresh_item_workflow_from_questionnaires(v_item_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_list_item_questionnaires(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_my_item_questionnaires(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_count_my_actionable_item_questionnaires(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_item_questionnaire(uuid, uuid, text, text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_item_questionnaire(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_accept_item_questionnaire(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_submit_item_questionnaire_answer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_review_item_questionnaire(uuid, uuid, boolean) TO authenticated;

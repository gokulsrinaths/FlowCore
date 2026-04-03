-- Distributed case questions: assignments, dependencies, answers, case progress flag.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS all_questions_answered boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  question_text text NOT NULL,
  description text,
  assigned_to_participant_id uuid REFERENCES public.case_participants (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'answered')
  ),
  depends_on jsonb,
  order_index int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_questions_case ON public.case_questions (case_id);
CREATE INDEX IF NOT EXISTS idx_case_questions_org ON public.case_questions (organization_id);
CREATE INDEX IF NOT EXISTS idx_case_questions_assigned ON public.case_questions (assigned_to_participant_id);

CREATE TABLE IF NOT EXISTS public.case_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.case_questions (id) ON DELETE CASCADE,
  answered_by uuid REFERENCES public.users (id),
  answer_text text,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_question_answers_q ON public.case_question_answers (question_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.case_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_question_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_questions_select_member" ON public.case_questions;
DROP POLICY IF EXISTS "case_questions_mutate_block" ON public.case_questions;
CREATE POLICY "case_questions_select_member"
  ON public.case_questions FOR SELECT TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));
CREATE POLICY "case_questions_mutate_block"
  ON public.case_questions FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "case_question_answers_select_member" ON public.case_question_answers;
DROP POLICY IF EXISTS "case_question_answers_mutate_block" ON public.case_question_answers;
CREATE POLICY "case_question_answers_select_member"
  ON public.case_question_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.case_questions q
      WHERE q.id = case_question_answers.question_id
        AND public.flowcore_is_org_member(q.organization_id, auth.uid())
    )
  );
CREATE POLICY "case_question_answers_mutate_block"
  ON public.case_question_answers FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_case_question_deps_unlocked(p_q public.case_questions)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(coalesce(p_q.depends_on, '[]'::jsonb)) AS dep(dep_id)
    INNER JOIN public.case_questions dq
      ON dq.id = (dep.dep_id)::uuid
     AND dq.case_id = p_q.case_id
    WHERE dq.status <> 'answered'
  );
$$;

CREATE OR REPLACE FUNCTION public.flowcore_refresh_case_all_questions_answered(p_case_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cases c
  SET all_questions_answered = NOT EXISTS (
    SELECT 1
    FROM public.case_questions cq
    WHERE cq.case_id = p_case_id
      AND cq.status <> 'answered'
  ),
  updated_at = now()
  WHERE c.id = p_case_id;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_list_case_questions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_case_questions(
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
  arr jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF NOT public.flowcore_can_read_case(p_case_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot read case');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'case_id', q.case_id,
        'question_text', q.question_text,
        'description', q.description,
        'assigned_to_participant_id', q.assigned_to_participant_id,
        'status', q.status,
        'depends_on', coalesce(q.depends_on, '[]'::jsonb),
        'order_index', q.order_index,
        'created_at', q.created_at,
        'deps_unlocked', public.flowcore_case_question_deps_unlocked(q),
        'latest_answer', (
          SELECT jsonb_build_object(
            'answer_text', a.answer_text,
            'reasoning', a.reasoning,
            'answered_by', a.answered_by,
            'created_at', a.created_at
          )
          FROM public.case_question_answers a
          WHERE a.question_id = q.id
          ORDER BY a.created_at DESC
          LIMIT 1
        )
      )
      ORDER BY q.order_index, q.created_at
    ),
    '[]'::jsonb
  )
  INTO arr
  FROM public.case_questions q
  WHERE q.case_id = p_case_id
    AND q.organization_id = p_organization_id;

  RETURN jsonb_build_object('ok', true, 'questions', arr);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_create_case_question
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_case_question(
  p_organization_id uuid,
  p_case_id uuid,
  p_question_text text,
  p_description text DEFAULT NULL,
  p_depends_on jsonb DEFAULT '[]'::jsonb,
  p_order_index int DEFAULT NULL,
  p_assigned_to_participant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_dep_id uuid;
  v_next_order int;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT organization_id INTO v_org FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND OR v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not in workspace');
  END IF;

  IF trim(coalesce(p_question_text, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question text is required');
  END IF;

  IF p_depends_on IS NOT NULL AND jsonb_typeof(p_depends_on) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'depends_on must be a JSON array of question ids');
  END IF;

  FOR v_dep_id IN
    SELECT (dep.elem)::uuid
    FROM jsonb_array_elements_text(coalesce(p_depends_on, '[]'::jsonb)) AS dep(elem)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.case_questions cq
      WHERE cq.id = v_dep_id AND cq.case_id = p_case_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Dependency must reference a question in the same case');
    END IF;
  END LOOP;

  IF p_assigned_to_participant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.case_participants cp
      WHERE cp.id = p_assigned_to_participant_id
        AND cp.case_id = p_case_id
        AND cp.organization_id = p_organization_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a participant on this case');
    END IF;
  END IF;

  IF p_order_index IS NULL THEN
    SELECT coalesce(max(order_index), -1) + 1 INTO v_next_order
    FROM public.case_questions WHERE case_id = p_case_id;
  ELSE
    v_next_order := p_order_index;
  END IF;

  INSERT INTO public.case_questions (
    organization_id,
    case_id,
    question_text,
    description,
    assigned_to_participant_id,
    status,
    depends_on,
    order_index,
    created_by
  )
  VALUES (
    p_organization_id,
    p_case_id,
    trim(p_question_text),
    nullif(trim(p_description), ''),
    p_assigned_to_participant_id,
    CASE WHEN p_assigned_to_participant_id IS NOT NULL THEN 'in_progress' ELSE 'pending' END,
    CASE WHEN p_depends_on IS NULL OR p_depends_on = '[]'::jsonb THEN NULL ELSE p_depends_on END,
    v_next_order,
    v_uid
  )
  RETURNING id INTO v_id;

  PERFORM public.flowcore_refresh_case_all_questions_answered(p_case_id);

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_update_case_question
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_case_question(
  p_organization_id uuid,
  p_case_id uuid,
  p_question_id uuid,
  p_question_text text,
  p_description text,
  p_depends_on jsonb,
  p_order_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dep_id uuid;
  st text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT status INTO st
  FROM public.case_questions
  WHERE id = p_question_id AND case_id = p_case_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question not found');
  END IF;

  IF st = 'answered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot edit an answered question');
  END IF;

  IF trim(coalesce(p_question_text, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question text is required');
  END IF;

  IF p_depends_on IS NOT NULL AND jsonb_typeof(p_depends_on) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'depends_on must be a JSON array');
  END IF;

  FOR v_dep_id IN
    SELECT (dep.elem)::uuid
    FROM jsonb_array_elements_text(coalesce(p_depends_on, '[]'::jsonb)) AS dep(elem)
  LOOP
    IF v_dep_id = p_question_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Question cannot depend on itself');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.case_questions cq
      WHERE cq.id = v_dep_id AND cq.case_id = p_case_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid dependency');
    END IF;
  END LOOP;

  UPDATE public.case_questions
  SET
    question_text = trim(p_question_text),
    description = nullif(trim(p_description), ''),
    depends_on = CASE WHEN p_depends_on IS NULL OR p_depends_on = '[]'::jsonb THEN NULL ELSE p_depends_on END,
    order_index = p_order_index
  WHERE id = p_question_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_assign_question (spec name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_assign_question(
  p_organization_id uuid,
  p_case_id uuid,
  p_question_id uuid,
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  st text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT status INTO st FROM public.case_questions
  WHERE id = p_question_id AND case_id = p_case_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question not found');
  END IF;

  IF st = 'answered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot reassign an answered question');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.case_participants cp
    WHERE cp.id = p_participant_id
      AND cp.case_id = p_case_id
      AND cp.organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not on this case');
  END IF;

  UPDATE public.case_questions
  SET
    assigned_to_participant_id = p_participant_id,
    status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END
  WHERE id = p_question_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_reorder_case_questions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_reorder_case_questions(
  p_organization_id uuid,
  p_case_id uuid,
  p_ordered_question_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  i int;
  n int;
  qid uuid;
  cnt int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  n := coalesce(array_length(p_ordered_question_ids, 1), 0);
  IF n = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT count(*)::int INTO cnt FROM public.case_questions
  WHERE case_id = p_case_id AND organization_id = p_organization_id;

  IF cnt <> n THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reorder list must include every question for this case');
  END IF;

  FOR i IN 1..n LOOP
    qid := p_ordered_question_ids[i];
    IF NOT EXISTS (
      SELECT 1 FROM public.case_questions
      WHERE id = qid AND case_id = p_case_id AND organization_id = p_organization_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid question id in order');
    END IF;
  END LOOP;

  FOR i IN 1..n LOOP
    UPDATE public.case_questions
    SET order_index = i - 1
    WHERE id = p_ordered_question_ids[i];
  END LOOP;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_delete_case_question
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_delete_case_question(
  p_organization_id uuid,
  p_case_id uuid,
  p_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  st text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT status INTO st FROM public.case_questions
  WHERE id = p_question_id AND case_id = p_case_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question not found');
  END IF;

  IF st = 'answered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete an answered question');
  END IF;

  DELETE FROM public.case_questions WHERE id = p_question_id;

  PERFORM public.flowcore_refresh_case_all_questions_answered(p_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_submit_answer (spec name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_submit_answer(
  p_organization_id uuid,
  p_case_id uuid,
  p_question_id uuid,
  p_answer_text text,
  p_reasoning text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  q public.case_questions;
  v_part_user uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT * INTO q FROM public.case_questions
  WHERE id = p_question_id AND case_id = p_case_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question not found');
  END IF;

  IF q.status = 'answered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already answered');
  END IF;

  IF q.assigned_to_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Question is not assigned to a participant');
  END IF;

  IF NOT public.flowcore_case_question_deps_unlocked(q) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dependencies not satisfied');
  END IF;

  SELECT user_id INTO v_part_user
  FROM public.case_participants
  WHERE id = q.assigned_to_participant_id;

  IF v_part_user IS NULL OR v_part_user IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the assigned workspace member can submit this answer');
  END IF;

  IF trim(coalesce(p_answer_text, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Answer text is required');
  END IF;

  INSERT INTO public.case_question_answers (question_id, answered_by, answer_text, reasoning)
  VALUES (
    p_question_id,
    v_uid,
    trim(p_answer_text),
    nullif(trim(coalesce(p_reasoning, '')), '')
  );

  UPDATE public.case_questions
  SET status = 'answered'
  WHERE id = p_question_id;

  PERFORM public.flowcore_refresh_case_all_questions_answered(p_case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_list_my_unlocked_case_questions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_my_unlocked_case_questions(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  arr jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'case_id', q.case_id,
        'case_title', c.title,
        'org_slug', o.slug,
        'question_text', q.question_text,
        'description', q.description,
        'status', q.status,
        'depends_on', coalesce(q.depends_on, '[]'::jsonb),
        'order_index', q.order_index,
        'assigned_to_participant_id', q.assigned_to_participant_id,
        'deps_unlocked', true
      )
      ORDER BY c.updated_at DESC, q.order_index, q.created_at
    ),
    '[]'::jsonb
  )
  INTO arr
  FROM public.case_questions q
  JOIN public.cases c ON c.id = q.case_id
  JOIN public.organizations o ON o.id = c.organization_id
  JOIN public.case_participants cp ON cp.id = q.assigned_to_participant_id
  WHERE q.organization_id = p_organization_id
    AND cp.user_id = v_uid
    AND q.status IN ('pending', 'in_progress')
    AND public.flowcore_case_question_deps_unlocked(q);

  RETURN jsonb_build_object('ok', true, 'questions', arr);
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_list_case_questions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_case_question(uuid, uuid, text, text, jsonb, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_case_question(uuid, uuid, uuid, text, text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_assign_question(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_reorder_case_questions(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_case_question(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_submit_answer(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_my_unlocked_case_questions(uuid) TO authenticated;

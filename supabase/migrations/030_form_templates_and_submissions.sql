-- Org-scoped form templates (Google Forms–style fields + conditional visibility) and submissions.

CREATE TABLE IF NOT EXISTS public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_templates_fields_is_array CHECK (jsonb_typeof(fields) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_form_templates_org ON public.form_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_org_updated ON public.form_templates (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  form_template_id uuid NOT NULL REFERENCES public.form_templates (id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases (id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_submissions_answers_is_object CHECK (jsonb_typeof(answers) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON public.form_submissions (form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_org ON public.form_submissions (organization_id);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_templates_select_member" ON public.form_templates;
DROP POLICY IF EXISTS "form_templates_mutate_block" ON public.form_templates;
CREATE POLICY "form_templates_select_member"
  ON public.form_templates FOR SELECT TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));
CREATE POLICY "form_templates_mutate_block"
  ON public.form_templates FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "form_submissions_select_member" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_mutate_block" ON public.form_submissions;
CREATE POLICY "form_submissions_select_member"
  ON public.form_submissions FOR SELECT TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));
CREATE POLICY "form_submissions_mutate_block"
  ON public.form_submissions FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- flowcore_list_form_templates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_form_templates(p_organization_id uuid)
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
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'forms',
    coalesce(
      (
        SELECT jsonb_agg(wrapped.j ORDER BY wrapped.sort_updated DESC)
        FROM (
          SELECT
            ft.updated_at AS sort_updated,
            jsonb_build_object(
              'id', ft.id::text,
              'title', ft.title,
              'description', ft.description,
              'updated_at', ft.updated_at,
              'response_count',
              (SELECT count(*)::int FROM public.form_submissions s WHERE s.form_template_id = ft.id)
            ) AS j
          FROM public.form_templates ft
          WHERE ft.organization_id = p_organization_id
        ) wrapped
      ),
      '[]'::jsonb
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_get_form_template
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_get_form_template(
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
  r public.form_templates%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  SELECT * INTO r
  FROM public.form_templates
  WHERE id = p_form_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Form not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'form',
    jsonb_build_object(
      'id', r.id::text,
      'organization_id', r.organization_id::text,
      'title', r.title,
      'description', r.description,
      'fields', r.fields,
      'created_by', CASE WHEN r.created_by IS NULL THEN NULL ELSE r.created_by::text END,
      'created_at', r.created_at,
      'updated_at', r.updated_at
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_create_form_template
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
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
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

-- ---------------------------------------------------------------------------
-- flowcore_update_form_template
-- ---------------------------------------------------------------------------
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
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

-- ---------------------------------------------------------------------------
-- flowcore_delete_form_template
-- ---------------------------------------------------------------------------
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
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
-- flowcore_submit_form_response
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_submit_form_response(
  p_organization_id uuid,
  p_form_id uuid,
  p_answers jsonb,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sub uuid;
  v_case_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.form_templates ft
    WHERE ft.id = p_form_id AND ft.organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Form not found');
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Answers must be a JSON object');
  END IF;

  IF p_case_id IS NOT NULL THEN
    SELECT organization_id INTO v_case_org FROM public.cases WHERE id = p_case_id;
    IF NOT FOUND OR v_case_org IS DISTINCT FROM p_organization_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
    END IF;
  END IF;

  INSERT INTO public.form_submissions (
    organization_id,
    form_template_id,
    case_id,
    answers,
    submitted_by
  )
  VALUES (
    p_organization_id,
    p_form_id,
    p_case_id,
    p_answers,
    v_uid
  )
  RETURNING id INTO v_sub;

  RETURN jsonb_build_object('ok', true, 'id', v_sub::text);
END;
$$;

-- ---------------------------------------------------------------------------
-- flowcore_list_form_submissions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_form_submissions(
  p_organization_id uuid,
  p_form_id uuid,
  p_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int := coalesce(nullif(p_limit, 0), 100);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.form_templates ft
    WHERE ft.id = p_form_id AND ft.organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Form not found');
  END IF;

  IF v_lim > 500 THEN
    v_lim := 500;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'submissions',
    coalesce(
      (
        SELECT jsonb_agg(x.row_json ORDER BY x.created_at DESC)
        FROM (
          SELECT
            s.created_at,
            jsonb_build_object(
              'id', s.id::text,
              'answers', s.answers,
              'submitted_by', CASE WHEN s.submitted_by IS NULL THEN NULL ELSE s.submitted_by::text END,
              'case_id', CASE WHEN s.case_id IS NULL THEN NULL ELSE s.case_id::text END,
              'created_at', s.created_at
            ) AS row_json
          FROM public.form_submissions s
          WHERE s.organization_id = p_organization_id
            AND s.form_template_id = p_form_id
          ORDER BY s.created_at DESC
          LIMIT v_lim
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_list_form_templates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_get_form_template(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_form_template(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_form_template(uuid, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_form_template(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_submit_form_response(uuid, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_form_submissions(uuid, uuid, int) TO authenticated;

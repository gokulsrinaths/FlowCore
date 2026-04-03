-- Investigation domain: Cases (multi-tenant, org-scoped). Items optionally link to cases.
-- Activity logs gain optional case_id for case-level timeline rows.

-- ---------------------------------------------------------------------------
-- 1. Cases table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  crime_number text,
  description text,
  accused jsonb,
  financial_impact numeric,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'active', 'under_investigation', 'closed')
  ),
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_org ON public.cases (organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases (organization_id, status);

-- updated_at maintained in flowcore_update_case RPC (direct UPDATE blocked by RLS)

-- ---------------------------------------------------------------------------
-- 2. Link items + activity to cases
-- ---------------------------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_case ON public.items (case_id);
CREATE INDEX IF NOT EXISTS idx_items_org_case ON public.items (organization_id, case_id);

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_case ON public.activity_logs (organization_id, case_id);

-- ---------------------------------------------------------------------------
-- 3. Helper: can current user read a case (org member)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_can_read_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = p_case_id
      AND public.flowcore_is_org_member(c.organization_id, auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS: cases (read org members; writes via RPC only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cases_select_member" ON public.cases;
DROP POLICY IF EXISTS "cases_insert_block" ON public.cases;
DROP POLICY IF EXISTS "cases_update_block" ON public.cases;
DROP POLICY IF EXISTS "cases_delete_block" ON public.cases;

CREATE POLICY "cases_select_member"
  ON public.cases FOR SELECT
  TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));

CREATE POLICY "cases_insert_block"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "cases_update_block"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "cases_delete_block"
  ON public.cases FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- 5. Activity SELECT policy: allow case-scoped rows (item_id null, case_id set)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_select_org_scoped" ON public.activity_logs;

CREATE POLICY "activity_select_org_scoped"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = activity_logs.organization_id AND m.user_id = auth.uid()
    )
    AND (
      (item_id IS NOT NULL AND public.flowcore_can_read_item(item_id))
      OR (item_id IS NULL AND case_id IS NOT NULL AND public.flowcore_can_read_case(case_id))
      OR (
        item_id IS NULL
        AND case_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_members m
          WHERE m.organization_id = activity_logs.organization_id
            AND m.user_id = auth.uid()
            AND m.role IN ('org_owner', 'org_admin')
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. RPC: create_case
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_case(
  p_organization_id uuid,
  p_title text,
  p_crime_number text,
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
  v_id uuid;
  v_status text := coalesce(nullif(trim(p_status), ''), 'open');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF v_status NOT IN ('open', 'active', 'under_investigation', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid case status');
  END IF;

  INSERT INTO public.cases (
    organization_id,
    title,
    crime_number,
    description,
    accused,
    financial_impact,
    status,
    created_by
  )
  VALUES (
    p_organization_id,
    trim(p_title),
    nullif(trim(p_crime_number), ''),
    nullif(trim(p_description), ''),
    p_accused,
    p_financial_impact,
    v_status,
    v_uid
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (null, v_uid, 'Case created', null, trim(p_title), p_organization_id, v_id);

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC: update_case
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_case(
  p_organization_id uuid,
  p_case_id uuid,
  p_title text,
  p_crime_number text,
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
  v_org uuid;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF public.flowcore_membership_role(p_organization_id, v_uid) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
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
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'active', 'under_investigation', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid case status');
  END IF;

  UPDATE public.cases
  SET
    title = trim(p_title),
    crime_number = nullif(trim(p_crime_number), ''),
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
-- 8. RPC: delete_case (org_owner / org_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_delete_case(p_organization_id uuid, p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_org uuid;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only workspace owners and admins can delete cases');
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

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (null, v_uid, 'Case deleted', v_title, p_case_id::text, p_organization_id, p_case_id);

  DELETE FROM public.cases WHERE id = p_case_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: assign_item_to_case
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_assign_item_to_case(
  p_organization_id uuid,
  p_item_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_item_org uuid;
  v_case_org uuid;
  v_prev uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT organization_id, case_id INTO v_item_org, v_prev
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
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

  UPDATE public.items SET case_id = p_case_id WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (
    p_item_id,
    v_uid,
    'Item linked to case',
    coalesce(v_prev::text, ''),
    coalesce(p_case_id::text, ''),
    p_organization_id,
    p_case_id
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

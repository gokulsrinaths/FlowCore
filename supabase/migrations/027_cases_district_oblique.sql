-- Cases: add district + (historical) oblique column; extend create/update RPCs.
-- Oblique was removed in 029; reference is district + crime_number only.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS oblique text;

-- Replace RPCs (signature change: add p_district, p_oblique after crime_number).

DROP FUNCTION IF EXISTS public.flowcore_create_case(uuid, text, text, text, jsonb, numeric, text);

CREATE OR REPLACE FUNCTION public.flowcore_create_case(
  p_organization_id uuid,
  p_title text,
  p_crime_number text,
  p_district text,
  p_oblique text,
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
    RETURN jsonb_build_object('ok', false, 'error', 'Case name is required');
  END IF;

  IF v_status NOT IN ('open', 'active', 'under_investigation', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid case status');
  END IF;

  INSERT INTO public.cases (
    organization_id,
    title,
    crime_number,
    district,
    oblique,
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
    nullif(trim(p_district), ''),
    nullif(trim(p_oblique), ''),
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

DROP FUNCTION IF EXISTS public.flowcore_update_case(uuid, uuid, text, text, text, jsonb, numeric, text);

CREATE OR REPLACE FUNCTION public.flowcore_update_case(
  p_organization_id uuid,
  p_case_id uuid,
  p_title text,
  p_crime_number text,
  p_district text,
  p_oblique text,
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
    oblique = nullif(trim(p_oblique), ''),
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

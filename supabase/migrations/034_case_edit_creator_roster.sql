-- Allow case edits by creator, internal roster members, and managers (not only owners/admins).

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
  v_case_created_by uuid;
  v_can_edit boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT organization_id, title, created_by INTO v_org, v_title, v_case_created_by
  FROM public.cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not found');
  END IF;

  IF v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Case not in this workspace');
  END IF;

  v_can_edit :=
    v_org_role IN ('org_owner', 'org_admin', 'org_manager')
    OR v_case_created_by IS NOT DISTINCT FROM v_uid
    OR EXISTS (
      SELECT 1
      FROM public.case_participants cp
      WHERE cp.case_id = p_case_id
        AND cp.organization_id = p_organization_id
        AND cp.user_id IS NOT DISTINCT FROM v_uid
        AND cp.type = 'internal'
    );

  IF NOT v_can_edit THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'You can edit this case if you created it, are on the case roster as a member, or are an owner, admin, or manager.'
    );
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

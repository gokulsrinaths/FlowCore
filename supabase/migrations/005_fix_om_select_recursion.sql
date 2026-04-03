-- Fix PostgreSQL 42P17: "infinite recursion detected in policy for relation organization_members"
--
-- om_select used EXISTS (SELECT ... FROM organization_members ...), which re-entered
-- the same RLS policy on every row. Use SECURITY DEFINER flowcore_is_org_member instead
-- (same pattern as other policies in this project).

DROP POLICY IF EXISTS "om_select" ON public.organization_members;

CREATE POLICY "om_select"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    public.flowcore_is_org_member(organization_members.organization_id, auth.uid())
  );

GRANT EXECUTE ON FUNCTION public.flowcore_is_org_member(uuid, uuid) TO authenticated;

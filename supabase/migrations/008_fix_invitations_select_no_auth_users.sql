-- inv_select compared invitation email to (SELECT email FROM auth.users ...).
-- The authenticated role cannot SELECT from auth.users in RLS/policy context (42501).
-- Use the JWT email claim instead (same pattern as Supabase docs for RLS).

DROP POLICY IF EXISTS "inv_select" ON public.invitations;

CREATE POLICY "inv_select"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = invitations.organization_id AND m.user_id = auth.uid()
        AND m.role IN ('org_owner', 'org_admin')
    )
    OR lower(trim(coalesce(invitations.email, ''))) = lower(trim(coalesce(
      auth.jwt() ->> 'email',
      ''
    )))
  );

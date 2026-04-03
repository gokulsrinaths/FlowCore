-- FlowCore SaaS: organizations, invitations, org-scoped RLS + RPCs
-- Apply after 002_flowcore_production.sql

-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  primary_use_case text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (
    role IN ('org_owner', 'org_admin', 'org_manager', 'org_worker')
  ),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members (user_id);

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (
    role IN ('org_owner', 'org_admin', 'org_manager', 'org_worker')
  ),
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES public.users (id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations (token);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.invitations (organization_id);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'canceled', 'past_due', 'trialing')
  ),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_org ON public.usage_events (organization_id);

-- ---------------------------------------------------------------------------
-- 2. Add organization_id to domain tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: default org + memberships + subscriptions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_id uuid;
  v_first_admin uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1) THEN
    INSERT INTO public.organizations (name, slug, primary_use_case)
    VALUES ('Default workspace', 'default', 'legacy')
    RETURNING id INTO v_org_id;

    INSERT INTO public.subscriptions (organization_id, plan, status)
    VALUES (v_org_id, 'free', 'active');

    INSERT INTO public.organization_members (organization_id, user_id, role)
    SELECT
      v_org_id,
      u.id,
      CASE u.role
        WHEN 'admin' THEN 'org_admin'
        WHEN 'manager' THEN 'org_manager'
        ELSE 'org_worker'
      END
    FROM public.users u;

    SELECT u.id INTO v_first_admin
    FROM public.users u
    JOIN public.organization_members m ON m.user_id = u.id AND m.organization_id = v_org_id
    WHERE m.role = 'org_admin'
    ORDER BY u.created_at ASC
    LIMIT 1;

    IF v_first_admin IS NOT NULL THEN
      UPDATE public.organization_members
      SET role = 'org_owner'
      WHERE organization_id = v_org_id AND user_id = v_first_admin;
    END IF;

    UPDATE public.items SET organization_id = v_org_id WHERE organization_id IS NULL;
    UPDATE public.comments c
    SET organization_id = i.organization_id
    FROM public.items i
    WHERE c.item_id = i.id AND c.organization_id IS NULL;
    UPDATE public.activity_logs al
    SET organization_id = i.organization_id
    FROM public.items i
    WHERE al.item_id = i.id AND al.organization_id IS NULL;
    UPDATE public.activity_logs
    SET organization_id = v_org_id
    WHERE organization_id IS NULL;
  ELSE
    -- Already has orgs: ensure items/comments/logs have org if missing (manual repair)
    UPDATE public.items i
    SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
    WHERE organization_id IS NULL;
    UPDATE public.comments c
    SET organization_id = i.organization_id
    FROM public.items i
    WHERE c.item_id = i.id AND c.organization_id IS NULL;
    UPDATE public.activity_logs al
    SET organization_id = i.organization_id
    FROM public.items i
    WHERE al.item_id = i.id AND al.organization_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.comments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.activity_logs ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_org ON public.items (organization_id);
CREATE INDEX IF NOT EXISTS idx_comments_org ON public.comments (organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON public.activity_logs (organization_id);

-- ---------------------------------------------------------------------------
-- 4. Drop old RPCs (signatures from 002)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flowcore_create_item(text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.flowcore_update_item_status(uuid, text);
DROP FUNCTION IF EXISTS public.flowcore_update_item_assignee(uuid, uuid);
DROP FUNCTION IF EXISTS public.flowcore_update_item_details(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.flowcore_delete_item(uuid);
DROP FUNCTION IF EXISTS public.flowcore_add_comment(uuid, text);
DROP FUNCTION IF EXISTS public.flowcore_delete_comment(uuid);
DROP FUNCTION IF EXISTS public.flowcore_update_user_role(uuid, text);

-- ---------------------------------------------------------------------------
-- 5. Helpers: org role -> workflow role (admin / manager / worker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_org_workflow_role(p_org_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_org_role
    WHEN 'org_owner' THEN 'admin'
    WHEN 'org_admin' THEN 'admin'
    WHEN 'org_manager' THEN 'manager'
    WHEN 'org_worker' THEN 'worker'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_membership_role(p_org_id uuid, p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.organization_members m
  WHERE m.organization_id = p_org_id AND m.user_id = p_uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_is_org_member(p_org_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_uid
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Replace flowcore_can_read_item (org-scoped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_can_read_item(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.items i
    JOIN public.organization_members m ON m.organization_id = i.organization_id AND m.user_id = auth.uid()
    WHERE i.id = p_item_id
      AND (
        m.role IN ('org_owner', 'org_admin', 'org_manager')
        OR i.created_by = auth.uid()
        OR i.assigned_to = auth.uid()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS: drop & recreate items / activity / comments / users policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "items_select_scoped" ON public.items;
DROP POLICY IF EXISTS "activity_select_scoped" ON public.activity_logs;
DROP POLICY IF EXISTS "comments_select_scoped" ON public.comments;
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;

CREATE POLICY "items_select_org_scoped"
  ON public.items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = items.organization_id AND m.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.organization_members m
        WHERE m.organization_id = items.organization_id AND m.user_id = auth.uid()
          AND m.role IN ('org_owner', 'org_admin', 'org_manager')
      )
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

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
      (
        item_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_members m
          WHERE m.organization_id = activity_logs.organization_id AND m.user_id = auth.uid()
            AND m.role IN ('org_owner', 'org_admin')
        )
      )
      OR (item_id IS NOT NULL AND public.flowcore_can_read_item(item_id))
    )
  );

CREATE POLICY "comments_select_org_scoped"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.items i
      JOIN public.organization_members m ON m.organization_id = i.organization_id AND m.user_id = auth.uid()
      WHERE i.id = comments.item_id
        AND (
          m.role IN ('org_owner', 'org_admin', 'org_manager')
          OR i.created_by = auth.uid()
          OR i.assigned_to = auth.uid()
        )
    )
  );

CREATE POLICY "users_select_org_peers"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members a
      JOIN public.organization_members b ON a.organization_id = b.organization_id
      WHERE a.user_id = auth.uid() AND b.user_id = users.id
    )
  );

-- ---------------------------------------------------------------------------
-- 8. RLS: organizations, members, invitations, subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_select_member" ON public.organizations;
DROP POLICY IF EXISTS "orgs_no_mutate" ON public.organizations;
DROP POLICY IF EXISTS "orgs_insert_block" ON public.organizations;
DROP POLICY IF EXISTS "orgs_update_block" ON public.organizations;
DROP POLICY IF EXISTS "orgs_delete_block" ON public.organizations;
DROP POLICY IF EXISTS "om_select" ON public.organization_members;
DROP POLICY IF EXISTS "om_no_mutate" ON public.organization_members;
DROP POLICY IF EXISTS "om_insert_block" ON public.organization_members;
DROP POLICY IF EXISTS "om_update_block" ON public.organization_members;
DROP POLICY IF EXISTS "om_delete_block" ON public.organization_members;
DROP POLICY IF EXISTS "inv_select" ON public.invitations;
DROP POLICY IF EXISTS "inv_no_mutate" ON public.invitations;
DROP POLICY IF EXISTS "inv_insert_block" ON public.invitations;
DROP POLICY IF EXISTS "inv_update_block" ON public.invitations;
DROP POLICY IF EXISTS "inv_delete_block" ON public.invitations;
DROP POLICY IF EXISTS "sub_select" ON public.subscriptions;
DROP POLICY IF EXISTS "sub_no_mutate" ON public.subscriptions;
DROP POLICY IF EXISTS "sub_insert_block" ON public.subscriptions;
DROP POLICY IF EXISTS "sub_update_block" ON public.subscriptions;
DROP POLICY IF EXISTS "sub_delete_block" ON public.subscriptions;

CREATE POLICY "orgs_select_member"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organizations.id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "orgs_insert_block"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "orgs_update_block"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "orgs_delete_block"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "om_select"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organization_members.organization_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "om_insert_block"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "om_update_block"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "om_delete_block"
  ON public.organization_members FOR DELETE
  TO authenticated
  USING (false);

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
    OR lower(trim(coalesce(invitations.email, ''))) = lower(trim((
      SELECT email::text FROM auth.users WHERE id = auth.uid()
    )))
  );

CREATE POLICY "inv_insert_block"
  ON public.invitations FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "inv_update_block"
  ON public.invitations FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "inv_delete_block"
  ON public.invitations FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "sub_select"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = subscriptions.organization_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "sub_insert_block"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "sub_update_block"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "sub_delete_block"
  ON public.subscriptions FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- 9. RPC: list organizations for current user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_user_organizations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'role', m.role
        )
        ORDER BY o.name
      )
      FROM public.organization_members m
      JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = v_uid
    ),
    '[]'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: create organization (onboarding)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_organization(
  p_name text,
  p_slug text,
  p_primary_use_case text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_slug text := lower(trim(regexp_replace(trim(p_slug), '\s+', '-', 'g')));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name is required');
  END IF;

  IF v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid workspace URL slug');
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This workspace URL is already taken');
  END IF;

  INSERT INTO public.organizations (name, slug, primary_use_case)
  VALUES (trim(p_name), v_slug, nullif(trim(p_primary_use_case), ''))
  RETURNING id INTO v_org_id;

  INSERT INTO public.subscriptions (organization_id, plan, status)
  VALUES (v_org_id, 'free', 'active');

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'org_owner');

  IF trim(coalesce(p_display_name, '')) <> '' THEN
    UPDATE public.users
    SET name = trim(p_display_name)
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_org_id::text, 'slug', v_slug);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This workspace URL is already taken');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. RPC: update organization (name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_organization(
  p_organization_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Name is required');
  END IF;

  UPDATE public.organizations
  SET name = trim(p_name)
  WHERE id = p_organization_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. RPC: invitations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_token text;
  v_email text := lower(trim(p_email));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only owners and admins can invite');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid email required');
  END IF;

  IF p_role NOT IN ('org_admin', 'org_manager', 'org_worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid invite role');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u WHERE lower(trim(coalesce(u.email, ''))) = v_email
  ) AND EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.organization_members m ON m.user_id = u.id AND m.organization_id = p_organization_id
    WHERE lower(trim(coalesce(u.email, ''))) = v_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User is already a member');
  END IF;

  DELETE FROM public.invitations
  WHERE organization_id = p_organization_id
    AND lower(trim(email)) = v_email
    AND accepted_at IS NULL
    AND case_id IS NULL;

  -- 48 hex chars; core-only (no pgcrypto — see migration 015)
  v_token := substring(
    md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text)
    from 1 for 48
  );

  INSERT INTO public.invitations (organization_id, email, role, token, invited_by, expires_at)
  VALUES (
    p_organization_id,
    v_email,
    p_role,
    v_token,
    v_uid,
    now() + interval '14 days'
  );

  RETURN jsonb_build_object('ok', true, 'token', v_token);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'An open invite may already exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email not found');
  END IF;

  SELECT * INTO inv
  FROM public.invitations
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  IF lower(trim(inv.email)) <> lower(trim(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in with the invited email address');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = inv.organization_id AND user_id = v_uid
  ) THEN
    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
    RETURN jsonb_build_object(
      'ok',
      true,
      'organization_id',
      inv.organization_id::text,
      'slug',
      (SELECT slug FROM public.organizations WHERE id = inv.organization_id)
    );
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, v_uid, inv.role);

  UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok',
    true,
    'organization_id',
    inv.organization_id::text,
    'slug',
    (SELECT slug FROM public.organizations WHERE id = inv.organization_id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_cancel_invitation(
  p_organization_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  DELETE FROM public.invitations
  WHERE id = p_invitation_id AND organization_id = p_organization_id AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. RPC: member management
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_member_role(
  p_organization_id uuid,
  p_target uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor text;
  v_old text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_actor := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_actor IS NULL OR v_actor NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF p_new_role NOT IN ('org_owner', 'org_admin', 'org_manager', 'org_worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role');
  END IF;

  SELECT role INTO v_old
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  IF v_old = 'org_owner' AND v_actor <> 'org_owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the owner can change the owner role');
  END IF;

  IF p_new_role = 'org_owner' AND v_actor <> 'org_owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the owner can assign ownership');
  END IF;

  IF v_actor = 'org_admin' AND v_old IN ('org_owner', 'org_admin') AND p_target <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admins cannot change owner or other admins');
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_target;

  UPDATE public.organization_members
  SET role = p_new_role
  WHERE organization_id = p_organization_id AND user_id = p_target;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (
    null,
    v_uid,
    'Member role changed',
    coalesce(v_email, '') || ': ' || v_old,
    coalesce(v_email, '') || ': ' || p_new_role,
    p_organization_id
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_remove_member(
  p_organization_id uuid,
  p_target uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor text;
  v_target_role text;
  v_owner_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF p_target = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Use leave organization to remove yourself');
  END IF;

  v_actor := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_actor IS NULL OR v_actor NOT IN ('org_owner', 'org_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT role INTO v_target_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  IF v_target_role = 'org_owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot remove the organization owner');
  END IF;

  IF v_actor = 'org_admin' AND v_target_role IN ('org_admin', 'org_owner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  DELETE FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (null, v_uid, 'Member removed', p_target::text, null, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_leave_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_owner_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member');
  END IF;

  IF v_role = 'org_owner' THEN
    SELECT count(*)::int INTO v_owner_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND role = 'org_owner';

    IF v_owner_count <= 1 THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'Transfer ownership before leaving, or delete the workspace (contact support).'
      );
    END IF;
  END IF;

  DELETE FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. RPC: demo seed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_seed_demo_items(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL OR v_role NOT IN ('org_owner', 'org_admin', 'org_manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  INSERT INTO public.items (title, description, type, status, priority, created_by, assigned_to, organization_id)
  VALUES
    (
      'Sample intake: New vendor request',
      'Demo item — move through Created → In progress → Under review → Completed.',
      'demo',
      'created',
      'medium',
      v_uid,
      v_uid,
      p_organization_id
    )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (v_id, v_uid, 'Item created', null, 'Sample intake: New vendor request', p_organization_id);

  INSERT INTO public.items (title, description, type, status, priority, created_by, assigned_to, organization_id)
  VALUES
    (
      'Sample: Policy review checklist',
      'Second demo card to show multiple items on the board.',
      'demo',
      'in_progress',
      'high',
      v_uid,
      v_uid,
      p_organization_id
    )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (v_id, v_uid, 'Item created', null, 'Sample: Policy review checklist', p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Item / comment RPCs (org-scoped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_item(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text,
  p_assigned_to uuid
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
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);
  IF v_wf IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid membership');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF v_wf NOT IN ('admin', 'manager') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
    END IF;
    IF NOT public.flowcore_is_org_member(p_organization_id, p_assigned_to) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a member of this workspace');
    END IF;
  END IF;

  INSERT INTO public.items (
    title,
    description,
    type,
    priority,
    status,
    created_by,
    assigned_to,
    organization_id
  )
  VALUES (
    trim(p_title),
    nullif(trim(p_description), ''),
    nullif(trim(p_type), ''),
    nullif(trim(p_priority), ''),
    'created',
    v_uid,
    p_assigned_to,
    p_organization_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (v_id, v_uid, 'Item created', null, trim(p_title), p_organization_id);

  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
    VALUES (
      v_id,
      v_uid,
      'Assignment',
      null,
      (SELECT coalesce(name, email, 'User') FROM public.users WHERE id = p_assigned_to),
      p_organization_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.flowcore_update_item_assignee(
  p_organization_id uuid,
  p_item_id uuid,
  p_assignee uuid
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
  v_prev uuid;
  v_item_org uuid;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);
  IF v_wf NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can reassign items');
  END IF;

  SELECT assigned_to, organization_id INTO v_prev, v_item_org
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF p_assignee IS NOT NULL AND NOT public.flowcore_is_org_member(p_organization_id, p_assignee) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a member of this workspace');
  END IF;

  IF v_prev IS NOT DISTINCT FROM p_assignee THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_prev IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev;
  END IF;
  IF p_assignee IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = p_assignee;
  END IF;

  UPDATE public.items SET assigned_to = p_assignee WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_update_item_details(
  p_organization_id uuid,
  p_item_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text
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
  rec public.items%ROWTYPE;
  v_summary text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT * INTO rec FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF rec.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_wf NOT IN ('admin', 'manager')
     AND rec.created_by IS DISTINCT FROM v_uid
     AND rec.assigned_to IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot edit this item');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  v_summary :=
    'title: ' || coalesce(rec.title, '') || ' → ' || trim(p_title) ||
    '; desc/type/priority updated';

  UPDATE public.items
  SET
    title = trim(p_title),
    description = nullif(trim(p_description), ''),
    type = nullif(trim(p_type), ''),
    priority = nullif(trim(p_priority), '')
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (p_item_id, v_uid, 'Item updated', 'previous snapshot', v_summary, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_delete_item(p_organization_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_role text;
  v_wf text;
  v_title text;
  v_created_by uuid;
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

  SELECT title, created_by, organization_id INTO v_title, v_created_by, v_item_org
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_wf IS DISTINCT FROM 'admin' AND v_created_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only admins or the creator can delete this item');
  END IF;

  DELETE FROM public.items WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (null, v_uid, 'Item deleted', v_title, p_item_id::text, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_add_comment(
  p_organization_id uuid,
  p_item_id uuid,
  p_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := trim(p_text);
  v_cid uuid;
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF v_body = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment cannot be empty');
  END IF;

  SELECT organization_id INTO v_org FROM public.items WHERE id = p_item_id;
  IF NOT FOUND OR v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not accessible');
  END IF;

  IF NOT public.flowcore_can_read_item(p_item_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not accessible');
  END IF;

  INSERT INTO public.comments (item_id, user_id, text, organization_id)
  VALUES (p_item_id, v_uid, v_body, p_organization_id)
  RETURNING id INTO v_cid;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (p_item_id, v_uid, 'Comment added', null, left(v_body, 120), p_organization_id);

  RETURN jsonb_build_object('ok', true, 'id', v_cid::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.flowcore_delete_comment(
  p_organization_id uuid,
  p_comment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item uuid;
  v_text text;
  v_owner uuid;
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.flowcore_is_org_member(p_organization_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT item_id, text, user_id, organization_id INTO v_item, v_text, v_owner, v_org
  FROM public.comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment not found');
  END IF;

  IF v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment not in this workspace');
  END IF;

  IF v_owner IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only delete your own comments');
  END IF;

  DELETE FROM public.comments WHERE id = p_comment_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id)
  VALUES (v_item, v_uid, 'Comment deleted', left(v_text, 120), null, p_organization_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_list_user_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_organization(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_organization(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_cancel_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_leave_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_seed_demo_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_item(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_assignee(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_details(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_add_comment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_comment(uuid, uuid) TO authenticated;

-- FlowCore production: strict RLS + SECURITY DEFINER RPCs (atomic mutations + audit)
-- Apply after 001_flowcore.sql

-- ---------------------------------------------------------------------------
-- activity_logs: allow system-level rows; keep logs when item deleted (audit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_logs
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_item_id_fkey;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Drop permissive policies from 001
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "items_select_authenticated" ON public.items;
DROP POLICY IF EXISTS "items_insert_authenticated" ON public.items;
DROP POLICY IF EXISTS "items_update_authenticated" ON public.items;
DROP POLICY IF EXISTS "items_delete_authenticated" ON public.items;

DROP POLICY IF EXISTS "activity_select_authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_insert_authenticated" ON public.activity_logs;

DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_authenticated" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;

-- ---------------------------------------------------------------------------
-- Helpers: who can see an item row
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
    WHERE i.id = p_item_id
      AND (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
        OR i.created_by = auth.uid()
        OR i.assigned_to = auth.uid()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Strict workflow transitions (must match lib/permissions.ts)
-- Worker: created→in_progress, in_progress→under_review
-- Manager: under_review→completed, under_review→in_progress (reject), assign
-- Admin: any change between distinct statuses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_can_transition(p_role text, p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NOT DISTINCT FROM p_to THEN true
    WHEN p_role = 'admin' THEN p_from IS DISTINCT FROM p_to
    WHEN p_role = 'worker' THEN
      (p_from = 'created' AND p_to = 'in_progress')
      OR (p_from = 'in_progress' AND p_to = 'under_review')
    WHEN p_role = 'manager' THEN
      (p_from = 'under_review' AND p_to = 'completed')
      OR (p_from = 'under_review' AND p_to = 'in_progress')
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: items — read by role; no direct writes (use RPC)
-- ---------------------------------------------------------------------------
CREATE POLICY "items_select_scoped"
  ON public.items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "items_no_direct_insert"
  ON public.items FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "items_no_direct_update"
  ON public.items FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "items_no_direct_delete"
  ON public.items FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- RLS: activity_logs — read if item visible or system row (admin only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_select_authenticated" ON public.activity_logs;

CREATE POLICY "activity_select_scoped"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (
    (item_id IS NULL AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
    OR (
      item_id IS NOT NULL
      AND public.flowcore_can_read_item(item_id)
    )
  );

CREATE POLICY "activity_no_direct_insert"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "activity_no_direct_update"
  ON public.activity_logs FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "activity_no_direct_delete"
  ON public.activity_logs FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- RLS: comments — read with item; no direct write
-- ---------------------------------------------------------------------------
CREATE POLICY "comments_select_scoped"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.items i
      WHERE i.id = comments.item_id
        AND (
          EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager'))
          OR i.created_by = auth.uid()
          OR i.assigned_to = auth.uid()
        )
    )
  );

CREATE POLICY "comments_no_direct_insert"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "comments_no_direct_update"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "comments_no_direct_delete"
  ON public.comments FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- RLS: users — read all; no direct update (RPC only)
-- ---------------------------------------------------------------------------
CREATE POLICY "users_no_direct_update"
  ON public.users FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- RPC: ensure profile row (fixes missing public.users after auth)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_ensure_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta
  FROM auth.users
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auth user missing');
  END IF;

  INSERT INTO public.users (id, name, email, role)
  VALUES (
    v_uid,
    COALESCE(v_meta ->> 'name', split_part(v_email, '@', 1)),
    v_email,
    'worker'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create item (+ audit) — assign only manager/admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_item(
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
  v_role text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  IF trim(coalesce(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Title is required');
  END IF;

  IF p_assigned_to IS NOT NULL AND v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
  END IF;

  INSERT INTO public.items (title, description, type, priority, status, created_by, assigned_to)
  VALUES (
    trim(p_title),
    nullif(trim(p_description), ''),
    nullif(trim(p_type), ''),
    nullif(trim(p_priority), ''),
    'created',
    v_uid,
    p_assigned_to
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (v_id, v_uid, 'Item created', null, trim(p_title));

  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
    VALUES (
      v_id,
      v_uid,
      'Assignment',
      null,
      (SELECT coalesce(name, email, 'User') FROM public.users WHERE id = p_assigned_to)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update status (+ audit) — single transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_item_status(p_item_id uuid, p_new_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_old text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  SELECT status INTO v_old FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_old = p_new_status THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF NOT public.flowcore_can_transition(v_role, v_old, p_new_status) THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'This role cannot move the item from ' || v_old || ' to ' || p_new_status
    );
  END IF;

  UPDATE public.items SET status = p_new_status WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (p_item_id, v_uid, 'Status change', v_old, p_new_status);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: assignee (+ audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_item_assignee(p_item_id uuid, p_assignee uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_prev uuid;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can reassign items');
  END IF;

  SELECT assigned_to INTO v_prev FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
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

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: edit fields (+ audit) — admin, manager, creator, or assignee
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_item_details(
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
  v_role text;
  rec public.items%ROWTYPE;
  v_summary text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  SELECT * INTO rec FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_role NOT IN ('admin', 'manager')
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

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (p_item_id, v_uid, 'Item updated', 'previous snapshot', v_summary);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: delete item (+ audit) — admin or creator only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_delete_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_role text;
  v_title text;
  v_created_by uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_user_role FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  SELECT title, created_by INTO v_title, v_created_by
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_user_role IS DISTINCT FROM 'admin' AND v_created_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only admins or the creator can delete this item');
  END IF;

  DELETE FROM public.items WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (null, v_uid, 'Item deleted', v_title, p_item_id::text);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: add comment (+ audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_add_comment(p_item_id uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := trim(p_text);
  v_cid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF v_body = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment cannot be empty');
  END IF;

  IF NOT public.flowcore_can_read_item(p_item_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not accessible');
  END IF;

  INSERT INTO public.comments (item_id, user_id, text)
  VALUES (p_item_id, v_uid, v_body)
  RETURNING id INTO v_cid;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (p_item_id, v_uid, 'Comment added', null, left(v_body, 120));

  RETURN jsonb_build_object('ok', true, 'id', v_cid);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: delete own comment (+ audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_delete_comment(p_comment_id uuid)
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT item_id, text, user_id INTO v_item, v_text, v_owner
  FROM public.comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment not found');
  END IF;

  IF v_owner IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only delete your own comments');
  END IF;

  DELETE FROM public.comments WHERE id = p_comment_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (v_item, v_uid, 'Comment deleted', left(v_text, 120), null);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin role change (+ system audit row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_update_user_role(p_target uuid, p_new_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin text;
  v_old text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_admin FROM public.users WHERE id = v_uid;
  IF NOT FOUND OR v_admin IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  IF p_new_role NOT IN ('admin', 'manager', 'worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role');
  END IF;

  SELECT email, role INTO v_email, v_old FROM public.users WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  IF v_old = p_new_role THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.users SET role = p_new_role WHERE id = p_target;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value)
  VALUES (
    null,
    v_uid,
    'Role changed',
    coalesce(v_email, '') || ': ' || v_old,
    coalesce(v_email, '') || ': ' || p_new_role
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated may invoke RPCs only (no direct table writes)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_ensure_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_create_item(text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_assignee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_item_details(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_add_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_delete_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_update_user_role(uuid, text) TO authenticated;

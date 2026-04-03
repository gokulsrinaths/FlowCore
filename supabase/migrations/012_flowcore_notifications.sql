-- In-app notifications, optional due reminders, hooks from item assignment / comments / status.

-- ---------------------------------------------------------------------------
-- 1. notifications + items.due_date
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  message text NOT NULL,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. RLS: notifications — read own rows only; mutations blocked (RPC only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_block" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_block" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_block" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_block"
  ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "notifications_update_block"
  ON public.notifications FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "notifications_delete_block"
  ON public.notifications FOR DELETE TO authenticated USING (false);

-- ---------------------------------------------------------------------------
-- 3. Internal helper: insert notification (SECURITY DEFINER; not granted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._flowcore_insert_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_message text,
  p_link text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (organization_id, user_id, message, link)
  VALUES (p_organization_id, p_user_id, left(p_message, 2000), p_link);
END;
$$;

CREATE OR REPLACE FUNCTION public._flowcore_item_link(p_organization_id uuid, p_item_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT '/' || o.slug || '/items/' || p_item_id::text
  FROM public.organizations o
  WHERE o.id = p_organization_id
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. flowcore_create_notification (RPC — org members only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_create_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_message text,
  p_link text DEFAULT NULL
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

  IF NOT public.flowcore_is_org_member(p_organization_id, p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user is not in this workspace');
  END IF;

  IF trim(coalesce(p_message, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message is required');
  END IF;

  PERFORM public._flowcore_insert_notification(
    p_organization_id,
    p_user_id,
    trim(p_message),
    nullif(trim(p_link), '')
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. flowcore_list_my_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_list_my_notifications(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_j jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'organization_id', n.organization_id,
          'message', n.message,
          'link', n.link,
          'read', n.read,
          'created_at', n.created_at
        )
        ORDER BY n.created_at DESC
      )
      FROM (
        SELECT *
        FROM public.notifications
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      ) n
    ),
    '[]'::jsonb
  )
  INTO v_j;

  RETURN jsonb_build_object('ok', true, 'notifications', v_j);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. flowcore_notification_unread_count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_notification_unread_count()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  n int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT count(*)::int INTO n
  FROM public.notifications
  WHERE user_id = v_uid AND read = false;

  RETURN jsonb_build_object('ok', true, 'count', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. flowcore_mark_notification_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_mark_notification_read(p_notification_id uuid)
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

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications WHERE id = p_notification_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not found');
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE id = p_notification_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. flowcore_mark_all_notifications_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_mark_all_notifications_read()
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

  UPDATE public.notifications SET read = true WHERE user_id = v_uid AND read = false;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. flowcore_set_item_due_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_set_item_due_date(
  p_organization_id uuid,
  p_item_id uuid,
  p_due_date timestamptz
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

  SELECT organization_id INTO v_item_org FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;
  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF v_wf NOT IN ('admin', 'manager')
     AND EXISTS (
       SELECT 1 FROM public.items i
       WHERE i.id = p_item_id
         AND i.created_by IS DISTINCT FROM v_uid
         AND i.assigned_to IS DISTINCT FROM v_uid
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot edit due date');
  END IF;

  UPDATE public.items
  SET due_date = p_due_date, due_reminder_sent_at = NULL
  WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. flowcore_send_due_reminders (service_role only — cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_send_due_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  rec record;
  v_link text;
  v_count int := 0;
  v_emails jsonb := '[]'::jsonb;
  v_to text;
  v_case_title text;
BEGIN
  v_role := COALESCE(auth.jwt() ->> 'role', '');
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  FOR rec IN
    SELECT
      i.id AS item_id,
      i.organization_id,
      i.title AS item_title,
      i.case_id,
      o.slug AS org_slug,
      COALESCE(i.assigned_to, cp.user_id) AS assignee_uid,
      cp.email AS part_email,
      c.title AS case_title
    FROM public.items i
    JOIN public.organizations o ON o.id = i.organization_id
    LEFT JOIN public.case_participants cp ON cp.id = i.assigned_participant_id
    LEFT JOIN public.cases c ON c.id = i.case_id
    WHERE i.due_date IS NOT NULL
      AND i.status <> 'completed'
      AND i.due_reminder_sent_at IS NULL
      AND i.due_date <= now() + interval '24 hours'
      AND i.due_date >= now()
  LOOP
    v_link := '/' || rec.org_slug || '/items/' || rec.item_id::text;
    v_case_title := rec.case_title;

    IF rec.assignee_uid IS NOT NULL THEN
      PERFORM public._flowcore_insert_notification(
        rec.organization_id,
        rec.assignee_uid,
        'Task due soon: "' || left(rec.item_title, 200) || '"',
        v_link
      );
      SELECT email INTO v_to FROM public.users WHERE id = rec.assignee_uid;
      IF v_to IS NOT NULL AND v_to <> '' THEN
        v_emails := v_emails || jsonb_build_array(
          jsonb_build_object(
            'to', v_to,
            'task_title', rec.item_title,
            'case_title', coalesce(v_case_title, ''),
            'link_path', v_link
          )
        );
      END IF;
    ELSIF rec.part_email IS NOT NULL AND trim(rec.part_email) <> '' THEN
      v_emails := v_emails || jsonb_build_array(
        jsonb_build_object(
          'to', lower(trim(rec.part_email)),
          'task_title', rec.item_title,
          'case_title', coalesce(v_case_title, ''),
          'link_path', v_link
        )
      );
    END IF;

    UPDATE public.items SET due_reminder_sent_at = now() WHERE id = rec.item_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'emails', v_emails);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Replace flowcore_update_item_status (notifications)
-- ---------------------------------------------------------------------------
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
  v_case_id uuid;
  v_assignee_uid uuid;
  v_title text;
  v_link text;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_org_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_org_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  v_wf := public.flowcore_org_workflow_role(v_org_role);

  SELECT status, organization_id, case_id INTO v_old, v_item_org, v_case_id
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

  SELECT
    COALESCE(i.assigned_to, cp.user_id),
    i.title
  INTO v_assignee_uid, v_title
  FROM public.items i
  LEFT JOIN public.case_participants cp ON cp.id = i.assigned_participant_id
  WHERE i.id = p_item_id;

  UPDATE public.items SET status = p_new_status WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Status change', v_old, p_new_status, p_organization_id, v_case_id);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF p_new_status IN ('under_review', 'completed') THEN
    IF v_assignee_uid IS NOT NULL AND v_assignee_uid IS DISTINCT FROM v_uid THEN
      PERFORM public._flowcore_insert_notification(
        p_organization_id,
        v_assignee_uid,
        'Task "' || left(coalesce(v_title, 'Task'), 200) || '" moved to ' || p_new_status,
        v_link
      );
    END IF;

    FOR v_mgr IN
      SELECT m.user_id
      FROM public.organization_members m
      WHERE m.organization_id = p_organization_id
        AND m.role IN ('org_manager', 'org_admin')
        AND m.user_id IS DISTINCT FROM v_uid
    LOOP
      IF v_mgr.user_id IS DISTINCT FROM v_assignee_uid THEN
        PERFORM public._flowcore_insert_notification(
          p_organization_id,
          v_mgr.user_id,
          'Task "' || left(coalesce(v_title, 'Task'), 200) || '" requires attention (' || p_new_status || ')',
          v_link
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Replace flowcore_update_item_assignee (notifications)
-- ---------------------------------------------------------------------------
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
  v_prev_part uuid;
  v_item_org uuid;
  v_case_id uuid;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
  v_title text;
  v_link text;
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

  SELECT assigned_to, assigned_participant_id, organization_id, case_id, title
  INTO v_prev, v_prev_part, v_item_org, v_case_id, v_title
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

  IF v_prev IS NOT DISTINCT FROM p_assignee AND v_prev_part IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_prev IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev;
  ELSIF v_prev_part IS NOT NULL THEN
    SELECT coalesce(
      (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
      cp.email,
      'External'
    )
    INTO old_label
    FROM public.case_participants cp WHERE cp.id = v_prev_part;
  END IF;

  IF p_assignee IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = p_assignee;
  END IF;

  UPDATE public.items
  SET assigned_to = p_assignee, assigned_participant_id = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_case_id);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF p_assignee IS NOT NULL AND p_assignee IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      p_assignee,
      'You were assigned a task: "' || left(coalesce(v_title, 'Task'), 200) || '"',
      v_link
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Replace flowcore_assign_item_to_participant (notifications)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_assign_item_to_participant(
  p_organization_id uuid,
  p_item_id uuid,
  p_participant_id uuid
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
  v_item_org uuid;
  v_item_case uuid;
  v_prev_user uuid;
  v_prev_part uuid;
  v_part_case uuid;
  v_part_org uuid;
  v_part_email text;
  v_part_user uuid;
  old_label text := 'Unassigned';
  new_label text := 'Unassigned';
  v_item_title text;
  v_link text;
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

  SELECT assigned_to, assigned_participant_id, organization_id, case_id, title
  INTO v_prev_user, v_prev_part, v_item_org, v_item_case, v_item_title
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found');
  END IF;

  IF v_item_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not in this workspace');
  END IF;

  IF p_participant_id IS NULL THEN
    IF v_prev_user IS NOT NULL THEN
      SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev_user;
    ELSIF v_prev_part IS NOT NULL THEN
      SELECT coalesce(
        (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
        cp.email,
        'External'
      )
      INTO old_label
      FROM public.case_participants cp WHERE cp.id = v_prev_part;
    END IF;

    UPDATE public.items
    SET assigned_to = null, assigned_participant_id = null
    WHERE id = p_item_id;

    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (p_item_id, v_uid, 'Assignment', old_label, 'Unassigned', p_organization_id, v_item_case);

    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_item_case IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item must belong to a case to assign a case participant');
  END IF;

  SELECT case_id, organization_id, email, user_id
  INTO v_part_case, v_part_org, v_part_email, v_part_user
  FROM public.case_participants
  WHERE id = p_participant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not found');
  END IF;

  IF v_part_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant not in this workspace');
  END IF;

  IF v_part_case IS DISTINCT FROM v_item_case THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participant does not belong to this item''s case');
  END IF;

  IF v_prev_user IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO old_label FROM public.users WHERE id = v_prev_user;
  ELSIF v_prev_part IS NOT NULL THEN
    SELECT coalesce(
      (SELECT coalesce(u.name, u.email, 'External') FROM public.users u WHERE u.id = cp.user_id),
      cp.email,
      'External'
    )
    INTO old_label
    FROM public.case_participants cp WHERE cp.id = v_prev_part;
  END IF;

  IF v_part_user IS NOT NULL THEN
    SELECT coalesce(name, email, 'User') INTO new_label FROM public.users WHERE id = v_part_user;
  ELSE
    new_label := coalesce(v_part_email, 'External');
  END IF;

  IF v_prev_part IS NOT DISTINCT FROM p_participant_id THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.items
  SET assigned_to = null, assigned_participant_id = p_participant_id
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_item_case);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF v_part_user IS NOT NULL AND v_part_user IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_part_user,
      'You were assigned a task: "' || left(coalesce(v_item_title, 'Task'), 200) || '"',
      v_link
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Replace flowcore_add_comment (notification to assignee)
-- ---------------------------------------------------------------------------
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
  v_case_id uuid;
  v_assignee uuid;
  v_title text;
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

  SELECT organization_id, case_id, title
  INTO v_org, v_case_id, v_title
  FROM public.items WHERE id = p_item_id;
  IF NOT FOUND OR v_org IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not accessible');
  END IF;

  IF NOT public.flowcore_can_read_item(p_item_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not accessible');
  END IF;

  SELECT COALESCE(i.assigned_to, cp.user_id)
  INTO v_assignee
  FROM public.items i
  LEFT JOIN public.case_participants cp ON cp.id = i.assigned_participant_id
  WHERE i.id = p_item_id;

  INSERT INTO public.comments (item_id, user_id, text, organization_id)
  VALUES (p_item_id, v_uid, v_body, p_organization_id)
  RETURNING id INTO v_cid;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Comment added', null, left(v_body, 120), p_organization_id, v_case_id);

  IF v_assignee IS NOT NULL AND v_assignee IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_assignee,
      'New comment on your task: "' || left(coalesce(v_title, 'Task'), 200) || '"',
      public._flowcore_item_link(p_organization_id, p_item_id)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_cid::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Replace flowcore_create_item (assignment notifications)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flowcore_create_item(uuid, text, text, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.flowcore_create_item(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_priority text,
  p_assigned_to uuid,
  p_case_id uuid DEFAULT NULL,
  p_assigned_participant_id uuid DEFAULT NULL
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
  v_case_org uuid;
  v_part_case uuid;
  v_part_org uuid;
  v_part_user uuid;
  v_part_email text;
  v_label text;
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

  IF p_assigned_to IS NOT NULL AND p_assigned_participant_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Assign to either a user or a case participant, not both');
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

  IF p_assigned_to IS NOT NULL THEN
    IF v_wf NOT IN ('admin', 'manager') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
    END IF;
    IF NOT public.flowcore_is_org_member(p_organization_id, p_assigned_to) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Assignee must be a member of this workspace');
    END IF;
  END IF;

  IF p_assigned_participant_id IS NOT NULL THEN
    IF v_wf NOT IN ('admin', 'manager') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only managers and admins can assign work');
    END IF;
    IF p_case_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Case is required when assigning a case participant');
    END IF;
    SELECT case_id, organization_id, user_id, email
    INTO v_part_case, v_part_org, v_part_user, v_part_email
    FROM public.case_participants
    WHERE id = p_assigned_participant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant not found');
    END IF;
    IF v_part_org IS DISTINCT FROM p_organization_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant not in this workspace');
    END IF;
    IF v_part_case IS DISTINCT FROM p_case_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participant does not belong to the selected case');
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
    assigned_participant_id,
    organization_id,
    case_id
  )
  VALUES (
    trim(p_title),
    nullif(trim(p_description), ''),
    nullif(trim(p_type), ''),
    nullif(trim(p_priority), ''),
    'created',
    v_uid,
    p_assigned_to,
    CASE WHEN p_assigned_participant_id IS NOT NULL THEN p_assigned_participant_id ELSE null END,
    p_organization_id,
    p_case_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (v_id, v_uid, 'Item created', null, trim(p_title), p_organization_id, p_case_id);

  IF p_assigned_to IS NOT NULL THEN
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (
      v_id,
      v_uid,
      'Assignment',
      null,
      (SELECT coalesce(name, email, 'User') FROM public.users WHERE id = p_assigned_to),
      p_organization_id,
      p_case_id
    );
  END IF;

  IF p_assigned_participant_id IS NOT NULL THEN
    IF v_part_user IS NOT NULL THEN
      SELECT coalesce(name, email, 'User') INTO v_label FROM public.users WHERE id = v_part_user;
    ELSE
      v_label := coalesce(v_part_email, 'External');
    END IF;
    INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
    VALUES (v_id, v_uid, 'Assignment', null, v_label, p_organization_id, p_case_id);
  END IF;

  IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      p_assigned_to,
      'You were assigned a task: "' || left(trim(p_title), 200) || '"',
      public._flowcore_item_link(p_organization_id, v_id)
    );
  END IF;

  IF p_assigned_participant_id IS NOT NULL AND v_part_user IS NOT NULL AND v_part_user IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_part_user,
      'You were assigned a task: "' || left(trim(p_title), 200) || '"',
      public._flowcore_item_link(p_organization_id, v_id)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_create_notification(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_list_my_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_set_item_due_date(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_send_due_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.flowcore_create_item(uuid, text, text, text, text, uuid, uuid, uuid) TO authenticated;

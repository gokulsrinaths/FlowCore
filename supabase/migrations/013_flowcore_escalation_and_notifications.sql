-- Escalation rules, activity tracking, notification types, grouped case updates, dedup helper, RPC.

-- ---------------------------------------------------------------------------
-- 1. notifications: type, entity_id, metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. items: last_activity_at, escalation_sent_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS escalation_sent_at timestamptz;

UPDATE public.items
SET last_activity_at = coalesce(updated_at, created_at, now())
WHERE last_activity_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. escalation_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('overdue', 'no_progress')),
  delay_minutes int NOT NULL CHECK (delay_minutes >= 0),
  escalate_to_role text NOT NULL CHECK (escalate_to_role IN ('manager', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_org ON public.escalation_rules (organization_id);

ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escalation_rules_select_own_org" ON public.escalation_rules;
CREATE POLICY "escalation_rules_select_own_org"
  ON public.escalation_rules FOR SELECT TO authenticated
  USING (public.flowcore_is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "escalation_rules_write_block" ON public.escalation_rules;
CREATE POLICY "escalation_rules_write_block"
  ON public.escalation_rules FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "escalation_rules_update_block"
  ON public.escalation_rules FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "escalation_rules_delete_block"
  ON public.escalation_rules FOR DELETE TO authenticated USING (false);

-- Default rules per org (one per trigger type)
INSERT INTO public.escalation_rules (organization_id, trigger_type, delay_minutes, escalate_to_role)
SELECT o.id, 'overdue', 0, 'manager'
FROM public.organizations o
ON CONFLICT (organization_id, trigger_type) DO NOTHING;

INSERT INTO public.escalation_rules (organization_id, trigger_type, delay_minutes, escalate_to_role)
SELECT o.id, 'no_progress', 1440, 'manager'
FROM public.organizations o
ON CONFLICT (organization_id, trigger_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public._flowcore_seed_escalation_rules_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.escalation_rules (organization_id, trigger_type, delay_minutes, escalate_to_role)
  VALUES (NEW.id, 'overdue', 0, 'manager'), (NEW.id, 'no_progress', 1440, 'manager')
  ON CONFLICT (organization_id, trigger_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_escalation_rules ON public.organizations;
CREATE TRIGGER trg_organizations_escalation_rules
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE PROCEDURE public._flowcore_seed_escalation_rules_for_org();

-- ---------------------------------------------------------------------------
-- 4. Dedup helper (short window for identical keys)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_dedup_keys (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_dedup_created ON public.notification_dedup_keys (created_at);

CREATE OR REPLACE FUNCTION public._flowcore_should_send_notification(
  p_user_id uuid,
  p_dedup_key text,
  p_window_minutes int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins int;
BEGIN
  IF p_user_id IS NULL OR trim(coalesce(p_dedup_key, '')) = '' THEN
    RETURN true;
  END IF;

  DELETE FROM public.notification_dedup_keys
  WHERE created_at < now() - (greatest(1, coalesce(p_window_minutes, 5)) * interval '1 minute') * 2;

  INSERT INTO public.notification_dedup_keys (user_id, dedup_key)
  VALUES (p_user_id, left(trim(p_dedup_key), 500))
  ON CONFLICT (user_id, dedup_key) DO NOTHING;

  GET DIAGNOSTICS v_ins = ROW_COUNT;
  RETURN v_ins > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Core notification insert (typed)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._flowcore_insert_notification(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public._flowcore_insert_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_message text,
  p_link text,
  p_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
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
  INSERT INTO public.notifications (organization_id, user_id, message, link, type, entity_id, metadata)
  VALUES (
    p_organization_id,
    p_user_id,
    left(p_message, 2000),
    p_link,
    nullif(trim(p_type), ''),
    p_entity_id,
    '{}'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grouped case activity (same user + case within 1h)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._flowcore_merge_case_activity_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_case_id uuid,
  p_case_title text,
  p_link text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nid uuid;
  v_n int;
  v_title text := left(coalesce(nullif(trim(p_case_title), ''), 'Case'), 200);
BEGIN
  IF p_user_id IS NULL OR p_case_id IS NULL THEN
    RETURN;
  END IF;

  SELECT n.id, coalesce((n.metadata->>'n')::int, 1)
  INTO v_nid, v_n
  FROM public.notifications n
  WHERE n.user_id = p_user_id
    AND n.organization_id = p_organization_id
    AND n.read = false
    AND n.type = 'case_activity'
    AND n.entity_id = p_case_id
    AND n.created_at > now() - interval '1 hour'
  ORDER BY n.created_at DESC
  LIMIT 1;

  IF v_nid IS NOT NULL THEN
    v_n := v_n + 1;
    UPDATE public.notifications
    SET
      message = 'You have ' || v_n || ' updates in ' || v_title,
      metadata = jsonb_build_object('n', v_n, 'case_title', p_case_title)
    WHERE id = v_nid;
  ELSE
    INSERT INTO public.notifications (organization_id, user_id, message, link, type, entity_id, metadata)
    VALUES (
      p_organization_id,
      p_user_id,
      'You have 1 update in ' || v_title,
      p_link,
      'case_activity',
      p_case_id,
      jsonb_build_object('n', 1, 'case_title', p_case_title)
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. flowcore_create_notification (optional type + entity)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.flowcore_create_notification(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.flowcore_create_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_message text,
  p_link text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
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
    nullif(trim(p_link), ''),
    p_type,
    p_entity_id
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. flowcore_list_my_notifications
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
          'created_at', n.created_at,
          'type', n.type,
          'entity_id', n.entity_id,
          'metadata', n.metadata
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
-- 9. flowcore_send_due_reminders (typed reminder)
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
        v_link,
        'reminder',
        rec.item_id
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
-- 10. flowcore_run_escalation_checks (service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_run_escalation_checks()
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
  v_overdue_delay int;
  v_np_delay int;
  v_escalate text;
  v_match boolean;
  v_overdue_rule text;
  v_np_rule text;
  v_mgr record;
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
      i.due_date,
      i.last_activity_at,
      o.slug AS org_slug,
      c.title AS case_title
    FROM public.items i
    JOIN public.organizations o ON o.id = i.organization_id
    LEFT JOIN public.cases c ON c.id = i.case_id
    WHERE i.status <> 'completed'
      AND i.escalation_sent_at IS NULL
  LOOP
    v_overdue_delay := coalesce(
      (SELECT er.delay_minutes FROM public.escalation_rules er
       WHERE er.organization_id = rec.organization_id AND er.trigger_type = 'overdue'),
      0
    );
    v_np_delay := coalesce(
      (SELECT er.delay_minutes FROM public.escalation_rules er
       WHERE er.organization_id = rec.organization_id AND er.trigger_type = 'no_progress'),
      1440
    );
    v_overdue_rule := coalesce(
      (SELECT er.escalate_to_role FROM public.escalation_rules er
       WHERE er.organization_id = rec.organization_id AND er.trigger_type = 'overdue'),
      'manager'
    );
    v_np_rule := coalesce(
      (SELECT er.escalate_to_role FROM public.escalation_rules er
       WHERE er.organization_id = rec.organization_id AND er.trigger_type = 'no_progress'),
      'manager'
    );

    v_match := false;
    v_escalate := v_np_rule;

    IF rec.due_date IS NOT NULL
       AND rec.due_date + (v_overdue_delay * interval '1 minute') < now() THEN
      v_match := true;
      v_escalate := v_overdue_rule;
    END IF;

    IF rec.last_activity_at + (v_np_delay * interval '1 minute') < now() THEN
      v_match := true;
      IF rec.due_date IS NOT NULL
         AND rec.due_date + (v_overdue_delay * interval '1 minute') < now() THEN
        v_escalate := v_overdue_rule;
      ELSE
        v_escalate := v_np_rule;
      END IF;
    END IF;

    IF NOT v_match THEN
      CONTINUE;
    END IF;

    v_link := '/' || rec.org_slug || '/items/' || rec.item_id::text;
    v_case_title := rec.case_title;

    FOR v_mgr IN
      SELECT m.user_id
      FROM public.organization_members m
      WHERE m.organization_id = rec.organization_id
        AND (
          (v_escalate = 'manager' AND m.role = 'org_manager')
          OR (v_escalate = 'admin' AND m.role IN ('org_owner', 'org_admin'))
        )
    LOOP
      PERFORM public._flowcore_insert_notification(
        rec.organization_id,
        v_mgr.user_id,
        'Task overdue and requires attention: "' || left(rec.item_title, 200) || '"',
        v_link,
        'escalation',
        rec.item_id
      );

      SELECT email INTO v_to FROM public.users WHERE id = v_mgr.user_id;
      IF v_to IS NOT NULL AND v_to <> '' THEN
        v_emails := v_emails || jsonb_build_array(
          jsonb_build_object(
            'to', v_to,
            'task_title', rec.item_title,
            'case_title', coalesce(v_case_title, ''),
            'link_path', v_link,
            'kind', 'escalation'
          )
        );
      END IF;
    END LOOP;

    UPDATE public.items SET escalation_sent_at = now() WHERE id = rec.item_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'emails', v_emails);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. flowcore_update_item_status (last_activity + typed notifications)
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

  UPDATE public.items
  SET status = p_new_status, last_activity_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Status change', v_old, p_new_status, p_organization_id, v_case_id);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF p_new_status IN ('under_review', 'completed') THEN
    IF v_assignee_uid IS NOT NULL AND v_assignee_uid IS DISTINCT FROM v_uid THEN
      PERFORM public._flowcore_insert_notification(
        p_organization_id,
        v_assignee_uid,
        'Task "' || left(coalesce(v_title, 'Task'), 200) || '" moved to ' || p_new_status,
        v_link,
        'status',
        p_item_id
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
          v_link,
          'status',
          p_item_id
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
-- 12. flowcore_update_item_assignee (reset escalation)
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
  SET
    assigned_to = p_assignee,
    assigned_participant_id = null,
    escalation_sent_at = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_case_id);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF p_assignee IS NOT NULL AND p_assignee IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      p_assignee,
      'You were assigned a task: "' || left(coalesce(v_title, 'Task'), 200) || '"',
      v_link,
      'assignment',
      p_item_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. flowcore_assign_item_to_participant (reset escalation on change)
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
    SET
      assigned_to = null,
      assigned_participant_id = null,
      escalation_sent_at = null
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
  SET
    assigned_to = null,
    assigned_participant_id = p_participant_id,
    escalation_sent_at = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Assignment', old_label, new_label, p_organization_id, v_item_case);

  v_link := public._flowcore_item_link(p_organization_id, p_item_id);

  IF v_part_user IS NOT NULL AND v_part_user IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_part_user,
      'You were assigned a task: "' || left(coalesce(v_item_title, 'Task'), 200) || '"',
      v_link,
      'assignment',
      p_item_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. flowcore_add_comment (merge when case; else comment type)
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
  v_case_title text;
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

  UPDATE public.items SET last_activity_at = now() WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Comment added', null, left(v_body, 120), p_organization_id, v_case_id);

  IF v_assignee IS NOT NULL AND v_assignee IS DISTINCT FROM v_uid THEN
    IF v_case_id IS NOT NULL THEN
      SELECT c.title INTO v_case_title FROM public.cases c WHERE c.id = v_case_id;
      PERFORM public._flowcore_merge_case_activity_notification(
        p_organization_id,
        v_assignee,
        v_case_id,
        v_case_title,
        public._flowcore_item_link(p_organization_id, p_item_id)
      );
    ELSE
      PERFORM public._flowcore_insert_notification(
        p_organization_id,
        v_assignee,
        'New comment on your task: "' || left(coalesce(v_title, 'Task'), 200) || '"',
        public._flowcore_item_link(p_organization_id, p_item_id),
        'comment',
        p_item_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_cid::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. flowcore_create_item (typed + last_activity)
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
    case_id,
    last_activity_at
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
    p_case_id,
    now()
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
      public._flowcore_item_link(p_organization_id, v_id),
      'assignment',
      v_id
    );
  END IF;

  IF p_assigned_participant_id IS NOT NULL AND v_part_user IS NOT NULL AND v_part_user IS DISTINCT FROM v_uid THEN
    PERFORM public._flowcore_insert_notification(
      p_organization_id,
      v_part_user,
      'You were assigned a task: "' || left(trim(p_title), 200) || '"',
      public._flowcore_item_link(p_organization_id, v_id),
      'assignment',
      v_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. flowcore_set_item_due_date (reset escalation)
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
  SET due_date = p_due_date, due_reminder_sent_at = NULL, escalation_sent_at = NULL
  WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 17. flowcore_update_item_details (reset escalation)
-- ---------------------------------------------------------------------------
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
    priority = nullif(trim(p_priority), ''),
    escalation_sent_at = null
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (item_id, user_id, action, old_value, new_value, organization_id, case_id)
  VALUES (p_item_id, v_uid, 'Item updated', 'previous snapshot', v_summary, p_organization_id, rec.case_id);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 18. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.flowcore_create_notification(uuid, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flowcore_run_escalation_checks() TO service_role;

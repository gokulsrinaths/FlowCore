-- Single-round-trip RPCs for dashboard overview and items Kanban board.
-- Keeps JOINs and aggregation in Postgres (India / ap-south-1 colocated with app).

-- ---------------------------------------------------------------------------
-- flowcore_get_dashboard_snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_get_dashboard_snapshot(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_counts jsonb;
  v_assigned int;
  v_workload jsonb;
  v_activity jsonb;
  v_sub jsonb;
  v_cases_total int;
  v_cases_closed int;
  v_recent_cases jsonb;
  v_unlocked jsonb;
  v_questions jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT coalesce(jsonb_object_agg(status::text, cnt), '{}'::jsonb)
  INTO v_counts
  FROM (
    SELECT status, count(*)::int AS cnt
    FROM public.items
    WHERE organization_id = p_organization_id
    GROUP BY status
  ) s;

  SELECT count(*)::int
  INTO v_assigned
  FROM public.items
  WHERE organization_id = p_organization_id
    AND assigned_to = v_uid;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('userId', assigned_to::text, 'count', cnt)
      ORDER BY cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_workload
  FROM (
    SELECT assigned_to, count(*)::int AS cnt
    FROM public.items
    WHERE organization_id = p_organization_id
      AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  ) w;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'item_id', al.item_id,
        'case_id', al.case_id,
        'user_id', al.user_id,
        'action', al.action,
        'old_value', al.old_value,
        'new_value', al.new_value,
        'organization_id', al.organization_id,
        'created_at', al.created_at,
        'user',
        CASE
          WHEN u.id IS NOT NULL THEN
            jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email)
          ELSE NULL
        END
      )
      ORDER BY al.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_activity
  FROM (
    SELECT *
    FROM public.activity_logs
    WHERE organization_id = p_organization_id
    ORDER BY created_at DESC
    LIMIT 8
  ) al
  LEFT JOIN public.users u ON u.id = al.user_id;

  SELECT to_jsonb(s)
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.organization_id = p_organization_id
  LIMIT 1;

  SELECT count(*)::int INTO v_cases_total
  FROM public.cases
  WHERE organization_id = p_organization_id;

  SELECT count(*)::int INTO v_cases_closed
  FROM public.cases
  WHERE organization_id = p_organization_id
    AND status = 'closed';

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(c) || jsonb_build_object('itemCount', coalesce(ic.cnt, 0))
      ORDER BY c.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_cases
  FROM (
    SELECT *
    FROM public.cases
    WHERE organization_id = p_organization_id
    ORDER BY updated_at DESC
    LIMIT 5
  ) c
  LEFT JOIN (
    SELECT case_id, count(*)::int AS cnt
    FROM public.items
    WHERE organization_id = p_organization_id
      AND case_id IS NOT NULL
    GROUP BY case_id
  ) ic ON ic.case_id = c.id;

  v_unlocked := public.flowcore_list_my_unlocked_case_questions(p_organization_id);
  IF coalesce((v_unlocked ->> 'ok')::boolean, false) THEN
    v_questions := coalesce(v_unlocked -> 'questions', '[]'::jsonb);
  ELSE
    v_questions := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'counts_by_status', v_counts,
    'assigned_to_me', v_assigned,
    'workload', v_workload,
    'recent_activity', v_activity,
    'subscription', v_sub,
    'cases_total', v_cases_total,
    'cases_active', v_cases_total - v_cases_closed,
    'recent_cases', v_recent_cases,
    'my_case_questions', v_questions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_get_dashboard_snapshot(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- flowcore_get_items_board_bundle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flowcore_get_items_board_bundle(
  p_organization_id uuid,
  p_case_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_users jsonb;
  v_items jsonb;
  v_cases jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_role := public.flowcore_membership_role(p_organization_id, v_uid);
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(u)
      ORDER BY u.name ASC NULLS LAST, u.email ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_users
  FROM public.organization_members om
  JOIN public.users u ON u.id = om.user_id
  WHERE om.organization_id = p_organization_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'description', i.description,
        'type', i.type,
        'status', i.status,
        'priority', i.priority,
        'created_by', i.created_by,
        'assigned_to', i.assigned_to,
        'assigned_participant_id', i.assigned_participant_id,
        'organization_id', i.organization_id,
        'case_id', i.case_id,
        'due_date', i.due_date,
        'due_reminder_sent_at', i.due_reminder_sent_at,
        'last_activity_at', i.last_activity_at,
        'escalation_sent_at', i.escalation_sent_at,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'assignee',
        CASE
          WHEN au.id IS NOT NULL THEN
            jsonb_build_object('id', au.id, 'name', au.name, 'email', au.email)
          ELSE NULL
        END,
        'assigneeParticipant',
        CASE
          WHEN cp.id IS NOT NULL THEN
            jsonb_build_object(
              'id', cp.id,
              'displayName',
              CASE
                WHEN cp.user_id IS NOT NULL THEN
                  coalesce(cpu.name, cpu.email, 'User')
                ELSE coalesce(cp.email, 'External')
              END,
              'email',
              CASE
                WHEN cp.user_id IS NOT NULL THEN cpu.email
                ELSE cp.email
              END
            )
          ELSE NULL
        END,
        'creator',
        CASE
          WHEN cr.id IS NOT NULL THEN
            jsonb_build_object('id', cr.id, 'name', cr.name, 'email', cr.email)
          ELSE NULL
        END,
        'itemQuestionnaires', coalesce(iq.qs, '[]'::jsonb)
      )
      ORDER BY i.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.items i
  LEFT JOIN public.users au ON au.id = i.assigned_to
  LEFT JOIN public.users cr ON cr.id = i.created_by
  LEFT JOIN public.case_participants cp
    ON cp.id = i.assigned_participant_id
   AND cp.organization_id = i.organization_id
  LEFT JOIN public.users cpu ON cpu.id = cp.user_id
  LEFT JOIN LATERAL (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'item_id', q.item_id,
          'question_text', q.question_text,
          'status', q.status
        )
        ORDER BY q.sort_order
      ),
      '[]'::jsonb
    ) AS qs
    FROM public.item_questionnaires q
    WHERE q.item_id = i.id
      AND q.organization_id = p_organization_id
  ) iq ON true
  WHERE i.organization_id = p_organization_id
    AND (p_case_id IS NULL OR i.case_id = p_case_id);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('id', c.id, 'title', c.title)
      ORDER BY c.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_cases
  FROM public.cases c
  WHERE c.organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'users', v_users,
    'items', v_items,
    'cases', v_cases
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flowcore_get_items_board_bundle(uuid, uuid) TO authenticated;

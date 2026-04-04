import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import type { ItemQuestionnairePreview, ItemWithUsers, UserRow } from "@/types";

export type ItemsBoardBundle = {
  users: UserRow[];
  items: ItemWithUsers[];
  /** Case picker options (id + title only). */
  cases: { id: string; title: string }[];
};

function parseUserRow(raw: Record<string, unknown>): UserRow {
  return {
    id: String(raw.id),
    name: raw.name != null ? String(raw.name) : null,
    email: raw.email != null ? String(raw.email) : null,
    created_at: String(raw.created_at ?? ""),
    department: raw.department != null ? String(raw.department) : undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    onboarding_completed:
      raw.onboarding_completed === undefined
        ? undefined
        : Boolean(raw.onboarding_completed),
  };
}

function parseItemQuestionnaires(raw: unknown): ItemQuestionnairePreview[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((q) => {
    const r = q as Record<string, unknown>;
    return {
      id: String(r.id),
      item_id: String(r.item_id),
      question_text: String(r.question_text ?? ""),
      status: r.status as ItemQuestionnairePreview["status"],
    };
  });
}

function parseItemWithUsers(raw: Record<string, unknown>): ItemWithUsers {
  const assignee = raw.assignee;
  const creator = raw.creator;
  const assigneeParticipant = raw.assigneeParticipant;

  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    description: raw.description != null ? String(raw.description) : null,
    type: raw.type != null ? String(raw.type) : null,
    status: raw.status as ItemWithUsers["status"],
    priority: raw.priority != null ? String(raw.priority) : null,
    created_by: raw.created_by != null ? String(raw.created_by) : null,
    assigned_to: raw.assigned_to != null ? String(raw.assigned_to) : null,
    assigned_participant_id:
      raw.assigned_participant_id != null
        ? String(raw.assigned_participant_id)
        : undefined,
    organization_id: String(raw.organization_id ?? ""),
    case_id: raw.case_id != null ? String(raw.case_id) : undefined,
    due_date: raw.due_date != null ? String(raw.due_date) : undefined,
    due_reminder_sent_at:
      raw.due_reminder_sent_at != null ? String(raw.due_reminder_sent_at) : undefined,
    last_activity_at:
      raw.last_activity_at != null ? String(raw.last_activity_at) : undefined,
    escalation_sent_at:
      raw.escalation_sent_at != null ? String(raw.escalation_sent_at) : undefined,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    assignee:
      assignee != null && typeof assignee === "object"
        ? (() => {
            const a = assignee as Record<string, unknown>;
            return {
              id: String(a.id),
              name: a.name != null ? String(a.name) : null,
              email: a.email != null ? String(a.email) : null,
            };
          })()
        : null,
    assigneeParticipant:
      assigneeParticipant != null && typeof assigneeParticipant === "object"
        ? (() => {
            const p = assigneeParticipant as Record<string, unknown>;
            return {
              id: String(p.id),
              displayName: String(p.displayName ?? ""),
              email: p.email != null ? String(p.email) : null,
            };
          })()
        : null,
    creator:
      creator != null && typeof creator === "object"
        ? (() => {
            const c = creator as Record<string, unknown>;
            return {
              id: String(c.id),
              name: c.name != null ? String(c.name) : null,
              email: c.email != null ? String(c.email) : null,
            };
          })()
        : null,
    itemQuestionnaires: parseItemQuestionnaires(raw.itemQuestionnaires),
  };
}

/**
 * Single RPC: org users + items (with assignees + questionnaire previews) + case titles.
 * Prefer this over fetchItemsWithUsers + fetchUsersForOrg + fetchCasesForOrg.
 */
export const fetchItemsBoardBundle = cache(
  async (
    organizationId: string,
    caseId?: string | null
  ): Promise<ItemsBoardBundle> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_get_items_board_bundle", {
      p_organization_id: organizationId,
      p_case_id: caseId ?? null,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") {
      throw new Error("flowcore_get_items_board_bundle: empty response");
    }
    const o = data as Record<string, unknown>;
    if (o.ok === false) {
      throw new Error(String(o.error ?? "flowcore_get_items_board_bundle failed"));
    }

    const usersRaw = o.users;
    const users: UserRow[] = Array.isArray(usersRaw)
      ? usersRaw.map((u) => parseUserRow(u as Record<string, unknown>))
      : [];

    const itemsRaw = o.items;
    const items: ItemWithUsers[] = Array.isArray(itemsRaw)
      ? itemsRaw.map((it) => parseItemWithUsers(it as Record<string, unknown>))
      : [];

    const casesRaw = o.cases;
    const cases: { id: string; title: string }[] = Array.isArray(casesRaw)
      ? casesRaw.map((c) => {
          const row = c as Record<string, unknown>;
          return { id: String(row.id), title: String(row.title ?? "") };
        })
      : [];

    return { users, items, cases };
  }
);

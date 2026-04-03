import { supabaseErrorToError } from "@/lib/supabase-errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  ActivityLogWithUser,
  CaseParticipant,
  CommentWithUser,
  ItemStatus,
  ItemRow,
  ItemWithUsers,
  UserRow,
} from "@/types";

/** Comments on tasks linked to a case (item-level notes aggregated for case view) */
export type CommentWithUserAndItem = CommentWithUser & { itemTitle: string };

/** Build a quick lookup for user display on cards and detail views */
function userMap(users: UserRow[]) {
  return new Map(users.map((u) => [u.id, u]));
}

async function fetchParticipantRowsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, { id: string; email: string | null; user_id: string | null }>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("case_participants")
    .select("id, email, user_id")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) throw supabaseErrorToError(error);
  const m = new Map<string, { id: string; email: string | null; user_id: string | null }>();
  for (const r of data ?? []) {
    const row = r as { id: string; email: string | null; user_id: string | null };
    m.set(row.id, row);
  }
  return m;
}

function assigneeParticipantFromRow(
  part: { id: string; email: string | null; user_id: string | null },
  users: Map<string, UserRow>
): { id: string; displayName: string; email: string | null } {
  if (part.user_id) {
    const u = users.get(part.user_id);
    return {
      id: part.id,
      displayName: u?.name ?? u?.email ?? "User",
      email: u?.email ?? null,
    };
  }
  return {
    id: part.id,
    displayName: part.email ?? "External",
    email: part.email,
  };
}

/**
 * Org-scoped user list (same-org members only — enforced by RLS).
 */
export async function fetchUsersForOrg(
  organizationId: string
): Promise<UserRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members, error: me } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (me) throw supabaseErrorToError(me);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, created_at, department, description, onboarding_completed")
    .in("id", ids)
    .order("name", { ascending: true });

  if (error) throw supabaseErrorToError(error);
  return (data ?? []) as UserRow[];
}

export async function fetchItemsWithUsers(
  organizationId: string,
  opts?: { caseId?: string | null }
): Promise<ItemWithUsers[]> {
  const supabase = await createSupabaseServerClient();
  let itemQuery = supabase
    .from("items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (opts?.caseId !== undefined) {
    if (opts.caseId === null) {
      itemQuery = itemQuery.is("case_id", null);
    } else {
      itemQuery = itemQuery.eq("case_id", opts.caseId);
    }
  }

  const [{ data: items, error: itemsError }, users] = await Promise.all([
    itemQuery,
    fetchUsersForOrg(organizationId),
  ]);

  if (itemsError) throw supabaseErrorToError(itemsError);

  const map = userMap(users);
  const itemRows = (items ?? []) as ItemRow[];
  const partIds = [
    ...new Set(
      itemRows
        .map((i) => i.assigned_participant_id)
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const partMap = await fetchParticipantRowsByIds(organizationId, partIds);

  return itemRows.map((item) => {
    const row = item as ItemWithUsers;
    const assigneeParticipant = row.assigned_participant_id
      ? assigneeParticipantFromRow(
          partMap.get(row.assigned_participant_id) ?? {
            id: row.assigned_participant_id,
            email: null,
            user_id: null,
          },
          map
        )
      : null;

    return {
      ...row,
      assignee: row.assigned_to ? map.get(row.assigned_to) ?? null : null,
      assigneeParticipant,
      creator: row.created_by ? map.get(row.created_by) ?? null : null,
    };
  });
}

export async function fetchItemById(
  organizationId: string,
  id: string
): Promise<ItemWithUsers | null> {
  const supabase = await createSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (itemError) throw supabaseErrorToError(itemError);
  if (!item) return null;

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);
  const row = item as ItemWithUsers;

  let assigneeParticipant: ItemWithUsers["assigneeParticipant"] = null;
  if (row.assigned_participant_id) {
    const pm = await fetchParticipantRowsByIds(organizationId, [row.assigned_participant_id]);
    const pr = pm.get(row.assigned_participant_id);
    if (pr) {
      assigneeParticipant = assigneeParticipantFromRow(pr, map);
    }
  }

  return {
    ...row,
    assignee: row.assigned_to ? map.get(row.assigned_to) ?? null : null,
    assigneeParticipant,
    creator: row.created_by ? map.get(row.created_by) ?? null : null,
  };
}

export async function fetchCaseParticipants(
  organizationId: string,
  caseId: string
): Promise<CaseParticipant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("flowcore_list_case_participants", {
    p_organization_id: organizationId,
    p_case_id: caseId,
  });

  if (error) throw supabaseErrorToError(error);
  if (data == null || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  if (o.ok === false) return [];
  const raw = o.participants;
  if (!Array.isArray(raw)) return [];
  return raw as CaseParticipant[];
}

export async function fetchActivityForItem(
  organizationId: string,
  itemId: string
): Promise<ActivityLogWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data: logs, error: logsError } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (logsError) throw supabaseErrorToError(logsError);

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);

  return (logs ?? []).map((log) => {
    const row = log as ActivityLogWithUser;
    return {
      ...row,
      user: row.user_id ? map.get(row.user_id) ?? null : null,
    };
  });
}

export async function fetchCommentsForCase(
  organizationId: string,
  caseId: string
): Promise<CommentWithUserAndItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: itemRows, error: ie } = await supabase
    .from("items")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId);

  if (ie) throw supabaseErrorToError(ie);

  const itemMap = new Map(
    (itemRows ?? []).map((r) => [r.id as string, (r as { title: string }).title])
  );
  const ids = [...itemMap.keys()];
  if (ids.length === 0) return [];

  const { data: comments, error: ce } = await supabase
    .from("comments")
    .select("*")
    .eq("organization_id", organizationId)
    .in("item_id", ids)
    .order("created_at", { ascending: false });

  if (ce) throw supabaseErrorToError(ce);

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);

  return (comments ?? []).map((c) => {
    const row = c as CommentWithUser;
    return {
      ...row,
      user: row.user_id ? map.get(row.user_id) ?? null : null,
      itemTitle: itemMap.get(row.item_id) ?? "Task",
    };
  });
}

export async function fetchCommentsForItem(
  organizationId: string,
  itemId: string
): Promise<CommentWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data: comments, error: ce } = await supabase
    .from("comments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (ce) throw supabaseErrorToError(ce);

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);

  return (comments ?? []).map((c) => {
    const row = c as CommentWithUser;
    return {
      ...row,
      user: row.user_id ? map.get(row.user_id) ?? null : null,
    };
  });
}

export async function countItemsByStatus(
  organizationId: string
): Promise<Record<ItemStatus, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("items")
    .select("status")
    .eq("organization_id", organizationId);

  if (error) throw supabaseErrorToError(error);

  const base: Record<ItemStatus, number> = {
    created: 0,
    in_progress: 0,
    under_review: 0,
    completed: 0,
  };

  for (const row of data ?? []) {
    const s = (row as { status: ItemStatus }).status;
    if (s in base) base[s] += 1;
  }

  return base;
}

export async function countAssignedToUser(
  organizationId: string,
  userId: string
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("assigned_to", userId);

  if (error) throw supabaseErrorToError(error);
  return count ?? 0;
}

/** Team workload: count per assignee in org */
export async function countItemsByAssignee(
  organizationId: string
): Promise<{ userId: string; count: number }[]> {
  const items = await fetchItemsWithUsers(organizationId);
  const map = new Map<string, number>();
  for (const it of items) {
    const aid = it.assigned_to;
    if (!aid) continue;
    map.set(aid, (map.get(aid) ?? 0) + 1);
  }
  return [...map.entries()].map(([userId, count]) => ({ userId, count }));
}

export type ActivityFeedFilters = {
  userId?: string;
  action?: string;
  itemId?: string;
  caseId?: string;
  from?: string;
  to?: string;
};

export async function fetchActivityForOrg(
  organizationId: string,
  opts: { limit?: number; filters?: ActivityFeedFilters } = {}
): Promise<ActivityLogWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 100;
  let q = supabase
    .from("activity_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const f = opts.filters;
  if (f?.userId) q = q.eq("user_id", f.userId);
  if (f?.action) q = q.eq("action", f.action);
  if (f?.itemId) q = q.eq("item_id", f.itemId);
  if (f?.caseId) q = q.eq("case_id", f.caseId);
  if (f?.from) q = q.gte("created_at", f.from);
  if (f?.to) q = q.lte("created_at", f.to);

  const { data: logs, error: logsError } = await q;

  if (logsError) throw supabaseErrorToError(logsError);

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);

  return (logs ?? []).map((log) => {
    const row = log as ActivityLogWithUser;
    return {
      ...row,
      user: row.user_id ? map.get(row.user_id) ?? null : null,
    };
  });
}

/** System-level audit for org (role changes, deletes) — org_admin+ via RLS */
export async function fetchOrgSystemAuditLogs(
  organizationId: string,
  limit = 40
): Promise<ActivityLogWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data: logs, error: logsError } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .is("item_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (logsError) throw supabaseErrorToError(logsError);

  const users = await fetchUsersForOrg(organizationId);
  const map = userMap(users);

  return (logs ?? []).map((log) => {
    const row = log as ActivityLogWithUser;
    return {
      ...row,
      user: row.user_id ? map.get(row.user_id) ?? null : null,
    };
  });
}

export type SearchResult =
  | { type: "item"; id: string; title: string; status: string }
  | { type: "comment"; id: string; snippet: string; item_id: string }
  | { type: "user"; id: string; name: string | null; email: string | null };

export async function searchOrg(
  organizationId: string,
  query: string
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createSupabaseServerClient();
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;

  const [titleHits, descHits, commentsRes, users] = await Promise.all([
    supabase
      .from("items")
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .ilike("title", pattern)
      .limit(20),
    supabase
      .from("items")
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .ilike("description", pattern)
      .limit(20),
    supabase
      .from("comments")
      .select("id, text, item_id")
      .eq("organization_id", organizationId)
      .ilike("text", pattern)
      .limit(20),
    fetchUsersForOrg(organizationId),
  ]);

  const seenItems = new Set<string>();
  const results: SearchResult[] = [];

  for (const row of [...(titleHits.data ?? []), ...(descHits.data ?? [])]) {
    const id = row.id as string;
    if (seenItems.has(id)) continue;
    seenItems.add(id);
    results.push({
      type: "item",
      id,
      title: row.title as string,
      status: row.status as string,
    });
  }
  for (const row of commentsRes.data ?? []) {
    const t = (row.text as string).slice(0, 120);
    results.push({
      type: "comment",
      id: row.id as string,
      snippet: t,
      item_id: row.item_id as string,
    });
  }
  const ql = q.toLowerCase();
  for (const u of users) {
    const n = (u.name ?? "").toLowerCase();
    const e = (u.email ?? "").toLowerCase();
    if (n.includes(ql) || e.includes(ql)) {
      results.push({ type: "user", id: u.id, name: u.name, email: u.email });
    }
  }

  return results.slice(0, 50);
}

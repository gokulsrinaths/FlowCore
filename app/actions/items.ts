"use server";

import { revalidatePath } from "next/cache";
import { sendAssignmentEmailsSideEffect } from "@/lib/item-assignment-emails";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import { canCreateItem } from "@/lib/usage";
import type { ItemStatus } from "@/types";

export type ItemActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function catchErr(e: unknown): ItemActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

async function fetchItemCaseId(
  organizationId: string,
  itemId: string
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("items")
    .select("case_id")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as { case_id: string | null } | null)?.case_id ?? null;
}

/** Revalidates org views; pass `caseIdKnown` after delete (row gone) or when already known */
async function revalidateItemRelatedPaths(
  orgSlug: string,
  organizationId: string,
  itemId: string,
  caseIdKnown?: string | null
) {
  revalidatePath(`/${orgSlug}/items`);
  revalidatePath(`/${orgSlug}/dashboard`);
  revalidatePath(`/${orgSlug}/activity`);
  revalidatePath(`/${orgSlug}/cases`);
  const cid =
    caseIdKnown !== undefined
      ? caseIdKnown
      : await fetchItemCaseId(organizationId, itemId);
  if (cid) revalidatePath(`/${orgSlug}/cases/${cid}`);
}

function revalidateOrgPaths(orgSlug: string, caseId?: string | null) {
  revalidatePath(`/${orgSlug}/items`);
  revalidatePath(`/${orgSlug}/dashboard`);
  revalidatePath(`/${orgSlug}/activity`);
  revalidatePath(`/${orgSlug}/cases`);
  if (caseId) revalidatePath(`/${orgSlug}/cases/${caseId}`);
}

export async function createItem(formData: FormData): Promise<ItemActionResult> {
  try {
    const orgId = String(formData.get("organization_id") ?? "").trim();
    const orgSlug = String(formData.get("org_slug") ?? "").trim();
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Unauthorized" };
    if (!orgId) return { ok: false, error: "Missing organization" };

    const usage = await canCreateItem(orgId);
    if (!usage.ok) return { ok: false, error: usage.error };

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim();
    const priority = String(formData.get("priority") ?? "").trim();
    const legacyAssigned = String(formData.get("assigned_to") ?? "").trim();
    const caseRaw = String(formData.get("case_id") ?? "").trim();
    const p_case_id = caseRaw ? caseRaw : null;

    const assignRaw = String(formData.get("assignment") ?? "").trim();
    let p_assigned_to: string | null = null;
    let p_assigned_participant_id: string | null = null;
    if (assignRaw.startsWith("u:")) {
      p_assigned_to = assignRaw.slice(2);
    } else if (assignRaw.startsWith("p:")) {
      p_assigned_participant_id = assignRaw.slice(2);
    } else if (legacyAssigned) {
      p_assigned_to = legacyAssigned;
    }

    const { data, error } = await supabase.rpc("flowcore_create_item", {
      p_organization_id: orgId,
      p_title: title,
      p_description: description,
      p_type: type,
      p_priority: priority,
      p_assigned_to,
      p_case_id,
      p_assigned_participant_id,
    });

    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    if (orgSlug) {
      revalidateOrgPaths(orgSlug, p_case_id ?? undefined);
    }
    if (r.id && orgSlug) {
      try {
        await sendAssignmentEmailsSideEffect(
          supabase,
          orgId,
          orgSlug,
          r.id,
          user.id
        );
      } catch {
        /* optional email — do not fail create */
      }
    }
    return { ok: true, id: r.id };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateItemStatus(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  next: ItemStatus
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_item_status", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_new_status: next,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateItemAssignee(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  assigneeId: string | null
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_item_assignee", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_assignee: assigneeId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await sendAssignmentEmailsSideEffect(
          supabase,
          organizationId,
          orgSlug,
          itemId,
          user.id
        );
      }
    } catch {
      /* optional email */
    }
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

/** Assign item to a case participant (external email or internal roster); pass null to clear assignment */
export async function assignItemToParticipant(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  participantId: string | null
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_assign_item_to_participant", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_participant_id: participantId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && participantId) {
        await sendAssignmentEmailsSideEffect(
          supabase,
          organizationId,
          orgSlug,
          itemId,
          user.id
        );
      }
    } catch {
      /* optional email */
    }
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function setItemDueDate(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  dueDateIso: string | null
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_set_item_due_date", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_due_date: dueDateIso,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateItemDetails(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  input: {
    title: string;
    description: string;
    type: string;
    priority: string;
  }
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_item_details", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_title: input.title,
      p_description: input.description,
      p_type: input.type,
      p_priority: input.priority,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function deleteItem(
  organizationId: string,
  orgSlug: string,
  itemId: string
): Promise<ItemActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const caseId = await fetchItemCaseId(organizationId, itemId);
    const { data, error } = await supabase.rpc("flowcore_delete_item", {
      p_organization_id: organizationId,
      p_item_id: itemId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    await revalidateItemRelatedPaths(orgSlug, organizationId, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

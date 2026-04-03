"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { NotificationRow } from "@/types";

function rpcOk(data: unknown): { ok: boolean; error?: string } {
  if (data == null || typeof data !== "object") return { ok: false, error: "Invalid" };
  const o = data as Record<string, unknown>;
  if (o.ok === false) return { ok: false, error: String(o.error ?? "Failed") };
  return { ok: true };
}

export type NotificationsResult =
  | {
      ok: true;
      notifications: NotificationRow[];
      unreadCount: number;
      /** Pending workspace/case invitations (separate from in-app notification rows). */
      pendingInvitationCount: number;
    }
  | { ok: false; error: string };

function parseNotificationList(data: unknown): NotificationRow[] {
  if (data == null || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = o.notifications;
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => {
    const x = n as Record<string, unknown>;
    const meta = x.metadata;
    return {
      id: String(x.id),
      organization_id: String(x.organization_id),
      message: String(x.message ?? ""),
      link: x.link != null ? String(x.link) : null,
      read: Boolean(x.read),
      created_at: String(x.created_at ?? ""),
      type: x.type != null && x.type !== "" ? String(x.type) : null,
      entity_id: x.entity_id != null ? String(x.entity_id) : null,
      metadata:
        meta != null && typeof meta === "object" && !Array.isArray(meta)
          ? (meta as Record<string, unknown>)
          : null,
    };
  });
}

export async function fetchNotificationsAction(
  limit = 50
): Promise<NotificationsResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const [
      { data: listData, error: le },
      { data: countData, error: ce },
      { data: invCountData, error: ie },
    ] = await Promise.all([
      supabase.rpc("flowcore_list_my_notifications", { p_limit: limit }),
      supabase.rpc("flowcore_notification_unread_count"),
      supabase.rpc("flowcore_count_my_pending_invitations"),
    ]);
    if (le) return { ok: false, error: le.message };
    if (ce) return { ok: false, error: ce.message };
    if (ie) return { ok: false, error: ie.message };
    const lr = rpcOk(listData);
    if (!lr.ok) return { ok: false, error: lr.error ?? "Failed" };
    const cr = rpcOk(countData);
    if (!cr.ok) return { ok: false, error: cr.error ?? "Failed" };
    const ir = rpcOk(invCountData);
    if (!ir.ok) return { ok: false, error: ir.error ?? "Failed" };
    const co = countData as Record<string, unknown> | null;
    const unread =
      typeof co?.count === "number"
        ? co.count
        : Number((co as { count?: string })?.count ?? 0);
    const ico = invCountData as Record<string, unknown> | null;
    const pendingInvitationCount =
      typeof ico?.count === "number"
        ? ico.count
        : Number((ico as { count?: string })?.count ?? 0);
    return {
      ok: true,
      notifications: parseNotificationList(listData),
      unreadCount: unread,
      pendingInvitationCount,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

export async function markNotificationReadAction(
  notificationId: string,
  orgSlug?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_mark_notification_read", {
      p_notification_id: notificationId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    if (orgSlug) revalidatePath(`/${orgSlug}`, "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

export async function markAllNotificationsReadAction(
  orgSlug?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_mark_all_notifications_read");
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    if (orgSlug) revalidatePath(`/${orgSlug}`, "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

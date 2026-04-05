import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Assignment notifications are in-app only (see `flowcore_assign_item_to_participant`).
 * Kept as a no-op for call sites that previously sent email.
 */
export async function sendAssignmentEmailsSideEffect(
  supabase: SupabaseClient,
  organizationId: string,
  orgSlug: string,
  itemId: string,
  actorUserId: string
): Promise<void> {
  void supabase;
  void organizationId;
  void orgSlug;
  void itemId;
  void actorUserId;
}

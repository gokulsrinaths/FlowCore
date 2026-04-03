import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Assignment notifications are in-app only (see `flowcore_assign_item_to_participant`).
 * Kept as a no-op for call sites that previously sent email.
 */
export async function sendAssignmentEmailsSideEffect(
  _supabase: SupabaseClient,
  _organizationId: string,
  _orgSlug: string,
  _itemId: string,
  _actorUserId: string
): Promise<void> {}

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl, sendTaskAssignmentEmail } from "@/lib/email";

/**
 * After assignment RPCs succeed, notify assignees by email (internal + external).
 * Skips self-assignment. Server-only.
 */
export async function sendAssignmentEmailsSideEffect(
  supabase: SupabaseClient,
  organizationId: string,
  orgSlug: string,
  itemId: string,
  actorUserId: string
): Promise<void> {
  const base = getAppBaseUrl();
  const abs = (path: string) => `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const sent = new Set<string>();

  const { data: item, error: ie } = await supabase
    .from("items")
    .select("title, assigned_to, assigned_participant_id, case_id")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (ie || !item) return;

  const title = (item as { title: string }).title || "Task";
  let caseTitle = "—";
  const caseId = (item as { case_id: string | null }).case_id;
  if (caseId) {
    const { data: c } = await supabase
      .from("cases")
      .select("title")
      .eq("id", caseId)
      .maybeSingle();
    if (c?.title) caseTitle = String(c.title);
  }

  const link = abs(`/${orgSlug}/items/${itemId}`);
  const row = item as {
    assigned_to: string | null;
    assigned_participant_id: string | null;
  };

  if (row.assigned_to && row.assigned_to !== actorUserId) {
    const { data: u } = await supabase
      .from("users")
      .select("email")
      .eq("id", row.assigned_to)
      .maybeSingle();
    const em = (u as { email: string | null } | null)?.email;
    if (em && !sent.has(em.toLowerCase())) {
      sent.add(em.toLowerCase());
      await sendTaskAssignmentEmail({
        to: em,
        taskTitle: title,
        caseTitle,
        link,
      });
    }
  }

  if (row.assigned_participant_id) {
    const { data: p } = await supabase
      .from("case_participants")
      .select("user_id, email")
      .eq("id", row.assigned_participant_id)
      .maybeSingle();
    const part = p as { user_id: string | null; email: string | null } | null;
    if (!part) return;
    if (part.user_id) {
      if (part.user_id === actorUserId) return;
      const { data: u } = await supabase
        .from("users")
        .select("email")
        .eq("id", part.user_id)
        .maybeSingle();
      const em = (u as { email: string | null } | null)?.email;
      if (em && !sent.has(em.toLowerCase())) {
        sent.add(em.toLowerCase());
        await sendTaskAssignmentEmail({
          to: em,
          taskTitle: title,
          caseTitle,
          link,
        });
      }
    } else if (part.email) {
      const em = part.email.trim().toLowerCase();
      if (!sent.has(em)) {
        sent.add(em);
        await sendTaskAssignmentEmail({
          to: part.email,
          taskTitle: title,
          caseTitle,
          link,
        });
      }
    }
  }
}

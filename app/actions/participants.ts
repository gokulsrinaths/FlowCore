"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchCaseParticipants } from "@/lib/db";
import { fetchCaseById } from "@/lib/cases";
import { getAppBaseUrl, sendInviteEmail } from "@/lib/email";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { OrgRole } from "@/types";

export type ParticipantActionResult = { ok: true } | { ok: false; error: string };

/** For client components: load roster for assignment dropdown */
export async function listCaseParticipantsAction(
  organizationId: string,
  caseId: string
) {
  return fetchCaseParticipants(organizationId, caseId);
}

export async function addCaseParticipantAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  input: { userId?: string | null; email?: string | null; note?: string | null }
): Promise<ParticipantActionResult & { id?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_add_case_participant", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_user_id: input.userId ?? null,
      p_email: input.email?.trim() ?? null,
      p_note: input.note?.trim() ?? null,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(`/${orgSlug}/cases/${caseId}`);
    revalidatePath(`/${orgSlug}/items`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function logRequisitionEmailAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  email: string,
  description: string
): Promise<ParticipantActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_log_requisition_email", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_email: email.trim(),
      p_description: description.trim(),
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(`/${orgSlug}/cases/${caseId}`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createCaseInvitationAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  email: string,
  role: OrgRole | null = null
): Promise<
  ParticipantActionResult & {
    token?: string;
    emailSent?: boolean;
    emailError?: string;
  }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const trimmedEmail = email.trim();
    const { data, error } = await supabase.rpc("flowcore_create_case_invitation", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_email: trimmedEmail,
      p_role: role,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    const token = (r as { token?: string }).token;
    let emailSent: boolean | undefined;
    let emailError: string | undefined;
    if (token) {
      const [{ data: orgRow }, caseRow] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
        fetchCaseById(organizationId, caseId),
      ]);
      const base = getAppBaseUrl();
      const inviteLink = `${base}/invite/${token}`;
      const send = await sendInviteEmail({
        to: trimmedEmail,
        inviteLink,
        caseTitle: caseRow?.title?.trim() ? caseRow.title : "Case",
        orgName: (orgRow?.name as string | undefined)?.trim()
          ? String(orgRow?.name)
          : "Workspace",
      });
      emailSent = send.ok;
      if (!send.ok) {
        emailError = send.error;
        console.warn("[createCaseInvitationAction] Email:", send.error);
      }
    }
    revalidatePath(`/${orgSlug}/cases/${caseId}`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true, token, emailSent, emailError };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addRequisitionFlowAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  email: string,
  description: string
): Promise<ParticipantActionResult> {
  const inv = await createCaseInvitationAction(
    organizationId,
    orgSlug,
    caseId,
    email,
    "org_worker"
  );
  if (!inv.ok) return inv;
  if (description.trim()) {
    const log = await logRequisitionEmailAction(
      organizationId,
      orgSlug,
      caseId,
      email,
      description
    );
    if (!log.ok) return log;
  }
  return { ok: true };
}

export async function removeCaseParticipantAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  participantId: string
): Promise<ParticipantActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_remove_case_participant", {
      p_organization_id: organizationId,
      p_participant_id: participantId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(`/${orgSlug}/cases/${caseId}`);
    revalidatePath(`/${orgSlug}/items`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

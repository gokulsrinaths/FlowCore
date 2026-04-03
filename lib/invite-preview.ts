import { createSupabaseServerClient } from "@/lib/supabase-server";

export type InvitationPreview =
  | {
      ok: true;
      organizationName: string;
      caseTitle: string | null;
      email: string;
      hasCase: boolean;
    }
  | {
      ok: false;
      error: string;
      accepted?: boolean;
    };

function parsePreviewRpc(data: unknown): InvitationPreview {
  if (data == null || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const o = data as Record<string, unknown>;
  if (o.ok === false || o.ok === "false") {
    return {
      ok: false,
      error: String(o.error ?? "Unknown error"),
      accepted: o.accepted === true,
    };
  }
  if (o.ok === true || o.ok === "true") {
    return {
      ok: true,
      organizationName: String(o.organization_name ?? ""),
      caseTitle: (o.case_title as string | null) ?? null,
      email: String(o.email ?? ""),
      hasCase: Boolean(o.has_case),
    };
  }
  return { ok: false, error: "Invalid response" };
}

export async function fetchInvitationPreview(
  token: string
): Promise<InvitationPreview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("flowcore_get_invitation_preview", {
    p_token: token.trim(),
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return parsePreviewRpc(data);
}

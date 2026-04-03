"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";

export type CommentActionResult = { ok: true } | { ok: false; error: string };

function catchErr(e: unknown): CommentActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

export async function addComment(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  text: string
): Promise<CommentActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_add_comment", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_text: text,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/items/${itemId}`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function deleteComment(
  organizationId: string,
  orgSlug: string,
  commentId: string,
  itemId: string
): Promise<CommentActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_delete_comment", {
      p_organization_id: organizationId,
      p_comment_id: commentId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/items/${itemId}`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

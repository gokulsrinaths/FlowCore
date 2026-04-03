"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import { requireAuthUser } from "@/lib/auth";

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(
  formData: FormData
): Promise<OnboardingActionResult> {
  try {
    await requireAuthUser();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_complete_onboarding", {
      p_name: String(formData.get("name") ?? "").trim(),
      p_department: String(formData.get("department") ?? "").trim(),
      p_description: String(formData.get("description") ?? "").trim(),
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath("/onboarding");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

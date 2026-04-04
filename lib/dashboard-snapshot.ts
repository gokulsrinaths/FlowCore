import { cache } from "react";
import { parseMyUnlockedCaseQuestionRows } from "@/lib/case-questions";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import { STATUS_ORDER } from "@/lib/permissions";
import type { CaseWithItemCount } from "@/lib/cases";
import type {
  ActivityLogWithUser,
  CaseRow,
  ItemStatus,
  MyCaseQuestionRow,
} from "@/types";

export type DashboardSnapshot = {
  countsByStatus: Record<ItemStatus, number>;
  assignedToMe: number;
  workload: { userId: string; count: number }[];
  recentActivity: ActivityLogWithUser[];
  subscription: { plan: string; status: string } | null;
  caseCounts: { total: number; active: number };
  recentCases: CaseWithItemCount[];
  myCaseQuestions: MyCaseQuestionRow[];
};

function emptyCounts(): Record<ItemStatus, number> {
  return {
    created: 0,
    in_progress: 0,
    under_review: 0,
    completed: 0,
  };
}

function parseActivityRow(raw: Record<string, unknown>): ActivityLogWithUser {
  const userRaw = raw.user;
  const user =
    userRaw != null && typeof userRaw === "object"
      ? (() => {
          const u = userRaw as Record<string, unknown>;
          return {
            id: String(u.id),
            name: u.name != null ? String(u.name) : null,
            email: u.email != null ? String(u.email) : null,
          };
        })()
      : null;

  return {
    id: String(raw.id),
    item_id: raw.item_id != null ? String(raw.item_id) : null,
    case_id: raw.case_id != null ? String(raw.case_id) : undefined,
    user_id: raw.user_id != null ? String(raw.user_id) : null,
    action: String(raw.action ?? ""),
    old_value: raw.old_value != null ? String(raw.old_value) : null,
    new_value: raw.new_value != null ? String(raw.new_value) : null,
    organization_id: String(raw.organization_id ?? ""),
    created_at: String(raw.created_at ?? ""),
    user: user ?? undefined,
  };
}

/** One RPC replaces 8+ parallel Supabase calls on the dashboard overview. */
export const fetchDashboardSnapshot = cache(
  async (organizationId: string): Promise<DashboardSnapshot> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_get_dashboard_snapshot", {
      p_organization_id: organizationId,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") {
      throw new Error("flowcore_get_dashboard_snapshot: empty response");
    }
    const o = data as Record<string, unknown>;
    if (o.ok === false) {
      throw new Error(String(o.error ?? "flowcore_get_dashboard_snapshot failed"));
    }

    const countsRaw = o.counts_by_status;
    const merged = emptyCounts();
    if (countsRaw != null && typeof countsRaw === "object" && !Array.isArray(countsRaw)) {
      for (const s of STATUS_ORDER) {
        const v = (countsRaw as Record<string, unknown>)[s];
        if (typeof v === "number") merged[s] = v;
      }
    }

    const workloadRaw = o.workload;
    const workload: { userId: string; count: number }[] = [];
    if (Array.isArray(workloadRaw)) {
      for (const w of workloadRaw) {
        if (w == null || typeof w !== "object") continue;
        const row = w as Record<string, unknown>;
        workload.push({
          userId: String(row.userId ?? ""),
          count: Number(row.count ?? 0),
        });
      }
    }

    const activityRaw = o.recent_activity;
    const recentActivity: ActivityLogWithUser[] = Array.isArray(activityRaw)
      ? activityRaw.map((a) => parseActivityRow(a as Record<string, unknown>))
      : [];

    let subscription: { plan: string; status: string } | null = null;
    const subRaw = o.subscription;
    if (subRaw != null && typeof subRaw === "object" && !Array.isArray(subRaw)) {
      const s = subRaw as Record<string, unknown>;
      subscription = {
        plan: String(s.plan ?? "free"),
        status: String(s.status ?? "active"),
      };
    }

    const recentCasesRaw = o.recent_cases;
    const recentCases: CaseWithItemCount[] = Array.isArray(recentCasesRaw)
      ? recentCasesRaw.map((c) => {
          const row = c as Record<string, unknown>;
          return {
            ...(row as unknown as CaseRow),
            itemCount: Number(row.itemCount ?? row.item_count ?? 0),
          };
        })
      : [];

    const questionsRaw = o.my_case_questions;
    const myCaseQuestions = Array.isArray(questionsRaw)
      ? parseMyUnlockedCaseQuestionRows(questionsRaw)
      : [];

    return {
      countsByStatus: merged,
      assignedToMe: Number(o.assigned_to_me ?? 0),
      workload,
      recentActivity,
      subscription,
      caseCounts: {
        total: Number(o.cases_total ?? 0),
        active: Number(o.cases_active ?? 0),
      },
      recentCases,
      myCaseQuestions,
    };
  }
);

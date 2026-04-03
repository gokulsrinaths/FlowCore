import { NextResponse } from "next/server";
import {
  getAppBaseUrl,
  sendDueReminderEmail,
  sendEscalationEmail,
} from "@/lib/email";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

type ReminderEmailRow = {
  to?: string;
  task_title?: string;
  case_title?: string;
  link_path?: string;
  kind?: string;
};

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1] === secret;
}

function absLink(base: string, path: string) {
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function sendReminderEmails(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  base: string
) {
  const { data, error } = await supabase.rpc("flowcore_send_due_reminders");
  if (error) {
    return { ok: false as const, error: error.message, count: 0, emailsSent: 0 };
  }
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) {
    return {
      ok: false as const,
      error: String(o?.error ?? "RPC failed"),
      count: 0,
      emailsSent: 0,
    };
  }
  const rawEmails = o.emails;
  const list: ReminderEmailRow[] = Array.isArray(rawEmails)
    ? (rawEmails as ReminderEmailRow[])
    : [];

  for (const row of list) {
    const to = row.to?.trim();
    if (!to) continue;
    const taskTitle = row.task_title ?? "Task";
    const caseTitle = row.case_title ?? "—";
    const path = row.link_path?.startsWith("/") ? row.link_path : `/${row.link_path ?? ""}`;
    await sendDueReminderEmail({
      to,
      taskTitle,
      caseTitle,
      link: absLink(base, path),
    });
  }

  return {
    ok: true as const,
    count: typeof o.count === "number" ? o.count : Number(o.count ?? 0),
    emailsSent: list.length,
  };
}

async function runEscalationAndEmails(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  base: string
) {
  const { data, error } = await supabase.rpc("flowcore_run_escalation_checks");
  if (error) {
    return { ok: false as const, error: error.message, count: 0, emailsSent: 0 };
  }
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) {
    return {
      ok: false as const,
      error: String(o?.error ?? "Escalation RPC failed"),
      count: 0,
      emailsSent: 0,
    };
  }
  const rawEmails = o.emails;
  const list: ReminderEmailRow[] = Array.isArray(rawEmails)
    ? (rawEmails as ReminderEmailRow[])
    : [];

  for (const row of list) {
    if (row.kind !== "escalation") continue;
    const to = row.to?.trim();
    if (!to) continue;
    const taskTitle = row.task_title ?? "Task";
    const caseTitle = row.case_title ?? "—";
    const path = row.link_path?.startsWith("/") ? row.link_path : `/${row.link_path ?? ""}`;
    await sendEscalationEmail({
      to,
      taskTitle,
      caseTitle,
      link: absLink(base, path),
    });
  }

  return {
    ok: true as const,
    count: typeof o.count === "number" ? o.count : Number(o.count ?? 0),
    emailsSent: list.filter((r) => r.kind === "escalation").length,
  };
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const base = getAppBaseUrl();

  const reminders = await sendReminderEmails(supabase, base);
  if (!reminders.ok) {
    return NextResponse.json(
      { ok: false, step: "reminders", error: reminders.error },
      { status: 500 }
    );
  }

  const escalation = await runEscalationAndEmails(supabase, base);
  if (!escalation.ok) {
    return NextResponse.json(
      { ok: false, step: "escalation", error: escalation.error, reminders },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reminders: {
      itemsProcessed: reminders.count,
      emailsSent: reminders.emailsSent,
    },
    escalation: {
      itemsProcessed: escalation.count,
      emailsSent: escalation.emailsSent,
    },
  });
}

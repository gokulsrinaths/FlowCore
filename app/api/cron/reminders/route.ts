import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1] === secret;
}

async function runDueReminders(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>
) {
  const { data, error } = await supabase.rpc("flowcore_send_due_reminders");
  if (error) {
    return { ok: false as const, error: error.message, count: 0 };
  }
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) {
    return {
      ok: false as const,
      error: String(o?.error ?? "RPC failed"),
      count: 0,
    };
  }
  return {
    ok: true as const,
    count: typeof o.count === "number" ? o.count : Number(o.count ?? 0),
  };
}

async function runEscalation(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>
) {
  const { data, error } = await supabase.rpc("flowcore_run_escalation_checks");
  if (error) {
    return { ok: false as const, error: error.message, count: 0 };
  }
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) {
    return {
      ok: false as const,
      error: String(o?.error ?? "Escalation RPC failed"),
      count: 0,
    };
  }
  return {
    ok: true as const,
    count: typeof o.count === "number" ? o.count : Number(o.count ?? 0),
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

  const reminders = await runDueReminders(supabase);
  if (!reminders.ok) {
    return NextResponse.json(
      { ok: false, step: "reminders", error: reminders.error },
      { status: 500 }
    );
  }

  const escalation = await runEscalation(supabase);
  if (!escalation.ok) {
    return NextResponse.json(
      { ok: false, step: "escalation", error: escalation.error, reminders },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reminders: { itemsProcessed: reminders.count },
    escalation: { itemsProcessed: escalation.count },
  });
}

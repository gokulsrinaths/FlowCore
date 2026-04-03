import { Resend } from "resend";

/** Resend SDK returns `{ data, error }` from fetch; errors may not have `.message` shape we expect */
function formatResendError(error: unknown): string {
  if (error == null) return "Unknown Resend error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const o = error as Record<string, unknown>;
  if (typeof o.message === "string") return o.message;
  if (Array.isArray(o.message)) return o.message.map(String).join("; ");
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type ResendSendResult = {
  data: { id?: string } | null;
  error: unknown;
};

function parseResendSendResult(
  result: ResendSendResult,
  context: string
): { ok: true; id: string } | { ok: false; error: string } {
  if (result.error != null) {
    const msg = formatResendError(result.error);
    console.error(`[email] ${context} Resend error:`, result.error);
    return { ok: false, error: msg };
  }
  const id = result.data?.id;
  if (!id || typeof id !== "string") {
    const detail = JSON.stringify(result.data ?? null);
    console.error(`[email] ${context} missing id in response:`, detail);
    return {
      ok: false,
      error: `Resend accepted the request but returned no email id (${detail}). Check https://resend.com/emails`,
    };
  }
  if (process.env.NODE_ENV === "development") {
    console.info(`[email] ${context} queued id=${id}`);
  }
  return { ok: true, id };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Server-only Resend client. Never import from client components.
 */
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const base = raw.replace(/\/$/, "");
  return base || "http://localhost:3000";
}

export async function sendInviteEmail({
  to,
  inviteLink,
  caseTitle,
  orgName,
}: {
  to: string;
  inviteLink: string;
  caseTitle: string;
  orgName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "FlowCore <onboarding@resend.dev>";

  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY not set; skipping invite email to",
      to
    );
    return { ok: false, error: "Email not configured" };
  }

  const safeOrg = escapeHtml(orgName);
  const safeCase = escapeHtml(caseTitle);
  const plain = [
    `You've been invited to join ${orgName}.`,
    `Case: ${caseTitle}`,
    `Accept: ${inviteLink}`,
    "",
    "If you did not expect this, you can ignore this email.",
  ].join("\n");

  try {
    const result = (await resend.emails.send({
      from,
      to,
      subject: `You've been invited to a case: ${caseTitle}`,
      text: plain,
      html: `
      <h2>You've been invited</h2>
      <p>You were invited to join <b>${safeOrg}</b>.</p>
      <p>Case: <b>${safeCase}</b></p>
      <p><a href="${inviteLink.replace(/"/g, "&quot;")}">Accept invitation</a></p>
      <p style="color:#666;font-size:12px;margin-top:24px">If you did not expect this, you can ignore this email.</p>
    `,
    })) as ResendSendResult;
    const parsed = parseResendSendResult(result, "case invite");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    console.error("[email]", msg);
    return { ok: false, error: msg };
  }
}

/** Workspace (org) invite from Settings → Team — server-only */
export async function sendOrgInviteEmail({
  to,
  inviteLink,
  orgName,
}: {
  to: string;
  inviteLink: string;
  orgName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "FlowCore <onboarding@resend.dev>";

  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY not set; skipping org invite email to",
      to
    );
    return { ok: false, error: "Email not configured" };
  }

  const safeOrg = escapeHtml(orgName);
  const plain = [
    `You've been invited to join ${orgName} on FlowCore.`,
    `Accept invitation: ${inviteLink}`,
    "",
    "If you did not expect this, you can ignore this email.",
  ].join("\n");

  try {
    const result = (await resend.emails.send({
      from,
      to,
      subject: `You're invited to join ${orgName}`,
      text: plain,
      html: `
      <h2>You've been invited</h2>
      <p>You were invited to join the workspace <b>${safeOrg}</b> on FlowCore.</p>
      <p><a href="${inviteLink.replace(/"/g, "&quot;")}">Accept invitation</a></p>
      <p style="color:#666;font-size:12px;margin-top:24px">If you did not expect this, you can ignore this email.</p>
    `,
    })) as ResendSendResult;
    const parsed = parseResendSendResult(result, "org invite");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    console.error("[email]", msg);
    return { ok: false, error: msg };
  }
}

export async function sendTaskAssignmentEmail({
  to,
  taskTitle,
  caseTitle,
  link,
}: {
  to: string;
  taskTitle: string;
  caseTitle: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "FlowCore <onboarding@resend.dev>";

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set; skipping task assignment email");
    return { ok: false, error: "Email not configured" };
  }

  const safeTask = escapeHtml(taskTitle);
  const safeCase = escapeHtml(caseTitle);

  try {
    const result = (await resend.emails.send({
      from,
      to,
      subject: "New task assigned",
      html: `
      <p>You have been assigned a task.</p>
      <p><b>Task:</b> ${safeTask}</p>
      <p><b>Case:</b> ${safeCase}</p>
      <p><a href="${link.replace(/"/g, "&quot;")}">View task</a></p>
    `,
    })) as ResendSendResult;
    const parsed = parseResendSendResult(result, "task assignment");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

export async function sendDueReminderEmail({
  to,
  taskTitle,
  caseTitle,
  link,
}: {
  to: string;
  taskTitle: string;
  caseTitle: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "FlowCore <onboarding@resend.dev>";

  if (!resend) {
    return { ok: false, error: "Email not configured" };
  }

  const safeTask = escapeHtml(taskTitle);
  const safeCase = escapeHtml(caseTitle);

  try {
    const result = (await resend.emails.send({
      from,
      to,
      subject: `Reminder: task due soon — ${taskTitle}`,
      html: `
      <p>This is a reminder that a task is due within 24 hours.</p>
      <p><b>Task:</b> ${safeTask}</p>
      <p><b>Case:</b> ${safeCase}</p>
      <p><a href="${link.replace(/"/g, "&quot;")}">Open task</a></p>
    `,
    })) as ResendSendResult;
    const parsed = parseResendSendResult(result, "due reminder");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

/** Escalation to managers/admins — server-only */
export async function sendEscalationEmail({
  to,
  taskTitle,
  caseTitle,
  link,
}: {
  to: string;
  taskTitle: string;
  caseTitle: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "FlowCore <onboarding@resend.dev>";

  if (!resend) {
    return { ok: false, error: "Email not configured" };
  }

  const safeTask = escapeHtml(taskTitle);
  const safeCase = escapeHtml(caseTitle);

  try {
    const result = (await resend.emails.send({
      from,
      to,
      subject: `Escalation: task needs attention — ${taskTitle}`,
      html: `
      <p>A task in your workspace requires attention (overdue or no recent activity).</p>
      <p><b>Task:</b> ${safeTask}</p>
      <p><b>Case:</b> ${safeCase}</p>
      <p><a href="${link.replace(/"/g, "&quot;")}">Review task</a></p>
    `,
    })) as ResendSendResult;
    const parsed = parseResendSendResult(result, "escalation");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

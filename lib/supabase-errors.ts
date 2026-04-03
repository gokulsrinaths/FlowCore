/**
 * PostgrestError / AuthApiError sometimes have empty `message`; throwing them
 * as-is makes Next.js surface `Error: {"message":""}` and confusing digests.
 */
export function supabaseErrorToError(err: unknown): Error {
  if (err instanceof Error) {
    if (typeof err.message === "string" && err.message.trim().length > 0) {
      return err;
    }
  }
  const o = err as Record<string, unknown> | null;
  if (o && typeof o === "object") {
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";
    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const parts = [
      msg,
      code && `code ${code}`,
      details,
      hint,
    ].filter(Boolean) as string[];
    if (parts.length > 0) {
      return new Error(parts.join(" — "));
    }
  }
  return new Error("Database request failed");
}

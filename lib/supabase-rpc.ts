/**
 * Parses jsonb results from flowcore_* RPCs: { ok: true, ... } | { ok: false, error: string }
 */
export type FlowcoreRpcSuccess = {
  ok: true;
  id?: string;
  slug?: string;
  token?: string;
  organization_id?: string;
};

export type FlowcoreRpcFailure = {
  ok: false;
  error: string;
};

export type FlowcoreRpcResult = FlowcoreRpcSuccess | FlowcoreRpcFailure;

export function parseFlowcoreRpc(data: unknown): FlowcoreRpcResult {
  if (data == null || typeof data !== "object") {
    return { ok: false, error: "Invalid server response" };
  }
  const o = data as Record<string, unknown>;
  if (o.ok === false || o.ok === "false") {
    return { ok: false, error: String(o.error ?? "Request failed") };
  }
  if (o.ok === true || o.ok === "true") {
    const base: FlowcoreRpcSuccess = { ok: true };
    if (typeof o.id === "string") base.id = o.id;
    if (typeof o.slug === "string") base.slug = o.slug;
    if (typeof o.token === "string") base.token = o.token;
    if (typeof o.organization_id === "string")
      base.organization_id = o.organization_id;
    return base;
  }
  return { ok: false, error: "Invalid server response" };
}

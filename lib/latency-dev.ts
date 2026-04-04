/**
 * Dev-only timing for server data loads (p95-oriented debugging).
 * Does not run in production to avoid noise and log cost.
 */
export async function withLatencyGuard<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { backendRoundTrips?: number }
): Promise<T> {
  if (process.env.NODE_ENV !== "development") {
    return fn();
  }
  if (opts?.backendRoundTrips != null) {
    console.info(`[latency] ${label}: ${opts.backendRoundTrips} Supabase round-trip(s)`);
  }
  console.time(label);
  try {
    return await fn();
  } finally {
    console.timeEnd(label);
  }
}

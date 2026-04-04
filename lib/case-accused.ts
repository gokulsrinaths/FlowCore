/**
 * Accused details as JSON.
 * - New shape: { entries: string[] }
 * - Legacy: { a1, a2, a3 } or plain string
 */

const LEGACY_KEYS = ["a1", "a2", "a3"] as const;

/** Normalize stored JSON into a list of strings for the UI (at least one row). */
export function accusedJsonToEntries(accused: unknown): string[] {
  if (accused == null) return [""];
  if (typeof accused === "object" && accused !== null && !Array.isArray(accused)) {
    const o = accused as Record<string, unknown>;
    if (Array.isArray(o.entries)) {
      const list = o.entries.map((x) => String(x ?? ""));
      return list.length > 0 ? list : [""];
    }
    const legacy = LEGACY_KEYS.map((k) => (o[k] != null ? String(o[k]) : ""));
    if (legacy.some((s) => s.trim() !== "")) {
      return legacy;
    }
    if (typeof o.raw === "string" && o.raw.trim()) {
      return [o.raw];
    }
    try {
      const s = JSON.stringify(accused, null, 2);
      if (s && s !== "{}") return [s];
    } catch {
      /* fall through */
    }
    return [""];
  }
  if (typeof accused === "string") {
    return accused.trim() ? [accused] : [""];
  }
  try {
    const s = JSON.stringify(accused, null, 2);
    return s ? [s] : [""];
  } catch {
    return [String(accused)];
  }
}

/** Persist: only non-empty trimmed lines; null if none. */
export function entriesToAccusedJson(entries: string[]): unknown | null {
  const trimmed = entries.map((e) => e.trim()).filter((e) => e.length > 0);
  if (trimmed.length === 0) return null;
  return { entries: trimmed };
}

export function accusedPayloadFromForm(formData: FormData): unknown | null {
  const raw = String(formData.get("accused_payload") ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed != null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as Record<string, unknown>).entries)
      ) {
        const list = (parsed as { entries: unknown[] }).entries.map((x) =>
          String(x ?? "")
        );
        return entriesToAccusedJson(list);
      }
    } catch {
      /* fall through */
    }
  }
  const a1 = String(formData.get("accused_a1") ?? "");
  const a2 = String(formData.get("accused_a2") ?? "");
  const a3 = String(formData.get("accused_a3") ?? "");
  return entriesToAccusedJson([a1, a2, a3]);
}

export function formatAccusedForDisplay(accused: unknown): string {
  if (accused == null) return "—";
  if (typeof accused === "object" && accused !== null && !Array.isArray(accused)) {
    const o = accused as Record<string, unknown>;
    if (Array.isArray(o.entries)) {
      const parts = o.entries
        .map((x) => String(x ?? "").trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        return parts.map((text, i) => `Accused ${i + 1}: ${text}`).join("\n\n");
      }
    }
    const legacy = LEGACY_KEYS.map((k) => (o[k] != null ? String(o[k]).trim() : "")).filter(
      (s) => s.length > 0
    );
    if (legacy.length > 0) {
      return legacy.map((text, i) => `Accused ${i + 1}: ${text}`).join("\n\n");
    }
  }
  if (typeof accused === "string") return accused.trim() || "—";
  try {
    return JSON.stringify(accused, null, 2);
  } catch {
    return String(accused);
  }
}

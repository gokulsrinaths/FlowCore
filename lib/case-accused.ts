/**
 * Accused details stored as JSON: { a1, a2, a3 } with legacy fallbacks.
 */

export type AccusedDetails = {
  a1: string;
  a2: string;
  a3: string;
};

export function accusedJsonToDetails(accused: unknown): AccusedDetails {
  if (accused == null) return { a1: "", a2: "", a3: "" };
  if (typeof accused === "object" && accused !== null && !Array.isArray(accused)) {
    const o = accused as Record<string, unknown>;
    const a1 = o.a1 != null ? String(o.a1) : "";
    const a2 = o.a2 != null ? String(o.a2) : "";
    const a3 = o.a3 != null ? String(o.a3) : "";
    if (a1 !== "" || a2 !== "" || a3 !== "") {
      return { a1, a2, a3 };
    }
    if (typeof o.raw === "string" && o.raw.trim()) {
      return { a1: o.raw, a2: "", a3: "" };
    }
  }
  if (typeof accused === "string") {
    return { a1: accused, a2: "", a3: "" };
  }
  try {
    return { a1: JSON.stringify(accused, null, 2), a2: "", a3: "" };
  } catch {
    return { a1: String(accused), a2: "", a3: "" };
  }
}

export function detailsToAccusedJson(d: AccusedDetails): unknown | null {
  const a1 = d.a1.trim();
  const a2 = d.a2.trim();
  const a3 = d.a3.trim();
  if (!a1 && !a2 && !a3) return null;
  return { a1: a1 || null, a2: a2 || null, a3: a3 || null };
}

export function formatAccusedForDisplay(accused: unknown): string {
  const { a1, a2, a3 } = accusedJsonToDetails(accused);
  const lines: string[] = [];
  if (a1.trim()) lines.push(`a1: ${a1.trim()}`);
  if (a2.trim()) lines.push(`a2: ${a2.trim()}`);
  if (a3.trim()) lines.push(`a3: ${a3.trim()}`);
  if (lines.length > 0) return lines.join("\n\n");
  if (accused == null) return "—";
  if (typeof accused === "string") return accused || "—";
  try {
    return JSON.stringify(accused, null, 2);
  } catch {
    return String(accused);
  }
}

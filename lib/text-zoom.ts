/**
 * Text-only zoom via root font-size (scales rem-based UI consistently).
 * Bounds align with WCAG 1.4.4 (resize text to 200% without assistive tech).
 */
export const TEXT_ZOOM_STORAGE_KEY = "flowcore-text-zoom";

/** Percentage steps applied to `html { font-size: … }`. Min 90%, max 200%. */
export const TEXT_ZOOM_LEVELS = [90, 100, 110, 125, 150, 175, 200] as const;

export type TextZoomLevel = (typeof TEXT_ZOOM_LEVELS)[number];

export function isTextZoomLevel(n: number): n is TextZoomLevel {
  return (TEXT_ZOOM_LEVELS as readonly number[]).includes(n);
}

export function nearestTextZoomLevel(n: number): TextZoomLevel {
  if (isTextZoomLevel(n)) return n;
  let best: TextZoomLevel = TEXT_ZOOM_LEVELS[0];
  let bestDist = Math.abs(n - best);
  for (const L of TEXT_ZOOM_LEVELS) {
    const d = Math.abs(n - L);
    if (d < bestDist) {
      best = L;
      bestDist = d;
    }
  }
  return best;
}

export function clampTextZoomIndex(index: number): number {
  return Math.max(0, Math.min(TEXT_ZOOM_LEVELS.length - 1, index));
}

"use client";

import { Button } from "@/components/ui/button";
import {
  TEXT_ZOOM_LEVELS,
  TEXT_ZOOM_STORAGE_KEY,
  isTextZoomLevel,
  nearestTextZoomLevel,
} from "@/lib/text-zoom";
import { cn } from "@/lib/utils";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function readStoredLevel(): number {
  if (typeof window === "undefined") return 100;
  try {
    const raw = localStorage.getItem(TEXT_ZOOM_STORAGE_KEY);
    if (raw == null) return 100;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 100;
    return nearestTextZoomLevel(n);
  } catch {
    return 100;
  }
}

function applyLevelToDocument(percent: number) {
  document.documentElement.style.fontSize = `${percent}%`;
}

export function TextZoomToolbar() {
  const [level, setLevel] = useState(100);
  const [mounted, setMounted] = useState(false);
  const announceRef = useRef<HTMLDivElement>(null);

  const index = TEXT_ZOOM_LEVELS.indexOf(
    isTextZoomLevel(level) ? level : nearestTextZoomLevel(level)
  );
  const safeIndex = index < 0 ? TEXT_ZOOM_LEVELS.indexOf(100) : index;
  const atMin = safeIndex <= 0;
  const atMax = safeIndex >= TEXT_ZOOM_LEVELS.length - 1;
  const isDefault = TEXT_ZOOM_LEVELS[safeIndex] === 100;

  const commit = useCallback((next: number) => {
    const L = nearestTextZoomLevel(next);
    setLevel(L);
    applyLevelToDocument(L);
    try {
      localStorage.setItem(TEXT_ZOOM_STORAGE_KEY, String(L));
    } catch {
      /* private mode / quota */
    }
    const el = announceRef.current;
    if (el) {
      el.textContent = `Text size ${L} percent`;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = readStoredLevel();
    setLevel(stored);
    applyLevelToDocument(stored);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "text-zoom-toolbar-root fixed z-40 flex flex-col gap-1 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-md",
        "motion-safe:transition-[box-shadow,background-color] motion-safe:duration-200",
        "bottom-[max(1rem,env(safe-area-inset-bottom,0px))]",
        "right-[max(1rem,env(safe-area-inset-right,0px))]"
      )}
      role="toolbar"
      aria-label="Text size controls"
    >
      <span id="text-zoom-toolbar-desc" className="sr-only">
        Increase or decrease text size across the site. Minimum ninety percent, maximum two hundred
        percent.
      </span>
      <div
        className="flex items-center gap-0.5"
        role="group"
        aria-labelledby="text-zoom-toolbar-desc"
      >
        <Button
          id="text-zoom-dec"
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label={`Smaller text. Current size ${TEXT_ZOOM_LEVELS[safeIndex]} percent.`}
          disabled={atMin}
          onClick={() => commit(TEXT_ZOOM_LEVELS[safeIndex - 1])}
        >
          <Minus className="size-5" aria-hidden />
        </Button>
        <output
          className="tabular-nums min-w-[3.25rem] px-1 text-center text-sm font-medium text-foreground"
          htmlFor="text-zoom-dec text-zoom-inc text-zoom-reset"
        >
          {TEXT_ZOOM_LEVELS[safeIndex]}%
        </output>
        <Button
          id="text-zoom-inc"
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label={`Larger text. Current size ${TEXT_ZOOM_LEVELS[safeIndex]} percent.`}
          disabled={atMax}
          onClick={() => commit(TEXT_ZOOM_LEVELS[safeIndex + 1])}
        >
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>
      <Button
        id="text-zoom-reset"
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        disabled={isDefault}
        aria-label="Reset text size to one hundred percent"
        onClick={() => commit(100)}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Reset
      </Button>
      <div ref={announceRef} className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}

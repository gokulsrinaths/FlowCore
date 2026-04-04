"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

type AccusedDetailsFieldsProps = {
  /** Initial rows when the dialog opens (from `accusedJsonToEntries`). */
  initialEntries: string[];
};

/**
 * Dynamic list of accused detail blocks. Add/remove as needed; stored as `{ entries: string[] }`.
 */
export function AccusedDetailsFields({ initialEntries }: AccusedDetailsFieldsProps) {
  const [entries, setEntries] = useState<string[]>(() =>
    initialEntries.length > 0 ? [...initialEntries] : [""]
  );

  const lastEnterRef = useRef<{ at: number; index: number } | null>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const setRef = useCallback((el: HTMLTextAreaElement | null, index: number) => {
    refs.current[index] = el;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const now = Date.now();
      const prev = lastEnterRef.current;
      if (prev && prev.index === index && now - prev.at < 550 && index < entries.length - 1) {
        e.preventDefault();
        lastEnterRef.current = null;
        refs.current[index + 1]?.focus();
        return;
      }
      lastEnterRef.current = { at: now, index };
    },
    [entries.length]
  );

  function addRow() {
    setEntries((prev) => [...prev, ""]);
  }

  function removeRow(index: number) {
    setEntries((prev) => {
      if (prev.length <= 1) {
        const next = [...prev];
        next[0] = "";
        return next;
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateRow(index: number, value: string) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="accused_payload"
        value={JSON.stringify({ entries })}
        readOnly
        aria-hidden
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label>Accused details</Label>
          <p className="text-muted-foreground mt-1 text-xs text-pretty">
            Add one block per accused person or entity. Use <strong>Add accused</strong> for more
            rows. Press Enter twice quickly to jump to the next block.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full shrink-0 touch-manipulation sm:w-auto"
          onClick={addRow}
        >
          <Plus className="size-4 mr-1" />
          Add accused
        </Button>
      </div>
      <ul className="space-y-3">
        {entries.map((value, i) => (
          <li key={i} className="flex gap-2 items-start">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label
                htmlFor={`accused-entry-${i}`}
                className="text-muted-foreground text-xs font-normal"
              >
                Accused {i + 1}
              </Label>
              <Textarea
                ref={(el) => setRef(el, i)}
                id={`accused-entry-${i}`}
                rows={3}
                value={value}
                onChange={(e) => updateRow(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
                placeholder="Name, role, identifiers, notes…"
                className="touch-manipulation"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 size-9 shrink-0 text-muted-foreground hover:text-destructive touch-manipulation"
              aria-label={`Remove accused ${i + 1}`}
              onClick={() => removeRow(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

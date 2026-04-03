"use client";

import { useCallback, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AccusedDetails } from "@/lib/case-accused";

type AccusedDetailsFieldsProps = {
  /** Initial values when dialog opens (edit) */
  initial: AccusedDetails;
};

const PLACEHOLDERS = ["a1", "a2", "a3"] as const;

/**
 * Three accused blocks (a1–a3). Double Enter in a field moves focus to the next field.
 */
export function AccusedDetailsFields({ initial }: AccusedDetailsFieldsProps) {
  const ref0 = useRef<HTMLTextAreaElement>(null);
  const ref1 = useRef<HTMLTextAreaElement>(null);
  const ref2 = useRef<HTMLTextAreaElement>(null);
  const refs = [ref0, ref1, ref2] as const;

  const lastEnterRef = useRef<{ at: number; index: number } | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, index: 0 | 1 | 2) => {
      if (e.key !== "Enter" || e.shiftKey) {
        return;
      }
      const now = Date.now();
      const prev = lastEnterRef.current;
      if (
        prev &&
        prev.index === index &&
        now - prev.at < 550 &&
        index < 2
      ) {
        e.preventDefault();
        lastEnterRef.current = null;
        refs[index + 1].current?.focus();
        return;
      }
      lastEnterRef.current = { at: now, index };
    },
    []
  );

  return (
    <div className="space-y-3">
      <div>
        <Label>Accused details</Label>
        <p className="text-muted-foreground mt-1 text-xs">
          Three blocks (a1, a2, a3). Press Enter twice quickly to move to the next block.
        </p>
      </div>
      {PLACEHOLDERS.map((ph, i) => (
        <div key={ph} className="space-y-1.5">
          <Label htmlFor={`accused-${ph}`} className="text-muted-foreground text-xs font-normal">
            {ph}
          </Label>
          <Textarea
            ref={refs[i]}
            id={`accused-${ph}`}
            name={`accused_${ph}`}
            rows={3}
            defaultValue={initial[["a1", "a2", "a3"][i] as keyof AccusedDetails]}
            placeholder={ph}
            onKeyDown={(e) => onKeyDown(e, i as 0 | 1 | 2)}
          />
        </div>
      ))}
    </div>
  );
}

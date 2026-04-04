"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ITEM_QUESTIONNAIRE_STATUS_LABELS } from "@/lib/permissions";
import { priorityVariant } from "@/lib/priority-styles";
import type { ItemWithUsers } from "@/types";
import { cn } from "@/lib/utils";

type ItemCardProps = {
  item: ItemWithUsers;
  orgSlug: string;
  /** When questionnaires drive workflow and user cannot override status */
  dragDisabled?: boolean;
};

/**
 * Draggable Kanban card — drag handle avoids fighting with navigation clicks.
 */
export function ItemCard({ item, orgSlug, dragDisabled = false }: ItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.85 : 1,
  };

  const assignee =
    item.assignee?.name ??
    item.assignee?.email ??
    item.assigneeParticipant?.displayName ??
    item.assigneeParticipant?.email ??
    "Unassigned";

  const q = item.itemQuestionnaires ?? [];
  const showQPreview = q.length > 0 && item.status !== "completed";

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "z-10")}>
    <Card
      className={cn(
        "shadow-sm transition-shadow hover:shadow-md",
        isDragging && "ring-2 ring-primary/30"
      )}
    >
      <CardHeader className="flex flex-row items-start gap-2 space-y-0 pb-2 pt-3 px-3">
        <button
          type="button"
          className={cn(
            "-m-2 mt-0.5 flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground",
            dragDisabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-grab hover:bg-muted/80 hover:text-foreground active:cursor-grabbing"
          )}
          aria-label={dragDisabled ? "Status locked by questionnaires" : "Drag to move"}
          disabled={dragDisabled}
          {...(dragDisabled ? {} : listeners)}
          {...(dragDisabled ? {} : attributes)}
        >
          {dragDisabled ? (
            <Lock className="size-4" aria-hidden />
          ) : (
            <GripVertical className="size-4" />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={`/${orgSlug}/items/${item.id}`}
            className="font-medium leading-snug hover:underline line-clamp-2"
          >
            {item.title}
          </Link>
          <p className="text-xs text-muted-foreground truncate">{assignee}</p>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {item.priority ? (
            <Badge variant={priorityVariant(item.priority)} className="text-[10px] uppercase">
              {item.priority}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              No priority
            </Badge>
          )}
        </div>
        {showQPreview ? (
          <ul className="text-[10px] text-muted-foreground space-y-0.5 border-t border-border/60 pt-2">
            {q.slice(0, 3).map((row) => (
              <li key={row.id} className="line-clamp-1">
                <span className="text-foreground/80">{row.question_text}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {ITEM_QUESTIONNAIRE_STATUS_LABELS[row.status]}
                </span>
              </li>
            ))}
            {q.length > 3 ? (
              <li className="text-muted-foreground">+{q.length - 3} more</li>
            ) : null}
          </ul>
        ) : null}
      </CardContent>
    </Card>
    </div>
  );
}

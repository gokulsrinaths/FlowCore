"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { priorityVariant } from "@/lib/priority-styles";
import type { ItemWithUsers } from "@/types";
import { cn } from "@/lib/utils";

type ItemCardProps = {
  item: ItemWithUsers;
  orgSlug: string;
};

/**
 * Draggable Kanban card — drag handle avoids fighting with navigation clicks.
 */
export function ItemCard({ item, orgSlug }: ItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
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
          className="-m-2 mt-0.5 flex min-h-11 min-w-11 cursor-grab touch-manipulation items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to move"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" />
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
      <CardContent className="px-3 pb-3 pt-0">
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
      </CardContent>
    </Card>
    </div>
  );
}

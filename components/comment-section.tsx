"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addComment, deleteComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import type { CommentWithUser } from "@/types";

type CommentSectionProps = {
  itemId: string;
  organizationId: string;
  orgSlug: string;
  initialComments: CommentWithUser[];
  currentUserId: string;
};

/**
 * Comment list with add + delete own (server-enforced).
 */
export function CommentSection({
  itemId,
  organizationId,
  orgSlug,
  initialComments,
  currentUserId,
}: CommentSectionProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await addComment(organizationId, orgSlug, itemId, body);
      if (res.ok) {
        setText("");
        toast.success("Comment added");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to add comment");
      }
    });
  }

  function remove(commentId: string) {
    startTransition(async () => {
      const res = await deleteComment(organizationId, orgSlug, commentId, itemId);
      if (res.ok) {
        toast.success("Comment removed");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to delete");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="Write a comment…"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
        />
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={submit}
          disabled={pending || !text.trim()}
        >
          Post comment
        </Button>
      </div>
      <Separator />
      <ul className="space-y-4">
        {initialComments.length === 0 && (
          <li className="text-sm text-muted-foreground">No comments yet.</li>
        )}
        {initialComments.map((c) => {
          const author = c.user?.name ?? c.user?.email ?? "Unknown";
          const when = formatDistanceToNow(new Date(c.created_at), {
            addSuffix: true,
          });
          const own = c.user_id === currentUserId;
          return (
            <li key={c.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <p className="whitespace-pre-wrap">{c.text}</p>
                {own && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => remove(c.id)}
                    aria-label="Delete comment"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {author} · {when}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

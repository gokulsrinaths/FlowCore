"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { updateItemDetails } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ItemWithUsers } from "@/types";

type EditItemDialogProps = {
  item: ItemWithUsers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgSlug: string;
};

export function EditItemDialog({
  item,
  open,
  onOpenChange,
  organizationId,
  orgSlug,
}: EditItemDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState(() => item.title);
  const [description, setDescription] = useState(() => item.description ?? "");
  const [type, setType] = useState(() => item.type ?? "");
  const [priority, setPriority] = useState(() => item.priority ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await updateItemDetails(organizationId, orgSlug, item.id, {
      title: title.trim(),
      description,
      type,
      priority,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Item updated");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Update failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>Update fields and save — changes are audited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type</Label>
                <Input
                  id="edit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Input
                  id="edit-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

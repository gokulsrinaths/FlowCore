"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteItem } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditItemDialog } from "@/components/edit-item-dialog";
import type { ItemWithUsers } from "@/types";

type ItemDetailActionsProps = {
  item: ItemWithUsers;
  canEdit: boolean;
  canDelete: boolean;
  organizationId: string;
  orgSlug: string;
};

export function ItemDetailActions({
  item,
  canEdit,
  canDelete,
  organizationId,
  orgSlug,
}: ItemDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const res = await deleteItem(organizationId, orgSlug, item.id);
      if (res.ok) {
        toast.success("Task removed");
        setDeleteOpen(false);
        router.push(`/${orgSlug}/items`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn’t remove the task");
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
      {canEdit && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setEditKey((k) => k + 1);
              setEditOpen(true);
            }}
          >
            Edit
          </Button>
          <EditItemDialog
            key={editKey}
            item={item}
            open={editOpen}
            onOpenChange={setEditOpen}
            organizationId={organizationId}
            orgSlug={orgSlug}
          />
        </>
      )}
      {canDelete && (
        <>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this item?</DialogTitle>
                <DialogDescription>
                  This cannot be undone. Comments will be removed; activity history for this item
                  may be archived as system logs.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
                  {pending ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

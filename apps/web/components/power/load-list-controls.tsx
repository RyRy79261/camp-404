"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  copyLastYearLoadsAction,
  removeLoadAction,
} from "@/app/(console)/power/actions";
import {
  LoadEditorDialog,
  type EditableLoad,
  type InventoryOption,
} from "./load-editor-dialog";

// The load list's controls (#253): Add opens a dialog, and each row has one
// Edit in the list's fixed action column, with Remove at the foot of the edit
// dialog. Only an editor is shown any of them (the owner's approved redesign,
// 2026-10-01: a reader gets the content, never a greyed-out form). The server
// re-checks regardless; nothing here is the boundary.

/** The load list's main button. Only an editor is shown it. */
export function AddLoadButton({ inventory }: { inventory: InventoryOption[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add a load</Button>
      <LoadEditorDialog
        open={open}
        onOpenChange={setOpen}
        inventory={inventory}
      />
    </>
  );
}

/**
 * One Edit button for a row, in the list's fixed action column; Remove sits
 * at the foot of the edit dialog and asks first. Only an editor is shown it.
 */
export function LoadRowActions({
  load,
  inventory,
}: {
  load: EditableLoad;
  inventory: InventoryOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();

  // A one-tap change on a list row, once confirmed: its failure is a toast,
  // and the dialog closes when the answer is in (announcements-manager.tsx).
  function confirmRemove() {
    startRemove(async () => {
      const result = await removeLoadAction({
        loadId: load.id,
        expectedVersion: load.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Load removed");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-[10px]"
        disabled={removing}
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${load.name}`}
      >
        {removing ? <Spinner size="sm" label="Removing…" /> : "Edit"}
      </Button>
      <LoadEditorDialog
        key={`${load.id}:${load.version}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={load}
        inventory={inventory}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${load.name}?`}
        description="It comes off this year's list, and the totals drop with it."
        confirmLabel="Remove load"
        destructive
        pending={removing}
        onConfirm={confirmRemove}
      />
    </>
  );
}

/** Copies the most recent earlier year's list into an empty year. */
export function CopyLastYearButton({ fromCycle }: { fromCycle: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await copyLastYearLoadsAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const n = result.data.count;
          toast.success(
            `Copied ${n} load${n === 1 ? "" : "s"} from ${fromCycle}`,
          );
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Copying…" /> : <Copy aria-hidden />}
      Copy last year&apos;s list
    </Button>
  );
}

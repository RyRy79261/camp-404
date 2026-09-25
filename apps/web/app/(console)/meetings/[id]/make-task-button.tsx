"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SquareKanban } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { actionItemToTaskAction } from "../actions";

// One tap puts an action item on the task board. A one-tap change on a list
// row reports its failure as a toast, and only this button spins (AGENTS.md).

export function MakeTaskButton({
  itemId,
  text,
}: {
  itemId: string;
  text: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function makeTask() {
    startTransition(async () => {
      const result = await actionItemToTaskAction({ itemId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Added to the task board");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={makeTask}
      disabled={pending}
      aria-label={`Add “${text}” to the task board`}
    >
      {pending ? <Spinner /> : <SquareKanban aria-hidden />}
      Add to tasks
    </Button>
  );
}

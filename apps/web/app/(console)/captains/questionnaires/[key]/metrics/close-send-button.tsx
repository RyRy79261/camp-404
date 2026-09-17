"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { toast } from "@camp404/ui/components/toast";
import { closeActivationAction } from "../../actions";
import { CLOSE_SEND_CONFIRM } from "../lifecycle-controls";

/**
 * Close an open send from the results page (AfrikaBurn's
 * close-activation-button). Closing stops asking everyone who hasn't answered,
 * so it asks first, in the same words as the editor's Close send.
 */
export function CloseActivationButton({
  activationId,
  questionnaireKey,
}: {
  activationId: string;
  questionnaireKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function close() {
    if (!(await confirm(CLOSE_SEND_CONFIRM))) return;
    startTransition(async () => {
      const result = await closeActivationAction(
        activationId,
        questionnaireKey,
      );
      if (result.ok) {
        toast.success("Send closed");
        router.refresh();
      } else {
        toast.error("Could not close", { description: result.error });
      }
    });
  }

  return (
    <>
      {confirmDialog}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void close()}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Lock aria-hidden />
        )}
        {pending ? "Closing…" : "Close send"}
      </Button>
    </>
  );
}

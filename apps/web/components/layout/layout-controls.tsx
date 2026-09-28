"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, History, Link2, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Input } from "@camp404/ui/components/input";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  copyLastYearLayoutAction,
  restoreLayoutVersionAction,
  shareLayoutAction,
  unshareLayoutAction,
} from "@/app/(console)/camp-layout/actions";
import { neighbourPath } from "@/lib/camp-layout-copy";

// The layout page's one-tap controls (#271): copy last year's plan, bring an
// older version back, and a captain's neighbour link. A one-tap change reports
// its failure as a toast, and only the control that was used spins.

/** Starts this year's plan from last year's. Shown only while it has none. */
export function CopyLastYearLayoutButton({ fromCycle }: { fromCycle: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await copyLastYearLayoutAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Started from ${result.data.fromCycle}'s layout`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Copying…" /> : <Copy aria-hidden />}
      Start from {fromCycle}&apos;s layout
    </Button>
  );
}

/** Saves an older version again as the newest. */
export function RestoreVersionButton({
  number,
  latest,
}: {
  number: number;
  latest: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
        aria-label={`Bring back version ${number}`}
      >
        {pending ? (
          <Spinner size="sm" label="Bringing back…" />
        ) : (
          <History aria-hidden />
        )}
        Bring back
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Bring back version ${number}?`}
        description={`It is saved again as version ${latest + 1}. Version ${latest} stays in the list.`}
        confirmLabel="Bring it back"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const result = await restoreLayoutVersionAction({
              number,
              expectedVersion: latest,
            });
            setConfirming(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`Version ${number} is back`);
            router.refresh();
          })
        }
      />
    </>
  );
}

/**
 * A captain's neighbour link: off until turned on, then a link to copy, a
 * new link (the old one stops working) or off again.
 */
export function NeighbourShareControls({
  token,
  canShareNow,
}: {
  token: string | null;
  /** False while the year has no saved plan. */
  canShareNow: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [busy, setBusy] = React.useState<"on" | "new" | "off" | null>(null);
  const [confirm, setConfirm] = React.useState<"new" | "off" | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => setOrigin(window.location.origin), []);

  const url = token ? `${origin}${neighbourPath(token)}` : "";

  function run(which: "on" | "new" | "off") {
    setBusy(which);
    start(async () => {
      const result =
        which === "off"
          ? await unshareLayoutAction()
          : await shareLayoutAction();
      setConfirm(null);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        which === "off"
          ? "The neighbour link is off"
          : which === "new"
            ? "New link made; the old one no longer works"
            : "The neighbour link is on",
      );
      router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  if (!token) {
    return (
      <Button
        onClick={() => run("on")}
        disabled={pending || !canShareNow}
        className="self-start"
      >
        {busy === "on" ? (
          <Spinner size="sm" label="Turning on…" />
        ) : (
          <Link2 aria-hidden />
        )}
        Share with neighbours
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          aria-label="Neighbour link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label="Copy the neighbour link"
          disabled={!origin}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm("new")}
        >
          {busy === "new" ? (
            <Spinner size="sm" label="Making…" />
          ) : (
            <RefreshCw aria-hidden />
          )}
          Make a new link
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm("off")}
        >
          {busy === "off" ? (
            <Spinner size="sm" label="Turning off…" />
          ) : (
            <Link2Off aria-hidden />
          )}
          Stop sharing
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === "new"}
        onOpenChange={(open) => setConfirm(open ? "new" : null)}
        title="Make a new link?"
        description="The link you shared stops working. Send the new one to the neighbours who should still see the layout."
        confirmLabel="Make a new link"
        pending={pending}
        onConfirm={() => run("new")}
      />
      <ConfirmDialog
        open={confirm === "off"}
        onOpenChange={(open) => setConfirm(open ? "off" : null)}
        title="Stop sharing the layout?"
        description="The link stops working for everyone who has it."
        confirmLabel="Stop sharing"
        destructive
        pending={pending}
        onConfirm={() => run("off")}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2 } from "lucide-react";
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
import { LAYOUT_PATH, neighbourPath } from "@/lib/camp-layout-copy";

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

/**
 * Saves an older version again as the newest: the primary action on the
 * banner while an editor looks at an older plan.
 */
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
        size="sm"
        className="h-8 px-3 text-[13px] font-semibold"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {pending ? <Spinner size="sm" label="Bringing back…" /> : null}
        Bring back version {number}
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
            router.push(LAYOUT_PATH);
            router.refresh();
          })
        }
      />
    </>
  );
}

/** The origin never changes while the page is open. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * A captain's neighbour link (the rail's Share tab): off until turned on,
 * then the link to copy, Replace link (the old one stops working) and Stop
 * sharing. The words about what neighbours see sit above, on the page.
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
  // The page's own origin, known only in the browser: empty in the server's
  // render (and while hydrating), so the two agree.
  const origin = React.useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );

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
        size="sm"
        onClick={() => run("on")}
        disabled={pending || !canShareNow}
        className="h-8 self-start px-3 text-[13px] font-semibold"
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          aria-label="Neighbour link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 px-1.5 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          aria-label="Copy the neighbour link"
          disabled={!origin}
          className="h-8 px-3 text-[13px] font-semibold"
        >
          {copied ? <Check aria-hidden /> : null}
          Copy
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm("new")}
          className="h-8 px-3 text-[13px] font-semibold"
        >
          {busy === "new" ? <Spinner size="sm" label="Making…" /> : null}
          Replace link
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm("off")}
          className="h-8 px-3 text-[13px] font-semibold text-destructive hover:text-destructive"
        >
          {busy === "off" ? <Spinner size="sm" label="Turning off…" /> : null}
          Stop sharing
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === "new"}
        onOpenChange={(open) => setConfirm(open ? "new" : null)}
        title="Replace the link?"
        description="The link you shared stops working. Send the new one to the neighbours who should still see the layout."
        confirmLabel="Replace link"
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

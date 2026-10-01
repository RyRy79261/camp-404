"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The member's payment reference on their profile, with a copy button, so
// they can quote it on an EFT to the camp. A card in the window's blue tint,
// like every other box, with the camp's accent only as a left edge: the code
// and a Copy button. The code is set in the mono font with no letter-spacing,
// so "C404-M001" never reads as "C4 04".

export function PaymentReference({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  return (
    <div
      data-slot="card"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-l-accent bg-card p-5 text-card-foreground shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h3
          data-slot="card-title"
          className="text-base font-semibold leading-none tracking-tight"
        >
          Your payment reference
        </h3>
        <p className="font-mono text-xl font-semibold tracking-normal">
          {code}
        </p>
        <p className="text-xs text-muted-foreground">
          {copyFailed
            ? "Copy didn't work here. Type the reference above instead."
            : "Use it when you pay camp dues by EFT."}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={copied ? "Copied" : `Copy ${code}`}
        onClick={async () => {
          // Clipboard access can be denied; then point at the visible code.
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setCopyFailed(false);
          } catch {
            setCopied(false);
            setCopyFailed(true);
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

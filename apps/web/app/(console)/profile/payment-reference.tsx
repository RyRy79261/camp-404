"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The member's payment reference on their profile, with a copy button, so
// they can quote it on an EFT to the camp. Drawn as the AfrikaBurn camp
// reference banner: an accent-tinted panel with the code and a Copy button.

export function PaymentReference({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your payment reference
        </p>
        <p className="mt-0.5 font-mono text-xl font-semibold tracking-tight">
          {code}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
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

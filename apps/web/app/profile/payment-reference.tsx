"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The member's payment reference on their profile, with a copy button, so
// they can quote it on an EFT to the camp. No board draws it; it reuses the
// invite tool's copy pattern.

export function PaymentReference({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  return (
    <div className="flex w-full flex-col items-center gap-1.5 rounded-lg border bg-muted px-4 py-3">
      <span className="text-label text-muted-foreground">
        Your payment reference
      </span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-base font-semibold">{code}</span>
        <Button
          type="button"
          variant="ghost"
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
      <p className="text-caption text-muted-foreground">
        {copyFailed
          ? "Copy didn't work here. Type the reference above instead."
          : "Use it when you pay camp dues by EFT."}
      </p>
    </div>
  );
}

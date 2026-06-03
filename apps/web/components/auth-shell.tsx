"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";

interface AuthShellProps {
  children: ReactNode;
  className?: string;
  /** Footer hint rendered under the card. */
  footer?: ReactNode;
  /** Hide the Back button for the first screen in a flow. */
  hideBack?: boolean;
}

/**
 * Centred two-column-ish auth surface — the login-04 shadcn block,
 * mirrored from RyRy79261/intake-tracker. Used by every page that asks
 * the user for credentials, an invite code, or a similar handshake.
 */
export function AuthShell({
  children,
  className,
  footer,
  hideBack,
}: AuthShellProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className={cn("w-full max-w-sm", className)}>
        {!hideBack && (
          <div className="mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        )}
        <Card className="overflow-hidden p-0">
          <CardContent className="p-6 md:p-8">{children}</CardContent>
        </Card>
        {footer && (
          <p className="px-6 pt-4 text-center font-mono text-brand-label font-medium text-muted-foreground">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}

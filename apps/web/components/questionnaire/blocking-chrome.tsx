import type { ReactNode } from "react";
import Link from "next/link";
import { Circle, Lock } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { SignOutLink } from "@/components/auth/sign-out-link";

// The chrome around a questionnaire runner, as AfrikaBurn's fill page draws it:
// the Required/Optional badge, the title, and — for a questionnaire that holds
// the app — a quiet line under the form saying so. Presentational.

/**
 * Whether a questionnaire holds the app ("Required", with a lock) or only waits
 * in the inbox ("Optional"). One badge for both, so a member, and the captain
 * sending it, can always tell which kind a questionnaire is.
 */
export function BlockingBadge({ blocking }: { blocking: boolean }) {
  return blocking ? (
    <Badge variant="destructive">
      <Lock aria-hidden className="size-3" />
      Required
    </Badge>
  ) : (
    <Badge variant="outline">
      <Circle aria-hidden className="size-3" />
      Optional
    </Badge>
  );
}

/**
 * The runner page's header: the badge, the way out, and the title as the
 * page's level-1 heading.
 *
 * A blocking questionnaire holds the whole app, so the console draws no header
 * around it and this is the page's only chrome: its only escape is Sign out.
 * An optional one can wait, so it sits inside the console and its escape is
 * "Later", back to the inbox where it stays listed.
 */
export function RunnerHeader({
  title,
  blocking,
  children,
}: {
  title: string;
  blocking: boolean;
  /** A line or two under the title. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BlockingBadge blocking={blocking} />
        {blocking ? (
          <Button type="button" variant="ghost" size="sm" asChild>
            <SignOutLink />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/notifications">Later</Link>
          </Button>
        )}
      </div>
      <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {children}
    </div>
  );
}

/** The line under a blocking questionnaire: the app stays locked until it is done. */
export function BlockingNotice() {
  return (
    <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      You can&apos;t use the rest of the app until this is finished.
    </p>
  );
}

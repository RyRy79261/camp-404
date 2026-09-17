import { Circle, Lock, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { SignOutLink } from "@/components/auth/sign-out-link";

// Chrome for the blocking-questionnaire RUNNER (surface 24): the sticky top bar,
// the "Required" chip, and the persistent notice. Presentational; rendered by the
// wizard in its runner variant. The questionnaire here is a blocking required
// action, so — unlike the welcoming onboarding chrome — it reads as a hold: a
// Required chip, a question-paced progress bar, and a banner that doesn't dismiss.

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

/** A small "Required" pill with a lock — marks a blocking required action. */
export function RequiredChip() {
  return <BlockingBadge blocking />;
}

/**
 * The runner header: title + Required/Optional badge, an escape, and a progress
 * bar over the wizard body.
 *
 * A blocking questionnaire holds the whole app, so the console draws no header
 * around it and this is the page's only chrome: a bar that sticks to the top,
 * whose only escape is Sign out. An optional one can wait, so it renders inside
 * the console under its sticky header; a second sticky bar would slide beneath
 * that one, so it is a plain page heading instead, and its escape is "Later",
 * back to the inbox where it stays listed.
 */
export function BlockingTopBar({
  title,
  current,
  total,
  signOutHref = "/auth/sign-out",
  showProgress = true,
  blocking = true,
}: {
  title: string;
  current: number;
  total: number;
  signOutHref?: string;
  showProgress?: boolean;
  blocking?: boolean;
}) {
  const progress = showProgress && (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        Step {current} of {total}
      </span>
      <ProgressBar
        value={current}
        max={total}
        label="Questionnaire progress"
        className="flex-1"
      />
    </div>
  );

  if (!blocking) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <BlockingBadge blocking={false} />
            </div>
            {/* The runner page's level-1 heading (the page has no other). */}
            <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href="/notifications">Later</a>
          </Button>
        </div>
        {progress}
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-b bg-card px-4 py-3">
      <div className="flex items-center gap-2.5">
        {/* The runner page's level-1 heading (the page dropped its own header). */}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {title}
        </h1>
        <BlockingBadge blocking />
        <Button type="button" variant="ghost" size="sm" asChild>
          <SignOutLink href={signOutHref} />
        </Button>
      </div>
      {progress}
    </div>
  );
}

/**
 * A persistent destructive banner — the app stays blocked until this is done.
 * role="status" (not the error tone's default role="alert"): it's static context
 * present at mount, not a transient event, and the wizard's save-failure banner
 * is the one that should own the assertive alert region.
 */
export function BlockingNotice() {
  return (
    <Alert variant="error" role="status">
      <TriangleAlert aria-hidden />
      <span>
        You can&apos;t use the rest of the app until this is finished.
      </span>
    </Alert>
  );
}

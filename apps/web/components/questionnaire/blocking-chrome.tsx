import { Lock, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { ProgressBar } from "@camp404/ui/components/progress-bar";

// Chrome for the blocking-questionnaire RUNNER (surface 24): the sticky top bar,
// the "Required" chip, and the persistent notice. Presentational; rendered by the
// wizard in its runner variant. The questionnaire here is a blocking required
// action, so — unlike the welcoming onboarding chrome — it reads as a hold: a
// Required chip, a question-paced progress bar, and a banner that doesn't dismiss.

/** A small "Required" pill with a lock — marks a blocking required action. */
export function RequiredChip() {
  return (
    <Badge variant="destructive">
      <Lock aria-hidden className="size-3" />
      Required
    </Badge>
  );
}

/**
 * The sticky runner header: title + Required chip, a Sign-out escape (the runner
 * has no first-page "Back"), and a progress bar over the scrolling wizard body.
 */
export function BlockingTopBar({
  title,
  current,
  total,
  signOutHref = "/auth/sign-out",
  showProgress = true,
}: {
  title: string;
  current: number;
  total: number;
  signOutHref?: string;
  showProgress?: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-b bg-card px-4 py-3">
      <div className="flex items-center gap-2.5">
        {/* The runner page's level-1 heading (the page dropped its own header). */}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {title}
        </h1>
        <RequiredChip />
        <Button type="button" variant="ghost" size="sm" asChild>
          <a href={signOutHref}>Sign out</a>
        </Button>
      </div>
      {showProgress && (
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 font-mono text-caption text-muted-foreground">
            Step {current} of {total}
          </span>
          <ProgressBar
            value={current}
            max={total}
            label="Questionnaire progress"
            className="flex-1"
          />
        </div>
      )}
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
      <span>You can&apos;t use the rest of the app until this is finished.</span>
    </Alert>
  );
}

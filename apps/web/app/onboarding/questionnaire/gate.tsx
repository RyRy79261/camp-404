import Link from "next/link";
import { ClipboardList, ListChecks, Lock, Timer } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { GateScreen } from "@/components/auth-shell";
import { SignOutLink } from "@/components/auth/sign-out-link";

// The gate interstitial shown before a required questionnaire, drawn as the
// AfrikaBurn organiser gate screen. A read-only, server-rendered "Before you go
// any further" hold: what's ahead, a Start CTA into the runner, and a sign-out
// escape. No form, no writes, no rank gate (gating is auth + invite +
// completion; the page owns those redirects).

export function QuestionnaireGate({
  title,
  questionCount,
  estimatedMinutes,
  startHref,
}: {
  title: string;
  questionCount: number;
  estimatedMinutes: number;
  startHref: string;
}) {
  return (
    <GateScreen
      icon={<ClipboardList aria-hidden />}
      eyebrow="Required questionnaire"
      title="Before you go any further"
      description="We need a few details before you can use the rest of the app. It only takes a couple of minutes."
    >
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks aria-hidden className="h-4 w-4 shrink-0" />
              {questionCount} {questionCount === 1 ? "question" : "questions"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Timer aria-hidden className="h-4 w-4 shrink-0" />
              about {estimatedMinutes} min
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href={startHref}>Start questionnaire</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <SignOutLink />
        </Button>
      </div>

      <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="h-3 w-3" />
        You can&apos;t skip this — it&apos;s required to continue.
      </p>
    </GateScreen>
  );
}

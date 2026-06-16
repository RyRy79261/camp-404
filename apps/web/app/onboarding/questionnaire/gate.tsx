import Link from "next/link";
import { ClipboardList, Lock } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { IconBadge } from "@camp404/ui/components/icon-badge";
import { QuestionnaireSummaryCard } from "@camp404/ui/components/questionnaire-summary-card";

// Surface 23 — the gate interstitial shown before a required questionnaire. A
// read-only, server-rendered "Before you go any further" hold: what's ahead, a
// Start CTA into the runner, and a sign-out escape. No form, no writes, no rank
// gate (gating is auth + invite + completion; the page owns those redirects).

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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <IconBadge size="lg" shape="circle" tone="primary">
        <ClipboardList aria-hidden />
      </IconBadge>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
          Required questionnaire
        </span>
        <h1 className="text-2xl font-bold leading-tight">
          Before you go any further
        </h1>
        <p className="max-w-prose text-balance text-muted-foreground">
          We need a few details before you can use the rest of the app. It only
          takes a couple of minutes.
        </p>
      </div>

      <QuestionnaireSummaryCard
        className="w-full max-w-sm"
        title={title}
        questionCount={questionCount}
        estimatedMinutes={estimatedMinutes}
      />

      <Button asChild size="lg" className="w-full max-w-sm">
        <Link href={startHref}>Start questionnaire</Link>
      </Button>

      <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <Lock aria-hidden className="size-3" />
        You can&apos;t skip this — it&apos;s required to continue.
      </p>

      <a
        href="/auth/sign-out"
        className="text-label text-muted-foreground underline-offset-4 hover:underline"
      >
        Sign out
      </a>
    </div>
  );
}

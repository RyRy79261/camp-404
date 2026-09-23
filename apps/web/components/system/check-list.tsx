import type { ReactNode } from "react";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import type { CheckTone, SystemCheck } from "@/lib/system-status";

// The System status page's one repeated shape: the state, then the reason for
// it. Ported from the AfrikaBurn console's components/system/check-list.tsx.
//
// A definition list, not a table: the sentence is what a captain needs, and a
// table would squeeze it into a narrow column. The badge answers "is this
// fine?"; the sentence answers "so what do I do?".
//
// Server component: nothing here is interactive.

/**
 * Tone to badge. Only `attention` is amber. A camp with no email provider is
 * working as designed and says so; if that were amber too, the page would
 * always warn and nobody would read it.
 */
export const TONE_VARIANT: Record<
  CheckTone,
  "success" | "secondary" | "warning" | "outline"
> = {
  ok: "success",
  degraded: "secondary",
  attention: "warning",
  info: "outline",
};

/** Said in words for screen readers, so a badge is not a colour-only signal. */
export const TONE_LABEL: Record<CheckTone, string> = {
  ok: "Working",
  degraded: "Not configured",
  attention: "Needs attention",
  info: "For information",
};

export function CheckRow({ check }: { check: SystemCheck }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6">
      <dt className="flex w-full shrink-0 flex-col gap-1.5 sm:w-56">
        <span className="text-sm font-medium text-foreground">
          {check.label}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={TONE_VARIANT[check.tone]}>
            <span className="sr-only">{TONE_LABEL[check.tone]}: </span>
            {check.value}
          </Badge>
        </span>
      </dt>
      <dd className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {check.detail}
        </p>
        {check.env && check.env.length > 0 && (
          // NAMES only: which setting decides this. Never its value.
          <p className="font-mono text-[11px] uppercase tracking-wide break-all text-muted-foreground/70">
            {check.env.join(" · ")}
          </p>
        )}
      </dd>
    </div>
  );
}

export function CheckListCard({
  title,
  description,
  checks,
  footer,
}: {
  title: string;
  description: string;
  checks: readonly SystemCheck[];
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </dl>
        {footer}
      </CardContent>
    </Card>
  );
}

import {
  CircleAlert,
  ListChecks,
  ListOrdered,
  MessageCircleQuestion,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { headcountLabel } from "@camp404/core";
import type { DutyCard } from "@camp404/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";

// A duty card as members read it (#250): who is on the shift, the steps in
// order, the hard rules in red, the lead's end-of-shift checklist, and who to
// ask, as a role. The sections are the About page's cards.

function Section({
  title,
  icon,
  children,
  tone = "accent",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  tone?: "accent" | "destructive";
}) {
  return (
    <Card
      className={tone === "destructive" ? "border-destructive/50" : undefined}
    >
      <CardHeader className="pb-3">
        <CardTitle
          className={
            tone === "destructive"
              ? "flex items-center gap-2 text-base text-destructive"
              : "flex items-center gap-2 text-base"
          }
        >
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

const icon = "h-4 w-4 text-accent";

export function DutyCardView({ card }: { card: DutyCard }) {
  return (
    <div className="flex flex-col gap-6" aria-label="Duty card">
      {card.subRoles.length > 0 ? (
        <Section
          title="Who's on it"
          icon={<Users className={icon} aria-hidden />}
        >
          <ul aria-label="Sub-roles" className="divide-y divide-border">
            {card.subRoles.map((r, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="font-medium">{r.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {headcountLabel(r.min, r.max)}{" "}
                  {r.max === 1 ? "person" : "people"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {card.steps.length > 0 ? (
        <Section
          title="Steps"
          icon={<ListOrdered className={icon} aria-hidden />}
        >
          <ol
            aria-label="Steps"
            className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-semibold marker:text-accent"
          >
            {card.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {card.hardRules.length > 0 ? (
        <Section
          title="Hard rules"
          tone="destructive"
          icon={<CircleAlert className="h-4 w-4" aria-hidden />}
        >
          <ul
            aria-label="Hard rules"
            className="flex list-disc flex-col gap-1.5 pl-5 font-medium text-destructive marker:text-destructive"
          >
            {card.hardRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {card.checklist.length > 0 ? (
        <Section
          title="Lead's end-of-shift checklist"
          icon={<ListChecks className={icon} aria-hidden />}
        >
          <ul
            aria-label="Lead's end-of-shift checklist"
            className="flex flex-col gap-1.5"
          >
            {card.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-border"
                />
                {c}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {card.askRole.trim() !== "" ? (
        <Section
          title="Who to ask"
          icon={<MessageCircleQuestion className={icon} aria-hidden />}
        >
          <p className="font-medium">{card.askRole}</p>
        </Section>
      ) : null}
    </div>
  );
}

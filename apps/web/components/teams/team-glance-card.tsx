import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { cn } from "@camp404/ui/lib/utils";
import type {
  GlanceBars,
  GlanceSegment,
  GlanceTone,
  TeamGlance,
} from "@/lib/team-glance";

// The shared card of a team's "at a glance" panel (lib/team-glance.ts):
// figure tiles (the Power panel's composition), then bar rows, a "Needs
// attention" list and the team's links. Server-drawn; a tone is a square of
// the theme's success / warning / destructive colour beside words that say
// the same, never colour alone.

const TONE_BG: Record<GlanceTone | "none", string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  none: "bg-muted",
};

const TONE_WORD: Record<GlanceTone, string> = {
  ok: "Fine",
  warn: "Needs a look",
  bad: "Needs action",
};

function ToneSquare({ tone }: { tone: GlanceTone }) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0", TONE_BG[tone])}
      aria-label={TONE_WORD[tone]}
      role="img"
    />
  );
}

function Stacked({
  segments,
  label,
}: {
  segments: GlanceSegment[];
  label: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <div
      className="flex h-3 w-full overflow-hidden border border-border"
      role="img"
      aria-label={`${label}: ${segments.map((s) => `${s.count} ${s.label}`).join(", ")}`}
    >
      {total === 0
        ? null
        : segments.map((s) =>
            s.count > 0 ? (
              <span
                key={s.label}
                className={cn("h-full", TONE_BG[s.tone])}
                style={{ flexGrow: s.count }}
              />
            ) : null,
          )}
    </div>
  );
}

function Bars({ bars, id }: { bars: GlanceBars; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3
        id={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {bars.heading}
      </h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-sm">
        {bars.rows.map((row) => (
          <div key={row.key} className="contents">
            <dt>{row.label}</dt>
            <dd className="m-0">
              {row.segments ? (
                <Stacked segments={row.segments} label={row.label} />
              ) : row.progress ? (
                <ProgressBar
                  value={row.progress.value}
                  max={row.progress.max}
                  label={row.label}
                />
              ) : null}
            </dd>
            <dd className="m-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {bars.legend ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {bars.legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2", TONE_BG[l.tone])} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function TeamGlanceCard({
  glance,
  icon: Icon,
  id,
}: {
  glance: TeamGlance;
  icon: LucideIcon;
  /** A stable prefix for the card's ids ("kitchen"). */
  id: string;
}) {
  return (
    <Card data-team-glance={id}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
          {glance.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section
          aria-label={glance.title}
          className={cn(
            "grid gap-3 page-sm:grid-cols-2",
            glance.tiles.length >= 4 && "page-xl:grid-cols-4",
          )}
        >
          {glance.tiles.map((tile) => (
            <article
              key={tile.key}
              aria-labelledby={`${id}-glance-${tile.key}`}
              data-kpi
              className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/30 p-4"
            >
              <span
                id={`${id}-glance-${tile.key}`}
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {tile.label}
              </span>
              <span className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                {tile.tone ? <ToneSquare tone={tile.tone} /> : null}
                {tile.value}
              </span>
              <span className="text-xs text-muted-foreground">{tile.hint}</span>
              {tile.progress ? (
                <ProgressBar
                  className="mt-1"
                  value={tile.progress.value}
                  max={tile.progress.max}
                  label={tile.label}
                />
              ) : null}
            </article>
          ))}
        </section>

        {glance.bars?.map((bars, i) => (
          <Bars key={bars.heading} bars={bars} id={`${id}-bars-${i}`} />
        ))}

        {glance.attention.length > 0 ? (
          <section
            aria-labelledby={`${id}-attention`}
            className="flex flex-col gap-2"
          >
            <h3
              id={`${id}-attention`}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Needs attention
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {glance.attention.map((a) => (
                <li
                  key={a.key}
                  className="grid grid-cols-[0.625rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 page-sm:grid-cols-[0.625rem_minmax(0,1fr)_auto]"
                >
                  <ToneSquare tone={a.tone} />
                  <span className="[overflow-wrap:anywhere]">{a.text}</span>
                  {a.link ? (
                    <Link
                      href={a.link.href}
                      className="col-start-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline page-sm:col-start-3"
                    >
                      {a.link.label}
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {glance.links.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {glance.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs font-medium text-accent hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}

        {glance.note ? (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            {glance.note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

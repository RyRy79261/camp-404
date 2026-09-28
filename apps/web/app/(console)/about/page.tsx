import Link from "next/link";
import {
  Bus,
  CalendarDays,
  Gift,
  HandCoins,
  Heart,
  MapPin,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react";
import { formatMoney, hasClearance } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import type { JoinScheduleEntry } from "@camp404/types";
import type { ReactNode } from "react";
import { getAboutCamp } from "@/lib/about";
import { burnDatesLabel } from "@/lib/burn-countdown";
import { captainPageGate } from "@/lib/captain-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "About Camp 404 — Camp 404" };

// About Camp 404 (#264): what the camp is, how it works, what a member puts
// in and gets out. It used to be a Notion page members were sent; now every
// member reads it here. The words are the ones captains keep in the Join site
// program (one document for join.camp-404.com and this page, audited on
// save), so a captain gets a button to edit them and everyone else reads.
// The composition is a team page's: the main cards on the left, the short
// facts beside.
//
// The fee card shows the suggested scale but not the spend list's amounts:
// those figures came from last year's budget, and the camp does not restate
// last year's numbers as this year's.

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
        {children}
      </CardContent>
    </Card>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-accent">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Schedule({
  title,
  entries,
}: {
  title: string;
  entries: readonly JoinScheduleEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <dl className="divide-y divide-border">
        {entries.map((e) => (
          <div
            key={`${e.when}-${e.what}`}
            className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3 py-1.5"
          >
            <dt className="font-medium">{e.when}</dt>
            <dd>
              {e.what}
              {e.allHands ? (
                <span className="ml-2 whitespace-nowrap text-xs font-semibold uppercase text-accent">
                  All hands
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const icon = "h-4 w-4 text-accent";

export default async function AboutPage() {
  const { rank } = await captainPageGate("camp_member");
  const about = await getAboutCamp();
  const { content } = about;
  const canEdit = hasClearance(rank, "captain");
  const dates = about.burn ? burnDatesLabel(about.burn) : null;
  const gifts = [...content.gifts.primary, ...content.gifts.secondary];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / About"
        title="About Camp 404"
        description="What the camp is, how it works, and what you put in and get out."
        actions={
          canEdit ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/captains/join-site">
                <Pencil aria-hidden />
                Edit these words
              </Link>
            </Button>
          ) : null
        }
      />
      {canEdit ? (
        <p className="-mt-3 mb-6 text-sm text-muted-foreground">
          These are the same words as join.camp-404.com. A change in Join site
          shows here and there.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-3">
        <div className="flex flex-col gap-6 page-lg:col-span-2">
          <Section
            title={content.readme.heading}
            icon={<Heart className={icon} aria-hidden />}
          >
            {content.readme.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-medium">
              {content.readme.warning}
            </p>
            <blockquote className="border-l-2 border-accent pl-4 italic text-muted-foreground">
              {content.readme.quote}
            </blockquote>
          </Section>

          <Section
            title="How the camp works"
            icon={<Users className={icon} aria-hidden />}
          >
            <p>{content.teams.intro}</p>
            <ul aria-label="Teams" className="divide-y divide-border">
              {about.teams.map((t) => (
                <li
                  key={t.key}
                  className="grid gap-x-3 py-2 page-sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
                >
                  <Link
                    href={`/teams/${encodeURIComponent(t.key)}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {t.label}
                  </Link>
                  <span className="text-muted-foreground">{t.description}</span>
                </li>
              ))}
            </ul>
            {content.teams.outro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </Section>

          <Section
            title="What we give Tankwa Town"
            icon={<Gift className={icon} aria-hidden />}
          >
            <p>{content.gifts.intro}</p>
            <ul className="divide-y divide-border">
              {gifts.map((g) => (
                <li key={g.name} className="py-2">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground"> — {g.text}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="What you put in"
            icon={<CalendarDays className={icon} aria-hidden />}
          >
            {/* The note says the dates are still to be confirmed, so it only
                shows until this year's Burn dates are set. */}
            <p className="text-muted-foreground">
              {dates
                ? `${about.yearName ?? `The ${about.year} Burn`}: ${dates}.`
                : content.schedule.datesNote}
            </p>
            <Schedule title="Before" entries={content.schedule.before} />
            <Schedule title="On site" entries={content.schedule.onSite} />
            <Schedule title="After" entries={content.schedule.after} />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Daily shifts
            </h4>
            <p>{content.schedule.shiftsIntro}</p>
            <Bullets items={content.schedule.shifts} />
            <p className="rounded-md bg-accent/10 px-3 py-2 font-medium">
              {content.schedule.proactive}
            </p>
          </Section>

          <Section
            title="The camp fee"
            icon={<HandCoins className={icon} aria-hidden />}
          >
            <p>{content.fee.intro}</p>
            <ul aria-label="Fee scale" className="divide-y divide-border">
              {content.fee.tiers.map((tier) => (
                <li
                  key={tier.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 py-2"
                >
                  <span>
                    <span className="font-medium">{tier.name}</span>
                    {tier.note ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {tier.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(tier.rands * 100, content.fee.currency)}
                  </span>
                </li>
              ))}
              <li className="py-2">
                <span className="font-medium">{content.fee.subsidy.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {content.fee.subsidy.note}
                </span>
              </li>
            </ul>
            <p>Tent fee (optional): {content.fee.tentFee}</p>
            {content.fee.spend.length > 0 ? (
              <>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What the fees pay for
                </h4>
                <Bullets items={content.fee.spend.map((s) => s.what)} />
                <p className="text-muted-foreground">{content.fee.spendNote}</p>
              </>
            ) : null}
            <p>{content.fee.guidance}</p>
          </Section>

          <Section
            title="What you get out"
            icon={<Gift className={icon} aria-hidden />}
          >
            <Bullets items={content.perks.summary} />
            {content.perks.files.map((f) => (
              <div key={f.file} className="flex flex-col gap-1">
                <h4 className="font-semibold">{f.name}</h4>
                {f.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ))}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section
            title="Where we are"
            icon={<MapPin className={icon} aria-hidden />}
          >
            <p className="font-medium">{content.map.where}</p>
            <Bullets items={content.map.lines} />
          </Section>

          <Section
            title="The crew"
            icon={<Users className={icon} aria-hidden />}
          >
            <p>
              The camp runs from {content.crew.capacity.min} people and has room
              for {content.crew.capacity.max}.
            </p>
            {about.captains.length > 0 ? (
              <>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Captains
                </h4>
                <ul aria-label="Captains" className="flex flex-col gap-2">
                  {about.captains.map((c) => (
                    <li key={c.name}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.title}
                      </span>
                      {c.blurb ? (
                        <span className="block text-muted-foreground">
                          {c.blurb}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p>
              Everyone in the camp is on the{" "}
              <Link
                href="/captains/camp-management"
                className="font-medium underline underline-offset-4"
              >
                Roster
              </Link>
              .
            </p>
          </Section>

          <Section
            title="Getting stuff to the Burn"
            icon={<Bus className={icon} aria-hidden />}
          >
            <Bullets items={content.truck.entries} />
          </Section>

          <Section
            title="How people join"
            icon={<UserPlus className={icon} aria-hidden />}
          >
            <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-accent">
              {content.readme.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>
              Bringing a friend? Give them a code from{" "}
              <Link
                href="/tools/invite"
                className="font-medium underline underline-offset-4"
              >
                Invites
              </Link>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  CalendarDays,
  Contact,
  Gift,
  HandCoins,
  Heart,
  MapPin,
  Pencil,
  Sparkles,
  Ticket,
  Truck,
  Users,
} from "lucide-react";
import { formatMoney, hasClearance } from "@camp404/core";
import type { JoinScheduleEntry } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import type { ReactNode } from "react";
import {
  InlineParagraphs,
  InlineText,
} from "@/components/markdown/inline-text";
import { getAboutCamp } from "@/lib/about";
import { burnDatesLabel } from "@/lib/burn-countdown";
import { captainPageGate } from "@/lib/captain-gate";
import { GIFT_ICON } from "@/lib/join-gift-icons";
import { AboutToc, type TocItem } from "./about-toc";

export const dynamic = "force-dynamic";

export const metadata = { title: "About Camp 404 — Camp 404" };

// About Camp 404 (#264): what the camp is, how it works, what a member puts
// in and gets out. It used to be a Notion page members were sent; now every
// member reads it here. The words are the ones captains keep in the Join site
// program (one document for join.camp-404.com and this page, audited on
// save), so a captain gets a button to edit them and everyone else reads.
//
// Laid out as the approved redesign draws it (2026-10-01, Option A): three
// columns in a wide window, "On this page", the cards, and the quick facts;
// in a narrower one the facts go beside or under the cards and "On this page"
// becomes a row of links.
//
// The fee card shows the suggested scale but not the spend list's amounts:
// those figures came from last year's budget, and the camp does not restate
// last year's numbers as this year's.

const MAIN: TocItem[] = [
  { id: "about-who", label: "Who we are" },
  { id: "about-teams", label: "How the camp works" },
  { id: "about-gifts", label: "What we give" },
  { id: "about-schedule", label: "What you put in" },
  { id: "about-fee", label: "The camp fee" },
  { id: "about-perks", label: "What you get out" },
  { id: "about-truck", label: "Getting there" },
];
const FACTS: TocItem[] = [
  { id: "about-where", label: "Where we are" },
  { id: "about-crew", label: "The crew" },
];

function ReadCard({
  id,
  title,
  icon,
  description,
  flush,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  description?: ReactNode;
  /** The body runs edge to edge (a table), not inside the card's padding. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
      aria-labelledby={`${id}-title`}
      role="region"
      className={cn("scroll-mt-4", flush ? "p-0" : "p-4 page-sm:p-5")}
    >
      <div
        className={cn(
          "mb-4 flex flex-col gap-1",
          flush && "px-4 pt-4 page-sm:px-5 page-sm:pt-5",
        )}
      >
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 font-pixel text-[11px] uppercase leading-4 tracking-[0.2em] [&_svg]:size-4 [&_svg]:text-accent"
        >
          {icon}
          {title}
        </h2>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 text-sm leading-[22px]">
        {children}
      </div>
    </Card>
  );
}

function Bullets({
  items,
  label,
}: {
  items: readonly string[];
  label?: string;
}) {
  return (
    <ul
      aria-label={label}
      className="flex list-disc flex-col gap-1 pl-4 marker:text-accent"
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A label row inside a flush card, as in the mock-up's tables. */
function GroupRow({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border/70 bg-muted/40 px-4 py-2 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground page-sm:px-5">
      {children}
    </p>
  );
}

function ScheduleGroup({
  label,
  entries,
}: {
  label: string;
  entries: readonly JoinScheduleEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <>
      <GroupRow>{label}</GroupRow>
      <ul aria-label={label}>
        {entries.map((e, i) => (
          <li
            key={i}
            className="grid gap-x-6 gap-y-1 border-t border-border/70 px-4 py-2.5 first:border-t-0 page-sm:grid-cols-[8rem_minmax(0,1fr)] page-sm:px-5"
          >
            <span className="flex flex-wrap items-center gap-2 font-semibold page-sm:flex-col page-sm:items-start page-sm:gap-1">
              {e.when}
              {e.allHands ? (
                <span className="whitespace-nowrap border border-accent px-1.5 py-0.5 font-pixel text-[9px] uppercase leading-3 tracking-[0.12em] text-accent">
                  All hands
                </span>
              ) : null}
            </span>
            <span>{e.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const icon = (Icon: typeof Heart) => <Icon aria-hidden />;

export default async function AboutPage() {
  const { rank } = await captainPageGate("camp_member");
  const about = await getAboutCamp();
  const { content } = about;
  const canEdit = hasClearance(rank, "captain");
  const dates = about.burn ? burnDatesLabel(about.burn) : null;
  const gifts = [...content.gifts.primary, ...content.gifts.secondary];
  // "TBC" is not a fee: the tent fee shows once it has an amount.
  const tentFee = /\d/.test(content.fee.tentFee) ? content.fee.tentFee : null;
  const rands = (n: number) =>
    formatMoney(n * 100, content.fee.currency, { wholeRands: true });

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / About"
        title="About Camp 404"
        description="What the camp is, how it works, and what you put in and get out."
        actions={
          canEdit ? (
            <div className="flex flex-col gap-1 page-sm:items-end">
              <Button asChild variant="outline" size="sm">
                <Link href="/captains/join-site">
                  <Pencil aria-hidden />
                  Edit in Join site
                </Link>
              </Button>
              <p className="text-xs leading-4 text-muted-foreground">
                Also changes join.camp-404.com
              </p>
            </div>
          ) : null
        }
      />

      <AboutToc items={[...MAIN, ...FACTS]} variant="row" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @min-[48rem]/page:grid-cols-[minmax(0,1fr)_15rem] @min-[54rem]/page:grid-cols-[10rem_minmax(0,1fr)_17rem]">
        <AboutToc items={MAIN} variant="column" />

        <div className="flex min-w-0 flex-col gap-4">
          <ReadCard id="about-who" title="Who we are" icon={icon(Heart)}>
            <p className="text-[15px] font-bold">{content.readme.heading}</p>
            <InlineParagraphs paragraphs={content.readme.paragraphs} />
            <p className="border border-accent/45 bg-accent/10 px-3 py-2 font-semibold leading-5">
              {content.readme.warning}
            </p>
            <blockquote className="border-l-2 border-accent pl-4 italic text-muted-foreground">
              {content.readme.quote}
            </blockquote>
          </ReadCard>

          <ReadCard
            id="about-teams"
            title="How the camp works"
            icon={icon(Users)}
          >
            <p>{content.teams.intro}</p>
            <ul aria-label="Teams" className="flex flex-col">
              {about.teams.map((t) => (
                <li
                  key={t.key}
                  className="grid gap-x-4 border-t border-border/70 py-2 first:border-t-0 page-sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
                >
                  <Link
                    href={`/teams/${encodeURIComponent(t.key)}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {t.label}
                  </Link>
                  <span className="text-muted-foreground">{t.description}</span>
                </li>
              ))}
            </ul>
            <InlineParagraphs paragraphs={content.teams.outro} />
          </ReadCard>

          <ReadCard id="about-gifts" title="What we give" icon={icon(Gift)}>
            <p>{content.gifts.intro}</p>
            <ul aria-label="Gifts" className="flex flex-col">
              {gifts.map((g, i) => {
                const GiftGlyph = GIFT_ICON[g.icon].icon;
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border/70 py-2.5 first:border-t-0"
                  >
                    <span className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-accent">
                      <GiftGlyph className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold">{g.name}</span>
                      <span className="block text-muted-foreground">
                        {g.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </ReadCard>

          <ReadCard
            id="about-schedule"
            title="What you put in"
            icon={icon(CalendarDays)}
            flush
            // The note says the dates are still to be confirmed, so it only
            // shows until this year's Burn dates are set.
            description={
              dates
                ? `${about.yearName ?? `The ${about.year} Burn`}: ${dates}.`
                : content.schedule.datesNote
            }
          >
            <div className="flex flex-col">
              <ScheduleGroup
                label="Before the Burn"
                entries={content.schedule.before}
              />
              <ScheduleGroup
                label="On site"
                entries={content.schedule.onSite}
              />
              <ScheduleGroup
                label="After the Burn"
                entries={content.schedule.after}
              />
              <GroupRow>Shifts on site</GroupRow>
              <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 page-sm:px-5">
                <p>{content.schedule.shiftsIntro}</p>
                <Bullets items={content.schedule.shifts} label="Shifts" />
                <p className="border border-accent/45 bg-accent/10 px-3 py-2 font-semibold leading-5">
                  {content.schedule.proactive}
                </p>
              </div>
            </div>
          </ReadCard>

          <ReadCard
            id="about-fee"
            title="The camp fee"
            icon={icon(HandCoins)}
            flush
            description={content.fee.intro}
          >
            <div className="flex flex-col">
              <div
                aria-hidden
                className="hidden grid-cols-[8rem_minmax(0,1fr)_7rem] gap-x-4 border-t border-border/70 px-5 py-2 text-xs font-semibold text-muted-foreground page-sm:grid"
              >
                <span>Level</span>
                <span>What it means</span>
                <span className="text-right">Fee</span>
              </div>
              <ul aria-label="Fee scale">
                {[
                  {
                    key: "subsidy",
                    name: content.fee.subsidy.name,
                    note: content.fee.subsidy.note,
                    amount: "What you can",
                  },
                  ...content.fee.tiers.map((t) => ({
                    key: t.key,
                    name: t.name,
                    note: t.note,
                    amount: rands(t.rands),
                  })),
                  ...(tentFee
                    ? [
                        {
                          key: "tent",
                          name: "Tent fee",
                          note: "Optional, on top of the fee.",
                          amount: tentFee,
                        },
                      ]
                    : []),
                ].map((row) => (
                  <li
                    key={row.key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-t border-border/70 px-4 py-2.5 page-sm:grid-cols-[8rem_minmax(0,1fr)_7rem] page-sm:px-5"
                  >
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-right tabular-nums page-sm:order-3">
                      {row.amount}
                    </span>
                    {row.note ? (
                      <span className="col-span-2 text-muted-foreground page-sm:order-2 page-sm:col-span-1">
                        {row.note}
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className="hidden page-sm:order-2 page-sm:block"
                      />
                    )}
                  </li>
                ))}
              </ul>
              {content.fee.spend.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-3 page-sm:px-5">
                  <h3 className="font-semibold">What the fees pay for</h3>
                  <Bullets
                    items={content.fee.spend.map((s) => s.what)}
                    label="What the fees pay for"
                  />
                  <p className="text-muted-foreground">
                    {content.fee.spendNote}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 page-sm:px-5">
                <p>{content.fee.guidance}</p>
                <blockquote className="border-l-2 border-accent pl-4 italic text-muted-foreground">
                  {content.fee.quote}
                </blockquote>
              </div>
            </div>
          </ReadCard>

          <ReadCard
            id="about-perks"
            title="What you get out"
            icon={icon(Sparkles)}
          >
            <Bullets items={content.perks.summary} label="What you get" />
            {content.perks.files.map((f, i) => (
              <div key={i} className="flex flex-col gap-1">
                <h3 className="font-semibold">{f.name}</h3>
                {f.paragraphs.map((p, j) => (
                  <p key={j}>
                    <InlineText text={p} />
                  </p>
                ))}
              </div>
            ))}
          </ReadCard>

          <ReadCard id="about-truck" title="Getting there" icon={icon(Truck)}>
            <Bullets items={content.truck.entries} />
          </ReadCard>
        </div>

        <aside
          aria-label="Quick facts"
          className="flex min-w-0 flex-col gap-4 @min-[48rem]/page:sticky @min-[48rem]/page:bottom-0 @min-[48rem]/page:self-end"
        >
          <ReadCard id="about-where" title="Where we are" icon={icon(MapPin)}>
            <p className="font-bold">{content.map.where}</p>
            <Bullets items={content.map.lines} />
          </ReadCard>

          <ReadCard id="about-crew" title="The crew" icon={icon(Contact)}>
            <p>
              The camp runs from <b>{content.crew.capacity.min}</b> people and
              has room for <b>{content.crew.capacity.max}</b>.
            </p>
            {about.captains.length > 0 ? (
              <ul aria-label="Captains" className="flex flex-col gap-3">
                {about.captains.map((c) => (
                  <li key={c.name} className="flex flex-col leading-5">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {c.title}
                    </span>
                    {c.blurb ? (
                      <span className="text-[13px] text-muted-foreground">
                        {c.blurb}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </ReadCard>

          <ReadCard
            id="about-invite"
            title="Bringing someone?"
            icon={icon(Ticket)}
          >
            <p className="text-muted-foreground">
              Send them an invite. They sign up, answer a few questions and pick
              their teams.
            </p>
            <Link
              href="/tools/invite"
              className="text-[13px] font-semibold text-accent underline-offset-4 hover:underline"
            >
              Open Invites
            </Link>
          </ReadCard>
        </aside>
      </div>
    </div>
  );
}

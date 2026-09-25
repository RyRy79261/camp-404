"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { GIFT_ICONS, type JoinSiteContent } from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import type { JoinEditorTeam } from "@/lib/join-site";
import { describeTeamAction, setBurnDatesAction } from "./actions";
import { SectionForm, type Field } from "./section-form";

// Every window of join.camp-404.com, in desktop order, each its own form. The
// field lists here are the only per-section code; SectionForm draws them.

type Json = Record<string, unknown>;

const scheduleRows = (path: string, label: string): Field => ({
  path,
  label,
  kind: "rows",
  columns: [
    { key: "when", label: "When", kind: "text" },
    { key: "allHands", label: "All hands", kind: "check" },
    { key: "what", label: "What happens", kind: "area" },
  ],
  blank: { when: "", what: "" },
});

const giftRows = (path: string, label: string): Field => ({
  path,
  label,
  kind: "rows",
  columns: [
    { key: "name", label: "Name", kind: "text" },
    { key: "icon", label: "Icon", kind: "select", options: GIFT_ICONS },
    { key: "text", label: "What it is", kind: "area" },
  ],
  blank: { icon: "art", name: "", text: "" },
});

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "tier";

const SECTIONS: {
  key: keyof JoinSiteContent;
  window: string;
  title: string;
  description: string;
  fields: Field[];
  prepare?: (v: Json) => Json;
}[] = [
  {
    key: "readme",
    window: "README.TXT",
    title: "Readme",
    description: "The first window: who the camp is, and how to join.",
    fields: [
      { path: "heading", label: "Heading", kind: "text" },
      {
        path: "paragraphs",
        label: "Paragraphs",
        kind: "lines",
        help: "One paragraph per line.",
      },
      { path: "warning", label: "Warning", kind: "area" },
      { path: "quote", label: "Quote", kind: "area" },
      {
        path: "steps",
        label: "How to join",
        kind: "lines",
        help: "One step per line.",
      },
    ],
  },
  {
    key: "teams",
    window: "TEAMS/",
    title: "Teams",
    description:
      "The words around the team folder. The teams themselves come from Camp settings; say what each does below.",
    fields: [
      { path: "intro", label: "Above the teams", kind: "area" },
      {
        path: "outro",
        label: "Below the teams",
        kind: "lines",
        help: "One paragraph per line.",
      },
    ],
  },
  {
    key: "gifts",
    window: "GIFTS.EXE",
    title: "Gifts",
    description: "What the camp gives to Tankwa Town, main gifts first.",
    fields: [
      { path: "intro", label: "Intro", kind: "text" },
      giftRows("primary", "Main gifts (top row)"),
      giftRows("secondary", "Other gifts"),
    ],
  },
  {
    key: "map",
    window: "MAP.GPS",
    title: "Map",
    description: "Where the camp is and what is around it.",
    fields: [
      { path: "where", label: "Where (on the map)", kind: "text" },
      {
        path: "lines",
        label: "Notes",
        kind: "lines",
        help: "One note per line.",
      },
    ],
  },
  {
    key: "crew",
    window: "CREW.DB",
    title: "Crew",
    description:
      "The headcount bar. The numbers come from the “Coming this year?” answers. Captains appear when they switch on “Show me on join.camp-404.com” on their profile.",
    fields: [
      { path: "capacity.min", label: "Minimum to run", kind: "number" },
      { path: "capacity.max", label: "Full camp", kind: "number" },
      { path: "counting", label: "Before anyone answers", kind: "area" },
    ],
  },
  {
    key: "schedule",
    window: "SCHEDULE.CAL",
    title: "Schedule",
    description: "How the build, the Burn and the strike run.",
    fields: [
      { path: "datesNote", label: "Note under the Burn's dates", kind: "area" },
      scheduleRows("before", "Before"),
      scheduleRows("onSite", "On site"),
      scheduleRows("after", "After"),
      { path: "shiftsIntro", label: "Shifts intro", kind: "text" },
      {
        path: "shifts",
        label: "Shifts",
        kind: "lines",
        help: "One shift per line.",
      },
      { path: "proactive", label: "Closing call", kind: "area" },
    ],
  },
  {
    key: "fee",
    window: "FEE.CALC",
    title: "Fee",
    description:
      "The sliding scale, in rands. The dollar figure beside each amount is only a label, worked out at the rate you type.",
    fields: [
      {
        path: "tiers",
        label: "Tiers, lowest first",
        kind: "rows",
        columns: [
          { key: "name", label: "Name", kind: "text" },
          { key: "rands", label: "Rands", kind: "number" },
          { key: "note", label: "Note (optional)", kind: "area" },
        ],
        blank: { key: "", name: "", rands: 0 },
      },
      {
        path: "usdRate.randsPerDollar",
        label: "Rands per dollar",
        kind: "number",
      },
      { path: "usdRate.asOf", label: "Rate as of", kind: "text" },
      { path: "subsidy.name", label: "Below the lowest tier", kind: "text" },
      { path: "subsidy.note", label: "Subsidy note", kind: "area" },
      { path: "scaleIntro", label: "Above the scale", kind: "text" },
      { path: "tentFee", label: "Tent fee", kind: "text" },
      { path: "intro", label: "Intro", kind: "area" },
      {
        path: "spend",
        label: "Where the money goes",
        kind: "rows",
        columns: [
          { key: "what", label: "What", kind: "text" },
          { key: "rands", label: "Rands", kind: "number" },
        ],
        blank: { what: "", rands: 0 },
      },
      { path: "spendNote", label: "Under the spend", kind: "text" },
      { path: "guidance", label: "Guidance", kind: "area" },
      { path: "quote", label: "Quote", kind: "area" },
    ],
    // Money is rands only (AGENTS.md); a tier's key follows its name.
    prepare: (v) => ({
      ...v,
      currency: "ZAR",
      tiers: ((v.tiers as Json[]) ?? []).map((t) => ({
        ...t,
        key: slug(String(t.name ?? "")),
        note: String(t.note ?? "").trim() || undefined,
      })),
    }),
  },
  {
    key: "perks",
    window: "PERKS/",
    title: "Perks",
    description: "What members get, and the files in the perks folder.",
    fields: [
      {
        path: "summary",
        label: "The list",
        kind: "lines",
        help: "One perk per line.",
      },
      {
        path: "files",
        label: "Files",
        kind: "rows",
        columns: [
          { key: "file", label: "File name (like LOUNGE.TXT)", kind: "text" },
          { key: "name", label: "Title", kind: "text" },
          {
            key: "paragraphs",
            label: "Paragraphs, one per line",
            kind: "lines",
          },
        ],
        blank: { file: "", name: "", paragraphs: [] },
      },
    ],
  },
  {
    key: "truck",
    window: "TRUCK.LOG",
    title: "Truck",
    description: "How the camp gets there.",
    fields: [
      {
        path: "entries",
        label: "Log",
        kind: "lines",
        help: "One entry per line.",
      },
    ],
  },
  {
    key: "apply",
    window: "APPLY.EXE",
    title: "Apply",
    description: "The window that sends people to sign up.",
    fields: [
      { path: "body", label: "Words", kind: "area" },
      { path: "invite", label: "Invite line", kind: "text" },
      { path: "button", label: "Button", kind: "text" },
    ],
  },
];

function BurnDatesCard({
  yearIsSet,
  year,
  yearName,
  burn,
}: {
  yearIsSet: boolean;
  year: number;
  yearName: string | null;
  burn: { start: string; end: string } | null;
}) {
  const router = useRouter();
  const [start, setStart] = useState(burn?.start ?? "");
  const [end, setEnd] = useState(burn?.end ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(s: string, e: string) {
    setError(null);
    startTransition(async () => {
      const res = await setBurnDatesAction(s, e);
      if (res.ok) {
        toast.success(
          s ? "The Burn's dates are saved." : "The Burn's dates are cleared.",
        );
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card id="dates" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">
          {yearIsSet
            ? `The Burn, ${year}${yearName ? ` (${yearName})` : ""}`
            : "The Burn"}
        </CardTitle>
        <CardDescription>
          The site counts down to the first day, and every window says the
          camp&apos;s year.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {yearIsSet ? (
          <form
            aria-label="The Burn's dates"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(start, end);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="burn-start">First day</Label>
                <Input
                  id="burn-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="burn-end">Last day</Label>
                <Input
                  id="burn-end"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <Alert variant="error">
                <TriangleAlert />
                <span>{error}</span>
              </Alert>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={pending || !burn}
                onClick={() => {
                  setStart("");
                  setEnd("");
                  save("", "");
                }}
              >
                Clear dates
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save dates
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Name the camp&apos;s year first, in{" "}
            <Link href="/captains/camp-settings/cycle" className="underline">
              Camp settings
            </Link>
            . The site then shows it, and you can give the Burn&apos;s dates
            here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamRow({ team }: { team: JoinEditorTeam }) {
  const router = useRouter();
  const [text, setText] = useState(team.description);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `team-${team.key}`;
  return (
    <form
      className="flex flex-col gap-1.5 border-b border-border pb-4 last:border-0"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await describeTeamAction(team.key, text);
          if (res.ok) {
            toast.success(`${team.label} saved.`);
            router.refresh();
          } else {
            setError(res.error);
          }
        });
      }}
    >
      <Label htmlFor={id}>{team.label}</Label>
      <div className="flex gap-2">
        <Textarea
          id={id}
          rows={2}
          value={text}
          placeholder={team.defaultDescription}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          className="self-end"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : "Save"}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        !text && (
          <p className="text-xs text-muted-foreground">
            Empty shows the grey default above.
          </p>
        )
      )}
    </form>
  );
}

export function JoinSiteEditor({
  data,
}: {
  data: {
    year: number;
    yearIsSet: boolean;
    yearName: string | null;
    burn: { start: string; end: string } | null;
    content: JoinSiteContent;
    teams: JoinEditorTeam[];
  };
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav
        aria-label="Join site windows"
        className="hidden lg:sticky lg:top-24 lg:block"
      >
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <a
              href="#dates"
              className="text-muted-foreground hover:text-foreground"
            >
              The Burn
            </a>
          </li>
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <a
                href={`#${s.key}`}
                className="font-mono text-xs uppercase text-muted-foreground hover:text-foreground"
              >
                {s.window}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#team-lines"
              className="text-muted-foreground hover:text-foreground"
            >
              What each team does
            </a>
          </li>
        </ul>
      </nav>

      <div className="flex max-w-3xl flex-col gap-6">
        <BurnDatesCard
          yearIsSet={data.yearIsSet}
          year={data.year}
          yearName={data.yearName}
          burn={data.burn}
        />
        {SECTIONS.map((s) => (
          <SectionForm
            key={s.key}
            id={s.key}
            section={s.key}
            title={s.title}
            description={`${s.window} — ${s.description}`}
            fields={s.fields}
            initial={data.content[s.key] as Json}
            prepare={s.prepare}
          />
        ))}
        <Card id="team-lines" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="text-base">What each team does</CardTitle>
            <CardDescription>
              One line per team for the TEAMS/ folder. Rename, reorder or
              archive teams in Camp settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.teams.map((t) => (
              <TeamRow key={t.key} team={t} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

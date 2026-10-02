"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  Gift,
  HandCoins,
  Heart,
  Loader2,
  MapPin,
  Sparkles,
  Ticket,
  TriangleAlert,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  JoinSections,
  type JoinSectionKey,
  type JoinSiteContent,
} from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";
import type { JoinEditorData } from "@/lib/join-site";
import { scrollInWindow } from "@/lib/scroll-in-window";
import { saveJoinPageAction, type JoinPageInput } from "./actions";
import {
  ApplySection,
  CrewSection,
  FeeSection,
  GiftsSection,
  MapSection,
  PerksSection,
  ReadmeSection,
  ScheduleSection,
  TeamsSection,
  TruckSection,
  type BurnDraft,
} from "./sections";

// The Join site program (approved redesign, 2026-10-01, Option A): the words
// on About Camp 404 and on join.camp-404.com, one section open at a time. The
// sections run down the left (AfrikaBurn's questionnaire builder), named as
// members read them on About, each with its join-site window as a small tag;
// the open section fills the right. One Save, bottom right, saves every
// section changed, and the footer says which are not saved yet. On a phone the
// list is its own screen and "All sections" goes back.

type C = JoinSiteContent;

export const SECTIONS: {
  key: JoinSectionKey;
  title: string;
  file: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    key: "readme",
    title: "Who we are",
    file: "README.TXT",
    description:
      "The first card on About, and the README.TXT window on the join site.",
    icon: Heart,
  },
  {
    key: "teams",
    title: "How the camp works",
    file: "TEAMS/",
    description: "The words around the team list, and one line for each team.",
    icon: Users,
  },
  {
    key: "gifts",
    title: "What we give",
    file: "GIFTS.EXE",
    description:
      "What the camp gives to Tankwa Town. The main gifts show as the top row.",
    icon: Gift,
  },
  {
    key: "map",
    title: "Where we are",
    file: "MAP.GPS",
    description: "Where the camp is on the map, and what is around it.",
    icon: MapPin,
  },
  {
    key: "crew",
    title: "The crew",
    file: "CREW.DB",
    description: "How many people the camp needs, and room for.",
    icon: UsersRound,
  },
  {
    key: "schedule",
    title: "What you put in",
    file: "SCHEDULE.CAL",
    description: "The year at a glance, and the shifts everyone does on site.",
    icon: CalendarDays,
  },
  {
    key: "fee",
    title: "The camp fee",
    file: "FEE.CALC",
    description: "In the order members read it. Amounts are whole rands.",
    icon: HandCoins,
  },
  {
    key: "perks",
    title: "What you get out",
    file: "PERKS/",
    description: "What members get, and the files in the PERKS/ folder.",
    icon: Sparkles,
  },
  {
    key: "truck",
    title: "Getting there",
    file: "TRUCK.LOG",
    description: "How the camp and its stuff get to the Burn.",
    icon: Car,
  },
  {
    key: "apply",
    title: "How to join",
    file: "APPLY.EXE",
    description:
      "The window on the join site that sends people to sign up with an invite code.",
    icon: Ticket,
  },
];

const TITLE = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s.title]),
) as Record<JoinSectionKey, string>;

// Where a problem is, in the words the editor shows: a field's label, and
// "line N" for a row of a table.
const FIELD: Record<string, string> = {
  "readme.heading": "Heading",
  "readme.paragraphs": "Words",
  "readme.warning": "Warning",
  "readme.quote": "Quote",
  "readme.steps": "How to join, step",
  "teams.intro": "Above the teams",
  "teams.outro": "Below the teams",
  "gifts.intro": "Intro",
  "gifts.primary": "Main gifts, line",
  "gifts.secondary": "More gifts, line",
  "gifts.name": "Name",
  "gifts.text": "What it is",
  "map.where": "Where we are on the map",
  "map.lines": "What is around us, line",
  "crew.capacity": "",
  "crew.min": "Smallest camp that can run",
  "crew.max": "Full camp",
  "crew.counting": "Before anyone answers",
  "schedule.datesNote": "Note above the schedule",
  "schedule.before": "Before the Burn, line",
  "schedule.onSite": "On site, line",
  "schedule.after": "After the Burn, line",
  "schedule.when": "When",
  "schedule.what": "What happens",
  "schedule.shiftsIntro": "Above the shifts",
  "schedule.shifts": "Shifts on site, line",
  "schedule.proactive": "Closing call",
  "fee.intro": "Intro",
  "fee.scaleIntro": "Above the scale",
  "fee.tiers": "Fee levels, line",
  "fee.name": "Name",
  "fee.rands": "Amount",
  "fee.note": "Note",
  "fee.subsidy": "Subsidy",
  "fee.tentFee": "Tent fee",
  "fee.spend": "Where the money goes, line",
  "fee.what": "What",
  "fee.spendNote": "Under the list",
  "fee.guidance": "How to choose your level",
  "fee.quote": "Quote",
  "fee.usdRate": "",
  "fee.randsPerDollar": "Rands per dollar",
  "fee.asOf": "Rate as of",
  "perks.summary": "The list, line",
  "perks.files": "File",
  "perks.file": "File name",
  "perks.paragraphs": "Words",
  "truck.entries": "The log, line",
  "apply.body": "Words",
  "apply.invite": "Invite line",
  "apply.button": "Button",
};

/** "Before the Burn, line 4, What happens" for ["before", 3, "what"]. */
export function placeOf(
  section: JoinSectionKey,
  path: readonly PropertyKey[],
): string {
  const parts: string[] = [];
  for (const step of path) {
    if (typeof step === "number") {
      const last = parts.pop() ?? "";
      parts.push(`${last} ${step + 1}`.trim());
      continue;
    }
    const label = FIELD[`${section}.${String(step)}`];
    if (label) parts.push(label);
  }
  return parts.join(", ");
}

function issueText(code: string, message: string): string {
  if (code === "invalid_type") return "Give a number.";
  if (code === "too_big") return "Shorten this.";
  if (code === "too_small" && /least 1/.test(message)) {
    return "Keep at least one.";
  }
  return message;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "level";

/** Last touches before a section is checked and sent. */
function prepare<K extends JoinSectionKey>(key: K, value: C[K]): unknown {
  if (key !== "fee") return value;
  const fee = value as C["fee"];
  return {
    ...fee,
    currency: "ZAR",
    tiers: fee.tiers.map((t) => {
      const tier = { ...t, key: slug(t.name) };
      if (!t.note?.trim()) delete tier.note;
      return tier;
    }),
  };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

type Problem = { section: JoinSectionKey; message: string };

export function JoinSiteEditor({ data }: { data: JoinEditorData }) {
  const router = useRouter();
  const initialLines = React.useMemo(
    () => Object.fromEntries(data.teams.map((t) => [t.key, t.description])),
    [data.teams],
  );
  const initialBurn: BurnDraft = data.burn ?? { start: "", end: "" };

  const [base, setBase] = React.useState({
    content: data.content,
    lines: initialLines,
    burn: initialBurn,
  });
  const [content, setContent] = React.useState<C>(data.content);
  const [lines, setLines] =
    React.useState<Record<string, string>>(initialLines);
  const [burn, setBurn] = React.useState<BurnDraft>(initialBurn);
  const [active, setActive] = React.useState<JoinSectionKey>("readme");
  // On a phone the list is one screen and the open section another.
  const [opened, setOpened] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [saved, setSaved] = React.useState(false);
  // Discarding remounts the text editors, which read their words once.
  const [version, setVersion] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const topRef = React.useRef<HTMLDivElement>(null);

  const changed = SECTIONS.filter(({ key }) => {
    if (!same(content[key], base.content[key])) return true;
    if (key === "teams") return !same(lines, base.lines);
    if (key === "schedule") return !same(burn, base.burn);
    return false;
  }).map((s) => s.key);
  const dirty = changed.length > 0;

  // A refused save shows its sentence at the top of the section: bring it
  // into view, wherever the captain had scrolled to.
  React.useEffect(() => {
    if (problem) scrollInWindow(topRef.current, { onlyUp: true });
  }, [problem]);

  // Leaving the page with unsaved words asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setSection<K extends JoinSectionKey>(key: K) {
    return (next: C[K]) => {
      setSaved(false);
      setContent((c) => ({ ...c, [key]: next }));
    };
  }

  function open(key: JoinSectionKey) {
    setActive(key);
    setOpened(true);
    scrollInWindow(topRef.current, { onlyUp: true });
  }

  function discard() {
    setContent(base.content);
    setLines(base.lines);
    setBurn(base.burn);
    setProblem(null);
    setSaved(false);
    setVersion((v) => v + 1);
  }

  function save() {
    setProblem(null);
    const sections: Partial<Record<JoinSectionKey, unknown>> = {};
    for (const key of changed) {
      if (same(content[key], base.content[key])) continue;
      const value = prepare(key, content[key]);
      const check = JoinSections[key].safeParse(value);
      if (!check.success) {
        const issue = check.error.issues[0]!;
        const place = placeOf(key, issue.path);
        setActive(key);
        setOpened(true);
        setProblem({
          section: key,
          message: `${place ? `${place}: ` : ""}${issueText(issue.code, issue.message)}`,
        });
        return;
      }
      sections[key] = check.data;
    }
    const input: JoinPageInput = { sections };
    if (!same(lines, base.lines)) {
      input.teamLines = Object.fromEntries(
        Object.entries(lines).filter(([k, v]) => v !== base.lines[k]),
      );
    }
    if (!same(burn, base.burn)) input.burn = burn;

    startTransition(async () => {
      const res = await saveJoinPageAction(input);
      if (!res.ok) {
        const section = res.section ?? active;
        setActive(section);
        setOpened(true);
        setProblem({ section, message: res.error });
        return;
      }
      setBase({ content, lines, burn });
      setSaved(true);
      router.refresh();
    });
  }

  const meta = SECTIONS.find((s) => s.key === active)!;
  const status = problem
    ? `Not saved. ${TITLE[problem.section]}: ${problem.message}`
    : dirty
      ? `${changed.length} ${changed.length === 1 ? "section" : "sections"} not saved: ${changed.map((k) => TITLE[k]).join(", ")}`
      : saved
        ? "Saved. About and join.camp-404.com show the new words."
        : "No changes";

  const body = (() => {
    switch (active) {
      case "readme":
        return (
          <ReadmeSection value={content.readme} set={setSection("readme")} />
        );
      case "teams":
        return (
          <TeamsSection
            value={content.teams}
            set={setSection("teams")}
            teams={data.teams}
            teamLines={lines}
            setTeamLine={(key, line) => {
              setSaved(false);
              setLines((l) => ({ ...l, [key]: line }));
            }}
          />
        );
      case "gifts":
        return <GiftsSection value={content.gifts} set={setSection("gifts")} />;
      case "map":
        return <MapSection value={content.map} set={setSection("map")} />;
      case "crew":
        return <CrewSection value={content.crew} set={setSection("crew")} />;
      case "schedule":
        return (
          <ScheduleSection
            value={content.schedule}
            set={setSection("schedule")}
            burn={burn}
            setBurn={(b) => {
              setSaved(false);
              setBurn(b);
            }}
            yearIsSet={data.yearIsSet}
            yearLabel={`${data.year}${data.yearName ? ` (${data.yearName})` : ""}`}
          />
        );
      case "fee":
        return <FeeSection value={content.fee} set={setSection("fee")} />;
      case "perks":
        return <PerksSection value={content.perks} set={setSection("perks")} />;
      case "truck":
        return <TruckSection value={content.truck} set={setSection("truck")} />;
      case "apply":
        return <ApplySection value={content.apply} set={setSection("apply")} />;
    }
  })();

  return (
    <div
      ref={topRef}
      data-join-open={opened ? "" : undefined}
      className="flex scroll-mt-6 flex-col"
    >
      <div className="grid items-start gap-6 page-md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav
          aria-label="Sections"
          className={cn(
            "flex-col page-md:sticky page-md:top-0 page-md:flex",
            opened ? "hidden" : "flex",
          )}
        >
          <p className="hidden px-3.5 pb-2 font-pixel text-[10px] uppercase tracking-[0.15em] text-muted-foreground page-md:block">
            Sections
          </p>
          {/* Desktop: a list down the left, the open one marked. */}
          <ul className="hidden flex-col gap-0.5 page-md:flex">
            {SECTIONS.map((s) => {
              const isOn = s.key === active;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-current={isOn ? "true" : undefined}
                    onClick={() => open(s.key)}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-l-2 border-transparent px-3 py-2 text-left hover:bg-card",
                      isOn && "border-l-accent bg-accent/20 hover:bg-accent/20",
                    )}
                  >
                    <span className="text-[13px] font-semibold leading-5">
                      {s.title}
                    </span>
                    <span
                      aria-label={
                        changed.includes(s.key) ? "Not saved" : undefined
                      }
                      className={cn(
                        "row-span-2 size-2 rounded-full bg-accent",
                        !changed.includes(s.key) && "invisible",
                      )}
                    />
                    <span className="font-mono text-[11px] leading-4 text-muted-foreground">
                      {s.file}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Phone: the list is its own screen. */}
          <Card className="overflow-hidden p-0 page-md:hidden">
            <ul className="flex flex-col">
              {SECTIONS.map((s) => (
                <li
                  key={s.key}
                  className="border-t border-border/70 first:border-t-0"
                >
                  <button
                    type="button"
                    onClick={() => open(s.key)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_1rem] items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-secondary text-accent">
                      <s.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {s.title}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {s.file}
                      </span>
                    </span>
                    <span
                      aria-label={
                        changed.includes(s.key) ? "Not saved" : undefined
                      }
                      className={cn(
                        "size-2 rounded-full bg-accent",
                        !changed.includes(s.key) && "invisible",
                      )}
                    />
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <section
          aria-labelledby="join-section-title"
          className={cn(
            "min-w-0 flex-col gap-4 page-md:flex",
            opened ? "flex" : "hidden",
          )}
        >
          <button
            type="button"
            onClick={() => setOpened(false)}
            className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-accent page-md:hidden"
          >
            <ChevronLeft className="size-4" aria-hidden />
            All sections
          </button>
          <div className="flex flex-col gap-1">
            <h2
              id="join-section-title"
              className="font-sans text-lg font-bold normal-case leading-6 tracking-normal"
            >
              {meta.title}
            </h2>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {meta.description}
            </p>
          </div>
          {problem && problem.section === active ? (
            <Alert variant="error">
              <TriangleAlert />
              <span>{problem.message}</span>
            </Alert>
          ) : null}
          <div key={`${active}-${version}`} className="flex flex-col gap-4">
            {body}
          </div>
        </section>
      </div>

      <div
        role="region"
        aria-label="Save"
        className="sticky bottom-0 z-20 -mx-4 mt-6 -mb-6 flex items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-card px-4 py-3 page-sm:-mx-6 page-sm:px-6"
      >
        <p
          role="status"
          className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-muted-foreground"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full bg-border",
              dirty && "bg-accent",
              problem && "bg-destructive",
              !dirty && saved && "bg-success",
            )}
          />
          <span
            className={cn(
              dirty && "text-foreground",
              problem && "text-destructive",
            )}
          >
            {status}
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          {/* Both buttons stay in place, so Save never moves. A phone has
              room for the status and Save only, as the mock-up draws it. */}
          <Button
            type="button"
            variant="ghost"
            className="hidden page-sm:inline-flex"
            onClick={discard}
            disabled={pending || !dirty}
          >
            Discard changes
          </Button>
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending ? "Saving…" : "Save page"}
          </Button>
        </div>
      </div>
    </div>
  );
}

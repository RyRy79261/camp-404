"use client";

import * as React from "react";
import Link from "next/link";
import { Settings2, type LucideIcon } from "lucide-react";
import type {
  GiftIcon,
  JoinFeeTier,
  JoinGift,
  JoinScheduleEntry,
  JoinSiteContent,
} from "@camp404/types";
import { GIFT_ICONS } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@camp404/ui/components/select";
import { Switch } from "@camp404/ui/components/switch";
import { MarkdownField } from "@/components/markdown/markdown-field";
import {
  paragraphsFromValue,
  paragraphsToValue,
} from "@/components/markdown/paragraph-text";
import { GIFT_ICON } from "@/lib/join-gift-icons";
import type { JoinEditorTeam } from "@/lib/join-site";
import {
  CellArea,
  CellInput,
  Field,
  FieldCard,
  GrowArea,
  RandInput,
  RowMenu,
  RowTable,
  type RowColumn,
} from "./editor-kit";

// Each section of the Join site editor, as the approved mock-up draws it
// (2026-10-01, Option A): the fields in the order members read them, long
// text as Write beside Preview, repeating rows as one table each.

type C = JoinSiteContent;
type SetSection<K extends keyof C> = (next: C[K]) => void;

/** The editor's long text: paragraphs with bold and italic, Write | Preview. */
function Words({
  label,
  paragraphs,
  onChange,
  small,
}: {
  label: string;
  paragraphs: readonly string[];
  onChange: (paragraphs: string[]) => void;
  small?: boolean;
}) {
  return (
    <Field label={label}>
      <MarkdownField
        label={label}
        mode="paragraphs"
        labelWrite
        value={paragraphsToValue(paragraphs)}
        onChange={(v) => onChange(paragraphsFromValue(v))}
        minHeight={small ? "min-h-16" : "min-h-32"}
        emptyPreview="Nothing written yet."
      />
    </Field>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  help,
  grow,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: React.ReactNode;
  grow?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={id} help={help}>
      {grow ? (
        <GrowArea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** A list of single lines (notes, perks, shifts): one column and a menu. */
function LinesTable({
  name,
  header,
  lines,
  onChange,
  addLabel,
  numbered,
}: {
  name: string;
  header: string;
  lines: string[];
  onChange: (lines: string[]) => void;
  addLabel: string;
  numbered?: boolean;
}) {
  const columns: RowColumn<string>[] = [
    ...(numbered
      ? [
          {
            key: "n",
            header: "Step",
            width: "w-[72px]",
            cell: (
              _row: string,
              _set: (v: string) => void,
              a11y: { index: number },
            ) => (
              <span className="block pt-2.5 font-semibold tabular-nums">
                {a11y.index + 1}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "text",
      header,
      cell: (row, set, a11y) => (
        <CellArea value={row} onChange={set} a11y={a11y} />
      ),
    },
  ];
  return (
    <RowTable<string>
      name={name}
      columns={columns}
      rowName={(_row, i) => `${numbered ? "Step" : "Line"} ${i + 1}`}
      phoneLine={(row) => ({ main: row })}
      groups={[
        {
          rows: lines,
          onChange,
          addLabel,
          blank: () => "",
          max: 20,
        },
      ]}
    />
  );
}

function TableCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <FieldCard
      title={title}
      description={description}
      action={action}
      className="gap-2 p-0 page-sm:p-0 [&>div:first-child]:px-4 [&>div:first-child]:pt-4 page-sm:[&>div:first-child]:px-5 page-sm:[&>div:first-child]:pt-5"
    >
      <div className="pb-1">{children}</div>
    </FieldCard>
  );
}

// ---- Who we are (README.TXT) ----------------------------------------------

export function ReadmeSection({
  value,
  set,
}: {
  value: C["readme"];
  set: SetSection<"readme">;
}) {
  return (
    <>
      <FieldCard>
        <TextField
          id="readme-heading"
          label="Heading"
          value={value.heading}
          onChange={(heading) => set({ ...value, heading })}
          help="The first line on About, in bold, and the window's title on the join site."
        />
        <Words
          label="Words"
          paragraphs={value.paragraphs}
          onChange={(paragraphs) => set({ ...value, paragraphs })}
        />
        <TextField
          id="readme-warning"
          label="Warning"
          grow
          value={value.warning}
          onChange={(warning) => set({ ...value, warning })}
          help="Shows in a pink box under the words."
        />
        <TextField
          id="readme-quote"
          label="Quote"
          grow
          value={value.quote}
          onChange={(quote) => set({ ...value, quote })}
          help="Shows in italics at the end of the card."
        />
      </FieldCard>
      <TableCard
        title="How to join, step by step"
        description="Shown in this order on join.camp-404.com."
      >
        <LinesTable
          name="How to join, step by step"
          header="What they do"
          numbered
          lines={value.steps}
          onChange={(steps) => set({ ...value, steps })}
          addLabel="Add a step"
        />
      </TableCard>
    </>
  );
}

// ---- How the camp works (TEAMS/) ------------------------------------------

export function TeamsSection({
  value,
  set,
  teams,
  teamLines,
  setTeamLine,
}: {
  value: C["teams"];
  set: SetSection<"teams">;
  teams: JoinEditorTeam[];
  teamLines: Record<string, string>;
  setTeamLine: (key: string, line: string) => void;
}) {
  return (
    <>
      <FieldCard>
        <TextField
          id="teams-intro"
          label="Above the teams"
          grow
          value={value.intro}
          onChange={(intro) => set({ ...value, intro })}
        />
      </FieldCard>
      <TableCard
        title="What each team does"
        description="Leave a line empty to use the default shown in grey."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/captains/camp-settings">
              <Settings2 aria-hidden />
              Rename or reorder teams
            </Link>
          </Button>
        }
      >
        <table
          aria-label="What each team does"
          className="hidden w-full table-fixed text-sm page-md:table"
        >
          <thead>
            <tr className="border-b border-border/70">
              <th
                scope="col"
                className="w-[232px] py-2 pl-5 pr-3 text-left text-xs font-semibold text-muted-foreground"
              >
                Team
              </th>
              <th
                scope="col"
                className="py-2 pl-3 pr-5 text-left text-xs font-semibold text-muted-foreground"
              >
                What they do
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.key}
                className="border-t border-border/70 first:border-t-0"
              >
                <th
                  scope="row"
                  className="py-2 pl-5 pr-3 text-left align-middle font-semibold"
                >
                  {t.label}
                </th>
                <td className="py-2 pl-3 pr-5">
                  <Input
                    aria-label={`What ${t.label} does`}
                    value={teamLines[t.key] ?? ""}
                    placeholder={t.defaultDescription}
                    onChange={(e) => setTeamLine(t.key, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="flex flex-col page-md:hidden">
          {teams.map((t) => (
            <li
              key={t.key}
              className="flex flex-col gap-2 border-t border-border/70 px-4 py-3 first:border-t-0"
            >
              <label
                htmlFor={`team-line-${t.key}`}
                className="text-sm font-semibold"
              >
                {t.label}
              </label>
              <Input
                id={`team-line-${t.key}`}
                value={teamLines[t.key] ?? ""}
                placeholder={t.defaultDescription}
                onChange={(e) => setTeamLine(t.key, e.target.value)}
              />
            </li>
          ))}
        </ul>
      </TableCard>
      <FieldCard>
        <Words
          label="Below the teams"
          small
          paragraphs={value.outro}
          onChange={(outro) => set({ ...value, outro })}
        />
      </FieldCard>
    </>
  );
}

// ---- What we give (GIFTS.EXE) ---------------------------------------------

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-accent">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

const giftColumns: RowColumn<JoinGift>[] = [
  {
    key: "icon",
    header: "Icon",
    width: "w-[200px]",
    cell: (row, set, a11y) => (
      <Select
        value={row.icon}
        onValueChange={(icon) => set({ ...row, icon: icon as GiftIcon })}
      >
        <SelectTrigger
          id={a11y.id}
          aria-label={a11y.label}
          // The kit clamps its value to one line as a -webkit-box, which
          // sets the chip and the name on a baseline; this row is centred.
          className="gap-1 pl-1 [&>span]:flex!"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconChip icon={GIFT_ICON[row.icon].icon} />
            <span className="truncate leading-5">
              {GIFT_ICON[row.icon].name}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {GIFT_ICONS.map((key) => (
            <SelectItem key={key} value={key}>
              <span className="flex items-center gap-2">
                <IconChip icon={GIFT_ICON[key].icon} />
                {GIFT_ICON[key].name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
  },
  {
    key: "name",
    header: "Name",
    width: "w-[208px]",
    cell: (row, set, a11y) => (
      <CellInput
        value={row.name}
        onChange={(name) => set({ ...row, name })}
        a11y={a11y}
      />
    ),
  },
  {
    key: "text",
    header: "What it is",
    cell: (row, set, a11y) => (
      <CellArea
        value={row.text}
        onChange={(text) => set({ ...row, text })}
        a11y={a11y}
      />
    ),
  },
];

function GiftTable({
  name,
  rows,
  onChange,
  addLabel,
}: {
  name: string;
  rows: JoinGift[];
  onChange: (rows: JoinGift[]) => void;
  addLabel: string;
}) {
  return (
    <RowTable<JoinGift>
      name={name}
      columns={giftColumns}
      rowName={(_row, i) => `Gift ${i + 1}`}
      phoneLine={(row) => ({
        lead: <IconChip icon={GIFT_ICON[row.icon].icon} />,
        main: row.name,
        sub: row.text,
      })}
      groups={[
        {
          rows,
          onChange,
          addLabel,
          blank: () => ({ icon: "art", name: "", text: "" }),
          max: 8,
        },
      ]}
    />
  );
}

export function GiftsSection({
  value,
  set,
}: {
  value: C["gifts"];
  set: SetSection<"gifts">;
}) {
  return (
    <>
      <FieldCard>
        <TextField
          id="gifts-intro"
          label="Intro"
          value={value.intro}
          onChange={(intro) => set({ ...value, intro })}
        />
      </FieldCard>
      <TableCard
        title="Main gifts"
        description="The top row on the join site, and first on About. Three fit best."
      >
        <GiftTable
          name="Main gifts"
          rows={value.primary}
          onChange={(primary) => set({ ...value, primary })}
          addLabel="Add a main gift"
        />
      </TableCard>
      <TableCard title="More gifts" description="The row under the main gifts.">
        <GiftTable
          name="More gifts"
          rows={value.secondary}
          onChange={(secondary) => set({ ...value, secondary })}
          addLabel="Add a gift"
        />
      </TableCard>
    </>
  );
}

// ---- Where we are (MAP.GPS) -----------------------------------------------

export function MapSection({
  value,
  set,
}: {
  value: C["map"];
  set: SetSection<"map">;
}) {
  return (
    <>
      <FieldCard>
        <TextField
          id="map-where"
          label="Where we are on the map"
          value={value.where}
          onChange={(where) => set({ ...value, where })}
          help="One short line, in bold at the top of the card."
        />
      </FieldCard>
      <TableCard
        title="What is around us"
        description="A list under the place. One short line each."
      >
        <LinesTable
          name="What is around us"
          header="Note"
          lines={value.lines}
          onChange={(lines) => set({ ...value, lines })}
          addLabel="Add a note"
        />
      </TableCard>
    </>
  );
}

// ---- The crew (CREW.DB) ---------------------------------------------------

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits === "" ? Number.NaN : Number(digits));
        }}
        className="tabular-nums"
      />
    </Field>
  );
}

export function CrewSection({
  value,
  set,
}: {
  value: C["crew"];
  set: SetSection<"crew">;
}) {
  return (
    <FieldCard
      title="Headcount"
      description="The join site counts members from their “Coming this year?” answers. Captains show there when they switch on “Show me on join.camp-404.com” on their profile."
    >
      <div className="grid gap-4 page-sm:grid-cols-[repeat(2,minmax(0,12rem))]">
        <NumberField
          id="crew-min"
          label="Smallest camp that can run"
          value={value.capacity.min}
          onChange={(min) =>
            set({ ...value, capacity: { ...value.capacity, min } })
          }
        />
        <NumberField
          id="crew-max"
          label="Full camp"
          value={value.capacity.max}
          onChange={(max) =>
            set({ ...value, capacity: { ...value.capacity, max } })
          }
        />
      </div>
      <TextField
        id="crew-counting"
        label="Before anyone answers"
        grow
        value={value.counting}
        onChange={(counting) => set({ ...value, counting })}
        help="Shown on the join site while nobody has said they are coming."
      />
    </FieldCard>
  );
}

// ---- What you put in (SCHEDULE.CAL) ---------------------------------------

const scheduleColumns: RowColumn<JoinScheduleEntry>[] = [
  {
    key: "when",
    header: "When",
    width: "w-[176px]",
    cell: (row, set, a11y) => (
      <CellArea
        value={row.when}
        onChange={(when) => set({ ...row, when })}
        a11y={a11y}
      />
    ),
  },
  {
    key: "what",
    header: "What happens",
    cell: (row, set, a11y) => (
      <CellArea
        value={row.what}
        onChange={(what) => set({ ...row, what })}
        a11y={a11y}
      />
    ),
  },
  {
    key: "allHands",
    header: "All hands",
    width: "w-[104px]",
    align: "center",
    cell: (row, set, a11y) => (
      <span className="inline-flex pt-2.5">
        <Switch
          id={a11y.id}
          aria-label={a11y.label}
          checked={Boolean(row.allHands)}
          onCheckedChange={(on) => {
            const next = { ...row };
            if (on) next.allHands = true;
            else delete next.allHands;
            set(next);
          }}
        />
      </span>
    ),
  },
];

export type BurnDraft = { start: string; end: string };

export function ScheduleSection({
  value,
  set,
  burn,
  setBurn,
  yearIsSet,
  yearLabel,
}: {
  value: C["schedule"];
  set: SetSection<"schedule">;
  burn: BurnDraft;
  setBurn: (b: BurnDraft) => void;
  yearIsSet: boolean;
  yearLabel: string;
}) {
  const group = (
    key: "before" | "onSite" | "after",
    label: string,
    addLabel: string,
  ) => ({
    label,
    rows: value[key],
    onChange: (rows: JoinScheduleEntry[]) => set({ ...value, [key]: rows }),
    addLabel,
    blank: () => ({ when: "", what: "" }),
    max: 20,
  });
  return (
    <>
      <FieldCard>
        <TextField
          id="schedule-dates-note"
          label="Note above the schedule"
          grow
          value={value.datesNote}
          onChange={(datesNote) => set({ ...value, datesNote })}
          help="Shown until the Burn's dates are set; then About shows the dates."
        />
      </FieldCard>
      <TableCard
        title="Schedule"
        description="“All hands” marks the days everyone must be there."
      >
        <RowTable<JoinScheduleEntry>
          name="Schedule"
          columns={scheduleColumns}
          rowName={(_row, i) => `Line ${i + 1}`}
          phoneLine={(row) => ({
            main: row.what,
            sub: [row.when, row.allHands ? "All hands" : ""]
              .filter(Boolean)
              .join(" · "),
          })}
          groups={[
            group("before", "Before the Burn", "Add a line before the Burn"),
            group("onSite", "On site", "Add a line on site"),
            group("after", "After the Burn", "Add a line after the Burn"),
          ]}
        />
      </TableCard>
      <TableCard
        title="Shifts on site"
        description="The shifts everyone does during the Burn."
      >
        <LinesTable
          name="Shifts on site"
          header="Shift"
          lines={value.shifts}
          onChange={(shifts) => set({ ...value, shifts })}
          addLabel="Add a shift"
        />
      </TableCard>
      <FieldCard>
        <TextField
          id="schedule-shifts-intro"
          label="Above the shifts"
          value={value.shiftsIntro}
          onChange={(shiftsIntro) => set({ ...value, shiftsIntro })}
        />
        <TextField
          id="schedule-proactive"
          label="Closing call"
          grow
          value={value.proactive}
          onChange={(proactive) => set({ ...value, proactive })}
          help="Shows in a pink box under the shifts."
        />
      </FieldCard>
      <FieldCard
        title={
          yearIsSet ? `The Burn's dates, ${yearLabel}` : "The Burn's dates"
        }
        description={
          yearIsSet
            ? "The join site counts down to the first day, and About shows the dates."
            : "The camp's year has no name yet, so the Burn's dates cannot be set."
        }
      >
        {yearIsSet ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-44">
              <Field label="First day" htmlFor="burn-start">
                <Input
                  id="burn-start"
                  type="date"
                  value={burn.start}
                  onChange={(e) => setBurn({ ...burn, start: e.target.value })}
                />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Last day" htmlFor="burn-end">
                <Input
                  id="burn-end"
                  type="date"
                  value={burn.end}
                  onChange={(e) => setBurn({ ...burn, end: e.target.value })}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={!burn.start && !burn.end}
              onClick={() => setBurn({ start: "", end: "" })}
            >
              Clear dates
            </Button>
          </div>
        ) : (
          <div>
            <Button asChild variant="outline" size="sm">
              <Link href="/captains/camp-settings/cycle">
                Name this year in Camp settings
              </Link>
            </Button>
          </div>
        )}
      </FieldCard>
    </>
  );
}

// ---- The camp fee (FEE.CALC) ----------------------------------------------

export function FeeSection({
  value,
  set,
}: {
  value: C["fee"];
  set: SetSection<"fee">;
}) {
  const tierColumns: RowColumn<JoinFeeTier>[] = [
    {
      key: "name",
      header: "Name",
      width: "w-[184px]",
      cell: (row, s, a11y) => (
        <CellInput
          value={row.name}
          onChange={(name) => s({ ...row, name })}
          a11y={a11y}
        />
      ),
    },
    {
      key: "rands",
      header: "Amount",
      width: "w-[152px]",
      align: "right",
      cell: (row, s, a11y) => (
        <RandInput
          id={a11y.id}
          label={a11y.label}
          value={row.rands}
          onChange={(rands) => s({ ...row, rands: rands as number })}
        />
      ),
    },
    {
      key: "note",
      header: "Note",
      cell: (row, s, a11y) => (
        <CellArea
          value={row.note ?? ""}
          placeholder="Optional"
          onChange={(note) => {
            const next: JoinFeeTier = { ...row, note };
            if (!note) delete next.note;
            s(next);
          }}
          a11y={a11y}
        />
      ),
    },
  ];

  const fixedNote = (
    <div className="flex h-10 items-center justify-end whitespace-nowrap rounded-md border border-dashed border-border px-2 text-[13px] text-muted-foreground">
      What they can
    </div>
  );

  return (
    <>
      <FieldCard>
        <TextField
          id="fee-intro"
          label="Intro"
          grow
          value={value.intro}
          onChange={(intro) => set({ ...value, intro })}
          help="The first line of the fee card on About."
        />
        <TextField
          id="fee-scale-intro"
          label="Above the scale"
          value={value.scaleIntro}
          onChange={(scaleIntro) => set({ ...value, scaleIntro })}
          help="On join.camp-404.com, above the slider."
        />
      </FieldCard>
      <TableCard
        title="Fee levels"
        description="Lowest first, as the scale reads. Subsidy is always first and the tent fee always last."
      >
        <RowTable<JoinFeeTier>
          name="Fee levels"
          columns={tierColumns}
          rowName={(_row, i) => `Level ${i + 1}`}
          phoneLine={(row) => ({
            main: row.name,
            sub: `R ${String(row.rands ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${row.note ? ` · ${row.note}` : ""}`,
          })}
          groups={[
            {
              rows: value.tiers,
              onChange: (tiers) => set({ ...value, tiers }),
              addLabel: "Add a fee level",
              blank: () => ({ key: "", name: "", rands: 0 }),
              max: 8,
              fixedBefore: {
                lockTitle: "Always first",
                cells: [
                  <Input
                    key="name"
                    aria-label="Name, Subsidy"
                    value={value.subsidy.name}
                    onChange={(e) =>
                      set({
                        ...value,
                        subsidy: { ...value.subsidy, name: e.target.value },
                      })
                    }
                  />,
                  <React.Fragment key="amount">{fixedNote}</React.Fragment>,
                  <GrowArea
                    key="note"
                    aria-label="Note, Subsidy"
                    value={value.subsidy.note}
                    onChange={(e) =>
                      set({
                        ...value,
                        subsidy: { ...value.subsidy, note: e.target.value },
                      })
                    }
                  />,
                ],
                phone: (
                  <div className="flex flex-col gap-3">
                    <TextField
                      id="fee-subsidy-name"
                      label="First level (pays what they can)"
                      value={value.subsidy.name}
                      onChange={(name) =>
                        set({ ...value, subsidy: { ...value.subsidy, name } })
                      }
                    />
                    <TextField
                      id="fee-subsidy-note"
                      label="Its note"
                      grow
                      value={value.subsidy.note}
                      onChange={(note) =>
                        set({ ...value, subsidy: { ...value.subsidy, note } })
                      }
                    />
                  </div>
                ),
              },
            },
            {
              label: "On top of the fee",
              rows: [],
              onChange: () => undefined,
              addLabel: "",
              blank: () => ({ key: "", name: "", rands: 0 }),
              max: 0,
              fixedBefore: {
                lockTitle: "Always last",
                cells: [
                  <span key="name" className="block pt-2.5 font-semibold">
                    Tent fee
                  </span>,
                  <Input
                    key="amount"
                    aria-label="Tent fee"
                    value={value.tentFee}
                    placeholder="TBC"
                    onChange={(e) => set({ ...value, tentFee: e.target.value })}
                    className="text-right"
                  />,
                  <span
                    key="note"
                    className="block pt-2.5 text-[13px] text-muted-foreground"
                  >
                    Hidden on About until it has an amount.
                  </span>,
                ],
                phone: (
                  <TextField
                    id="fee-tent"
                    label="Tent fee"
                    value={value.tentFee}
                    onChange={(tentFee) => set({ ...value, tentFee })}
                    help="Hidden on About until it has an amount."
                  />
                ),
              },
            },
          ]}
        />
      </TableCard>
      <TableCard
        title="Where the money goes"
        description="Amounts show on join.camp-404.com only, not in the app."
      >
        <RowTable
          name="Where the money goes"
          columns={[
            {
              key: "what",
              header: "What",
              cell: (row, s, a11y) => (
                <CellInput
                  value={row.what}
                  onChange={(what) => s({ ...row, what })}
                  a11y={a11y}
                />
              ),
            },
            {
              key: "rands",
              header: "Amount",
              width: "w-[184px]",
              align: "right",
              cell: (row, s, a11y) => (
                <RandInput
                  id={a11y.id}
                  label={a11y.label}
                  value={row.rands}
                  onChange={(rands) => s({ ...row, rands: rands as number })}
                />
              ),
            },
          ]}
          rowName={(_row, i) => `Cost ${i + 1}`}
          phoneLine={(row) => ({ main: row.what })}
          groups={[
            {
              rows: value.spend,
              onChange: (spend) => set({ ...value, spend }),
              addLabel: "Add a cost",
              blank: () => ({ what: "", rands: 0 }),
              max: 12,
            },
          ]}
        />
      </TableCard>
      <FieldCard>
        <TextField
          id="fee-spend-note"
          label="Under the list"
          value={value.spendNote}
          onChange={(spendNote) => set({ ...value, spendNote })}
        />
        <TextField
          id="fee-guidance"
          label="How to choose your level"
          grow
          value={value.guidance}
          onChange={(guidance) => set({ ...value, guidance })}
        />
        <TextField
          id="fee-quote"
          label="Quote"
          grow
          value={value.quote}
          onChange={(quote) => set({ ...value, quote })}
          help="Shows in italics under the guidance."
        />
      </FieldCard>
      <FieldCard
        title="Dollar label"
        description="Only a label beside each rand amount on the join site. Nobody pays in dollars."
      >
        <div className="grid gap-4 page-sm:grid-cols-[10rem_15rem]">
          <Field label="Rands per dollar" htmlFor="fee-rate">
            <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <span
                aria-hidden
                className="pl-3 pr-2 text-sm text-muted-foreground"
              >
                R
              </span>
              <input
                id="fee-rate"
                inputMode="decimal"
                value={
                  Number.isFinite(value.usdRate.randsPerDollar)
                    ? String(value.usdRate.randsPerDollar).replace(".", ",")
                    : ""
                }
                onChange={(e) => {
                  const typed = e.target.value
                    .replace(",", ".")
                    .replace(/[^\d.]/g, "");
                  set({
                    ...value,
                    usdRate: {
                      ...value.usdRate,
                      randsPerDollar: typed === "" ? Number.NaN : Number(typed),
                    },
                  });
                }}
                className="h-full w-full min-w-0 bg-transparent pr-3 text-right text-sm tabular-nums outline-none"
              />
            </div>
          </Field>
          <TextField
            id="fee-rate-as-of"
            label="Rate as of"
            value={value.usdRate.asOf}
            onChange={(asOf) =>
              set({ ...value, usdRate: { ...value.usdRate, asOf } })
            }
          />
        </div>
      </FieldCard>
    </>
  );
}

// ---- What you get out (PERKS/) --------------------------------------------

type PerkFile = C["perks"]["files"][number];

export function PerksSection({
  value,
  set,
}: {
  value: C["perks"];
  set: SetSection<"perks">;
}) {
  const setFile = (i: number, next: PerkFile) =>
    set({ ...value, files: value.files.map((f, j) => (j === i ? next : f)) });
  const moveFile = (i: number, to: number) => {
    const files = [...value.files];
    const [f] = files.splice(i, 1);
    files.splice(to, 0, f!);
    set({ ...value, files });
  };
  return (
    <>
      <TableCard
        title="The list"
        description="What members get, as a list at the top of the card."
      >
        <LinesTable
          name="What members get"
          header="Perk"
          lines={value.summary}
          onChange={(summary) => set({ ...value, summary })}
          addLabel="Add a perk"
        />
      </TableCard>
      {value.files.map((f, i) => (
        <FieldCard
          key={i}
          title={f.name.trim() || `File ${i + 1}`}
          description="A file in the PERKS/ folder on the join site; About shows its title and words."
          action={
            <RowMenu
              name={f.name.trim() || `File ${i + 1}`}
              index={i}
              count={value.files.length}
              onMove={(to) => moveFile(i, to)}
              onDelete={() =>
                set({ ...value, files: value.files.filter((_, j) => j !== i) })
              }
            />
          }
        >
          <div className="grid gap-4 page-sm:grid-cols-[12rem_minmax(0,1fr)]">
            <TextField
              id={`perk-file-${i}`}
              label="File name"
              value={f.file}
              placeholder="LOUNGE.TXT"
              onChange={(file) =>
                setFile(i, { ...f, file: file.toUpperCase() })
              }
            />
            <TextField
              id={`perk-name-${i}`}
              label="Title"
              value={f.name}
              onChange={(name) => setFile(i, { ...f, name })}
            />
          </div>
          <Words
            label={`Words: ${f.name.trim() || `file ${i + 1}`}`}
            small
            paragraphs={f.paragraphs}
            onChange={(paragraphs) => setFile(i, { ...f, paragraphs })}
          />
        </FieldCard>
      ))}
      {value.files.length < 8 ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              set({
                ...value,
                files: [...value.files, { file: "", name: "", paragraphs: [] }],
              })
            }
          >
            Add a file
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ---- Getting there (TRUCK.LOG) --------------------------------------------

export function TruckSection({
  value,
  set,
}: {
  value: C["truck"];
  set: SetSection<"truck">;
}) {
  return (
    <TableCard
      title="The log"
      description="How the camp and its stuff get to the Burn."
    >
      <LinesTable
        name="The log"
        header="Entry"
        lines={value.entries}
        onChange={(entries) => set({ ...value, entries })}
        addLabel="Add a line"
      />
    </TableCard>
  );
}

// ---- How to join (APPLY.EXE) ----------------------------------------------

export function ApplySection({
  value,
  set,
}: {
  value: C["apply"];
  set: SetSection<"apply">;
}) {
  return (
    <FieldCard>
      <TextField
        id="apply-body"
        label="Words"
        grow
        value={value.body}
        onChange={(body) => set({ ...value, body })}
      />
      <TextField
        id="apply-invite"
        label="Invite line"
        value={value.invite}
        onChange={(invite) => set({ ...value, invite })}
        help="Set in capitals on the join site, like a checklist line."
      />
      <TextField
        id="apply-button"
        label="Button"
        value={value.button}
        onChange={(button) => set({ ...value, button })}
      />
    </FieldCard>
  );
}

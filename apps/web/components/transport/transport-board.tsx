"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { TrailerRow, TransportCar } from "@camp404/db/transport";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  addRiderAction,
  answerLiftRequestAction,
  removeTrailerAction,
  setTowAction,
} from "@/app/(console)/transport/actions";
import {
  AddTrailerButton,
  ChoiceList,
  QUIET,
  ROW_ACTION,
  ROW_ACTION_PHONE,
  TakeOutButton,
  TrailerDialog,
  useRowAction,
} from "@/components/transport/transport-controls";
import {
  THIS_YEAR_LABEL,
  carOwnerLabel,
  driverFormMissing,
  firstName,
  nameOf,
  seatChoices,
  seatsCell,
  shortCarLabel,
  towChoices,
  trailerCell,
  type CarFuel,
  type NeedsSeatRow,
  type ThisYear,
} from "@/lib/transport-view";
import { cansText, formatNumber } from "@/lib/power-copy";

// The Transport page's three lists, as the owner approved them (Option A,
// 2026-10-01): tables, one row per person, one button in one place. Every
// table ends in the same 128px action column, and a row's tools open in a
// shaded panel under the row (AfrikaBurn's renderExpanded): "Seat in…" for
// a person, "Change riders" for a car, "Choose car" for a trailer. Below a
// 48rem box the rows become cards with the action full width in the footer.
//
// A viewer who may not change something never gets its control (no greyed
// forms): the page passes `canEdit` from canEditTransport, and every write
// checks again on the server.

const TABLE =
  "w-full table-fixed border-collapse border border-[var(--color-choice-edge,var(--color-border))] bg-card text-sm leading-5";
const TH =
  "px-4 py-2 text-left text-xs leading-4 font-medium text-muted-foreground";
const TD = "px-2 py-3 first:pl-4 last:pr-4";
const ROW = "border-t border-foreground/10";
const PANEL =
  "border-t border-[var(--color-choice-edge,var(--color-border))] bg-[color-mix(in_oklab,var(--color-card)_70%,black)] p-4";
const CARD =
  "border border-[var(--color-choice-edge,var(--color-border))] bg-card px-4 py-3";
const PAIRS =
  "mt-2 grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-[13px] leading-5";
const FOOT =
  "mt-3 border-t border-[var(--color-choice-edge,var(--color-border))] pt-3";
/** The container the tables switch on: a table at 48rem, cards below. */
const WIDE = "hidden @min-[48rem]/transport:table";
const NARROW = "@min-[48rem]/transport:hidden";

function Chip({
  tone,
  children,
}: {
  tone: "acc" | "com" | "may" | "warn";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap",
        tone === "acc" &&
          "border-[oklch(0.82_0.13_160/0.5)] text-[oklch(0.82_0.13_160)]",
        tone === "com" &&
          "border-[oklch(0.8_0.1_255/0.5)] text-[oklch(0.8_0.1_255)]",
        tone === "may" &&
          "border-[var(--color-choice-edge,var(--color-border))] text-muted-foreground",
        tone === "warn" &&
          "border-[oklch(0.85_0.13_85/0.5)] text-[oklch(0.85_0.13_85)]",
      )}
    >
      {children}
    </span>
  );
}

function YearChip({ thisYear }: { thisYear: ThisYear }) {
  if (!thisYear) return <span className="text-muted-foreground">—</span>;
  return (
    <Chip
      tone={
        thisYear === "accepted" ? "acc" : thisYear === "applied" ? "com" : "may"
      }
    >
      {THIS_YEAR_LABEL[thisYear]}
    </Chip>
  );
}

/** A section's title with its count, one plain line, and one action. */
export function SectionHead({
  id,
  title,
  count,
  unit,
  description,
  action,
}: {
  id: string;
  title: string;
  /** The number, then a word shown only on the wide layout ("4 people"). */
  count: number;
  unit?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
      <div className="min-w-0">
        <h2
          id={id}
          className="m-0 font-pixel text-xs leading-4 uppercase tracking-[0.2em]"
        >
          {title}
          <span className="ml-2 font-sans text-[13px] font-medium tracking-normal normal-case text-muted-foreground">
            {count}
            {unit && (
              <span className="hidden @min-[48rem]/transport:inline">
                {" "}
                {unit}
              </span>
            )}
          </span>
        </h2>
        {description && (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function useOpen() {
  const [open, setOpen] = React.useState<string | null>(null);
  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));
  return { open, toggle, close: () => setOpen(null) };
}

// --- Needs a seat -------------------------------------------------------------

function DeclineButton({
  row,
  requestedAt,
}: {
  row: NeedsSeatRow;
  requestedAt: string;
}) {
  const [pending, run] = useRowAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(QUIET, "-my-1 shrink-0")}
      disabled={pending}
      aria-label={`Decline ${row.name}'s request`}
      onClick={() =>
        run(
          () =>
            answerLiftRequestAction({
              memberUserId: row.userId,
              accept: false,
              requestedAt,
            }),
          "Request declined",
        )
      }
    >
      {pending ? <Spinner size="sm" label="Declining…" /> : null}
      Decline
    </Button>
  );
}

function AskedText({ row }: { row: NeedsSeatRow }) {
  if (row.asked.kind === "none") {
    return <span className="text-muted-foreground">Hasn&apos;t asked</span>;
  }
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="min-w-0">
        {row.asked.kind === "car" ? row.asked.label : "Any car"}
      </span>
      <DeclineButton row={row} requestedAt={row.asked.requestedAt} />
    </span>
  );
}

/** "Seat Jess Naidoo in…": the cars with a free seat, the asked one first. */
function SeatPanel({
  row,
  cars,
  onClose,
  phone,
}: {
  row: NeedsSeatRow;
  cars: TransportCar[];
  onClose: () => void;
  phone?: boolean;
}) {
  const router = useRouter();
  const asked = row.asked.kind === "car" ? row.asked.driverUserId : null;
  const { choices, note } = seatChoices(cars, asked);
  const [car, setCar] = React.useState<string | null>(
    choices[0]?.driverUserId ?? null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const picked = choices.find((c) => c.driverUserId === car) ?? null;
  const first = firstName(row.name);

  function seat() {
    if (!picked) {
      setError("Choose a car.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await addRiderAction({
        driverUserId: picked.driverUserId,
        memberUserId: row.userId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${row.name} is in ${picked.short}`);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 font-sans text-sm font-semibold tracking-normal normal-case">
        Seat {row.name} in…
      </h3>
      {choices.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          No car has a free seat that its driver has counted.
        </p>
      ) : (
        <ChoiceList
          label={`Car for ${row.name}`}
          value={car}
          onChange={setCar}
          choices={choices.map((c) => ({
            value: c.driverUserId,
            label: c.label,
            description:
              [
                c.from ? `From ${c.from}` : null,
                c.asked ? `${first} asked for this car` : null,
              ]
                .filter(Boolean)
                .join(" · ") || null,
            right: `${c.free} ${c.free === 1 ? "seat" : "seats"} free`,
          }))}
        />
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        className={cn(
          "flex gap-4",
          phone ? "flex-col" : "items-center justify-between",
        )}
      >
        <span className="text-xs text-muted-foreground">{note}</span>
        <span
          className={cn("flex shrink-0 gap-2", phone && "flex-col-reverse")}
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn(QUIET, phone && "h-10")}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={phone ? "h-10" : "h-8"}
            disabled={pending || !picked}
            onClick={seat}
          >
            {pending ? <Spinner size="sm" label="Seating…" /> : null}
            {picked ? `Seat ${first} in ${picked.short}` : "Seat"}
          </Button>
        </span>
      </div>
    </div>
  );
}

function SeatInButton({
  row,
  open,
  onToggle,
  panelId,
  phone,
}: {
  row: NeedsSeatRow;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  phone?: boolean;
}) {
  return (
    <Button
      size="sm"
      className={phone ? ROW_ACTION_PHONE : ROW_ACTION}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      Seat in…<span className="sr-only"> ({row.name})</span>
    </Button>
  );
}

export function NeedsSeatSection({
  rows,
  cars,
}: {
  rows: NeedsSeatRow[];
  cars: TransportCar[];
}) {
  const { open, toggle, close } = useOpen();

  return (
    <section aria-labelledby="needs-seat" className="mt-8">
      <SectionHead
        id="needs-seat"
        title="Needs a seat"
        count={rows.length}
        unit={rows.length === 1 ? "person" : "people"}
        description={
          <>
            <span className="hidden @min-[48rem]/transport:inline">
              Accepted or coming this year, not driving, and in no car yet.{" "}
            </span>
            Accepted first.
          </>
        }
      />
      {rows.length === 0 ? (
        <p className="border border-dashed border-[var(--color-choice-edge,var(--color-border))] p-4 text-sm text-muted-foreground">
          Everyone coming has a seat, or nobody has said they&apos;re coming
          yet.
        </p>
      ) : (
        <>
          <table className={cn(TABLE, WIDE)}>
            <caption className="sr-only">Needs a seat</caption>
            <colgroup>
              <col />
              <col style={{ width: 184 }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Who</th>
                <th className={TH}>This year</th>
                <th className={TH}>Asked for</th>
                <th className={cn(TH, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const panelId = `seat-${row.userId}`;
                const isOpen = open === row.userId;
                return (
                  <React.Fragment key={row.userId}>
                    <tr aria-label={row.name} className={cn(ROW, "h-14")}>
                      <td className={cn(TD, "font-semibold")}>{row.name}</td>
                      <td className={TD}>
                        <YearChip thisYear={row.thisYear} />
                      </td>
                      <td className={TD}>
                        <AskedText row={row} />
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <SeatInButton
                          row={row}
                          open={isOpen}
                          onToggle={() => toggle(row.userId)}
                          panelId={panelId}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={panelId}>
                        <td colSpan={4} className={PANEL}>
                          <SeatPanel row={row} cars={cars} onClose={close} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <ul
            aria-label="Needs a seat"
            className={cn(NARROW, "flex flex-col gap-2")}
          >
            {rows.map((row) => {
              const panelId = `seat-phone-${row.userId}`;
              const isOpen = open === row.userId;
              return (
                <li key={row.userId} aria-label={row.name} className={CARD}>
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">
                      {row.name}
                    </span>
                    <YearChip thisYear={row.thisYear} />
                  </div>
                  <dl className={PAIRS}>
                    <dt className="text-muted-foreground">Asked for</dt>
                    <dd className="m-0">
                      <AskedText row={row} />
                    </dd>
                  </dl>
                  <div className={FOOT}>
                    <SeatInButton
                      row={row}
                      open={isOpen}
                      onToggle={() => toggle(row.userId)}
                      panelId={panelId}
                      phone
                    />
                  </div>
                  {isOpen && (
                    <div id={panelId} className={cn(PANEL, "-mx-4 mt-3 -mb-3")}>
                      <SeatPanel row={row} cars={cars} onClose={close} phone />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// --- Cars ---------------------------------------------------------------------

function SeatsText({ car, end }: { car: TransportCar; end?: boolean }) {
  const s = seatsCell(car);
  return (
    <span className={cn("flex flex-col tabular-nums", end && "items-end")}>
      <span className={cn(s.muted && "text-muted-foreground")}>{s.text}</span>
      {s.sub && <span className="text-xs text-muted-foreground">{s.sub}</span>}
      {s.ratio !== null && !end && (
        <span aria-hidden className="mt-2 block h-1 w-[72px] bg-foreground/10">
          <span
            className="block h-full bg-primary"
            style={{ width: `${Math.round(s.ratio * 100)}%` }}
          />
        </span>
      )}
    </span>
  );
}

function Riders({ car, me }: { car: TransportCar; me: string }) {
  if (car.riders.length === 0) {
    return <span className="text-muted-foreground">Nobody yet</span>;
  }
  return (
    <span className="flex flex-col">
      {car.riders.map((r) => (
        <span key={r.userId}>
          {nameOf(r.name)}
          {r.userId === me && (
            <span className="ml-2 text-xs font-semibold text-primary">You</span>
          )}
        </span>
      ))}
    </span>
  );
}

function RidersPanel({ car, phone }: { car: TransportCar; phone?: boolean }) {
  return (
    <div className="flex flex-col">
      <h3 className="m-0 mb-1 font-sans text-sm font-semibold tracking-normal normal-case">
        Riders in {shortCarLabel(car)}
      </h3>
      {car.riders.length === 0 ? (
        <p className="m-0 py-2 text-[13px] text-muted-foreground">
          Nobody rides in this car yet. Seat people from Needs a seat.
        </p>
      ) : (
        <ul aria-label={`Riders in ${shortCarLabel(car)}`}>
          {car.riders.map((r) => (
            <li
              key={r.userId}
              className="flex min-h-14 items-center gap-2 border-t border-foreground/10 py-2 first:border-t-0"
            >
              <span className="min-w-0 flex-1">{nameOf(r.name)}</span>
              <TakeOutButton
                driverUserId={car.driverUserId}
                memberUserId={r.userId}
                name={nameOf(r.name)}
                short={phone}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeRidersButton({
  car,
  open,
  onToggle,
  panelId,
  phone,
}: {
  car: TransportCar;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  phone?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={phone ? ROW_ACTION_PHONE : ROW_ACTION}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      Change riders
      <span className="sr-only"> ({carOwnerLabel(car)})</span>
    </Button>
  );
}

/** A car's fuel cans (#255): "3 cans, 70 L" and who fills them, or None. */
function FuelCell({
  car,
  fuel,
  inline,
}: {
  car: TransportCar;
  fuel: CarFuel | undefined;
  inline?: boolean;
}) {
  if (!fuel || fuel.cans === 0) {
    return <span className="text-muted-foreground">None</span>;
  }
  const amount = `${cansText(fuel.cans)}, ${formatNumber(fuel.litres, 1)} L`;
  const who = `${firstName(car.driverName)} fills ${fuel.cans === 1 ? "it" : "them"}`;
  return inline ? (
    <span>
      <b className="font-semibold">{amount}</b>, {who}
    </span>
  ) : (
    <span className="flex flex-col">
      <b className="font-semibold">{amount}</b>
      <span className="text-xs text-muted-foreground">{who}</span>
    </span>
  );
}

export function CarsSection({
  cars,
  me,
  canEdit,
  fuel = {},
}: {
  cars: TransportCar[];
  me: string;
  canEdit: boolean;
  /** The fuel cans each car brings, by driver; read-only here. */
  fuel?: Record<string, CarFuel>;
}) {
  const { open, toggle } = useOpen();
  // A driver who hasn't filled in the form goes last (stable, so the rest
  // keep the server's order by name).
  const listed = [...cars].sort(
    (a, b) => Number(driverFormMissing(a)) - Number(driverFormMissing(b)),
  );
  return (
    <section aria-labelledby="cars" className="mt-8">
      <SectionHead
        id="cars"
        title="Cars"
        count={cars.length}
        unit={cars.length === 1 ? "driver" : "drivers"}
        description={
          <span className="hidden @min-[48rem]/transport:inline">
            Who drives, who rides with them, and the fuel cans each car brings.
          </span>
        }
      />
      {cars.length === 0 ? (
        <p className="border border-dashed border-[var(--color-choice-edge,var(--color-border))] p-4 text-sm text-muted-foreground">
          No cars yet. A car shows here once its driver says on the driver form
          that they&apos;re driving this year.
        </p>
      ) : (
        <>
          <table className={cn(TABLE, WIDE)}>
            <caption className="sr-only">Cars</caption>
            <colgroup>
              <col />
              <col style={{ width: 112 }} />
              <col />
              <col style={{ width: 136 }} />
              <col style={{ width: 144 }} />
              {canEdit && <col style={{ width: 160 }} />}
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Driver and car</th>
                <th className={TH}>Seats</th>
                <th className={TH}>Riders</th>
                <th className={TH}>Trailer</th>
                <th className={TH}>Fuel cans</th>
                {canEdit && <th className={cn(TH, "text-right")}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {listed.map((car) => {
                const panelId = `riders-${car.driverUserId}`;
                const isOpen = canEdit && open === car.driverUserId;
                const t = trailerCell(car);
                return (
                  <React.Fragment key={car.driverUserId}>
                    <tr
                      aria-label={nameOf(car.driverName)}
                      className={cn(ROW, "align-top")}
                    >
                      <td className={cn(TD, "py-4")}>
                        <span className="block font-semibold">
                          {nameOf(car.driverName)}
                          {car.driverUserId === me && (
                            <span className="ml-2 text-xs font-semibold text-primary">
                              You
                            </span>
                          )}
                        </span>
                        {driverFormMissing(car) ? (
                          <span className="block text-xs text-muted-foreground">
                            Hasn&apos;t filled in the driver form
                          </span>
                        ) : (
                          <>
                            {car.vehicle && (
                              <span className="block text-xs text-muted-foreground">
                                {car.vehicle}
                              </span>
                            )}
                            {car.departureCity && (
                              <span className="block text-xs text-muted-foreground">
                                From {car.departureCity}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={cn(TD, "py-4")}>
                        <SeatsText car={car} />
                      </td>
                      <td className={cn(TD, "py-4")}>
                        <Riders car={car} me={me} />
                      </td>
                      <td
                        className={cn(
                          TD,
                          "py-4",
                          t.muted && "text-muted-foreground",
                        )}
                      >
                        {t.text}
                      </td>
                      <td className={cn(TD, "py-4")}>
                        <FuelCell car={car} fuel={fuel[car.driverUserId]} />
                      </td>
                      {canEdit && (
                        <td className={cn(TD, "py-2.5 text-right")}>
                          <ChangeRidersButton
                            car={car}
                            open={isOpen}
                            onToggle={() => toggle(car.driverUserId)}
                            panelId={panelId}
                          />
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr id={panelId}>
                        <td colSpan={6} className={PANEL}>
                          <RidersPanel car={car} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <ul aria-label="Cars" className={cn(NARROW, "flex flex-col gap-2")}>
            {listed.map((car) => {
              const panelId = `riders-phone-${car.driverUserId}`;
              const isOpen = canEdit && open === car.driverUserId;
              const t = trailerCell(car);
              const missing = driverFormMissing(car);
              return (
                <li
                  key={car.driverUserId}
                  aria-label={nameOf(car.driverName)}
                  className={CARD}
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">
                      {nameOf(car.driverName)}
                      {car.driverUserId === me && (
                        <span className="ml-2 text-xs font-semibold text-primary">
                          You
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {car.seatsOffered === null
                        ? "Seats not said"
                        : seatsCell(car).text}
                    </span>
                  </div>
                  <dl className={PAIRS}>
                    <dt className="text-muted-foreground">Car</dt>
                    <dd
                      className={cn(
                        "m-0",
                        (missing || !car.vehicle) && "text-muted-foreground",
                      )}
                    >
                      {missing
                        ? "Hasn't filled in the driver form"
                        : (car.vehicle ?? "Not said")}
                    </dd>
                    {car.departureCity && (
                      <>
                        <dt className="text-muted-foreground">From</dt>
                        <dd className="m-0">{car.departureCity}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Riders</dt>
                    <dd className="m-0">
                      <Riders car={car} me={me} />
                    </dd>
                    {!missing && (
                      <>
                        <dt className="text-muted-foreground">Trailer</dt>
                        <dd
                          className={cn(
                            "m-0",
                            t.muted && "text-muted-foreground",
                          )}
                        >
                          {t.text}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Fuel cans</dt>
                    <dd className="m-0">
                      <FuelCell
                        car={car}
                        fuel={fuel[car.driverUserId]}
                        inline
                      />
                    </dd>
                  </dl>
                  {canEdit && (
                    <div className={FOOT}>
                      <ChangeRidersButton
                        car={car}
                        open={isOpen}
                        onToggle={() => toggle(car.driverUserId)}
                        panelId={panelId}
                        phone
                      />
                    </div>
                  )}
                  {isOpen && (
                    <div id={panelId} className={cn(PANEL, "-mx-4 mt-3 -mb-3")}>
                      <RidersPanel car={car} phone />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// --- Trailers -----------------------------------------------------------------

const NO_CAR = "none";

function TowPanel({
  trailer,
  cars,
  onClose,
  phone,
}: {
  trailer: TrailerRow;
  cars: TransportCar[];
  onClose: () => void;
  phone?: boolean;
}) {
  const router = useRouter();
  const options = towChoices(cars, trailer);
  const [car, setCar] = React.useState<string>(
    trailer.towedByUserId ?? options[0]?.driverUserId ?? NO_CAR,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, startRemove] = React.useTransition();
  const picked = options.find((o) => o.driverUserId === car) ?? null;
  const unchanged = (trailer.towedByUserId ?? NO_CAR) === car;

  function save() {
    setError(null);
    start(async () => {
      const result = await setTowAction({
        trailerId: trailer.id,
        expectedVersion: trailer.version,
        driverUserId: car === NO_CAR ? null : car,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(car === NO_CAR ? "Trailer has no car" : "Tow saved");
      onClose();
      router.refresh();
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await removeTrailerAction({
        trailerId: trailer.id,
        expectedVersion: trailer.version,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Trailer removed");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 font-sans text-sm font-semibold tracking-normal normal-case">
        Which car tows {trailer.name}?
      </h3>
      <ChoiceList
        label={`Car towing ${trailer.name}`}
        value={car}
        onChange={setCar}
        choices={[
          ...options.map((o) => ({
            value: o.driverUserId,
            label: o.label,
            description: o.from ? `From ${o.from}` : null,
          })),
          { value: NO_CAR, label: "No car yet" },
        ]}
      />
      {options.length === 0 && (
        <p className="m-0 text-xs text-muted-foreground">
          No free car can tow. A driver says they can tow on the driver form.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        className={cn(
          "flex gap-4",
          phone ? "flex-col" : "items-center justify-between",
        )}
      >
        <span className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={QUIET}
            onClick={() => setEditOpen(true)}
          >
            Edit trailer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={QUIET}
            disabled={removing}
            onClick={() => setConfirming(true)}
          >
            {removing ? <Spinner size="sm" label="Removing…" /> : null}
            Remove trailer
          </Button>
        </span>
        <span
          className={cn("flex shrink-0 gap-2", phone && "flex-col-reverse")}
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn(QUIET, phone && "h-10")}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={phone ? "h-10" : "h-8"}
            disabled={pending || unchanged}
            onClick={save}
          >
            {pending ? <Spinner size="sm" label="Saving…" /> : null}
            {picked ? `Hook to ${picked.short}` : "Take it off its car"}
          </Button>
        </span>
      </div>
      <TrailerDialog
        key={`${trailer.id}:${trailer.version}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={trailer}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${trailer.name}?`}
        description="It comes off this year's list, and off the car that tows it."
        confirmLabel="Remove trailer"
        destructive
        pending={removing}
        onConfirm={remove}
      />
    </div>
  );
}

function TowedBy({
  trailer,
  cars,
}: {
  trailer: TrailerRow;
  cars: TransportCar[];
}) {
  const car = cars.find((c) => c.driverUserId === trailer.towedByUserId);
  if (!car) return <Chip tone="warn">No car yet</Chip>;
  return (
    <span className="flex flex-col">
      <span>{nameOf(car.driverName)}</span>
      {car.vehicle && (
        <span className="text-xs text-muted-foreground">{car.vehicle}</span>
      )}
    </span>
  );
}

function ChooseCarButton({
  trailer,
  open,
  onToggle,
  panelId,
  phone,
}: {
  trailer: TrailerRow;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  phone?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={phone ? ROW_ACTION_PHONE : ROW_ACTION}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      Choose car<span className="sr-only"> ({trailer.name})</span>
    </Button>
  );
}

export function TrailersSection({
  trailers,
  cars,
  canEdit,
}: {
  trailers: TrailerRow[];
  cars: TransportCar[];
  canEdit: boolean;
}) {
  const { open, toggle, close } = useOpen();
  return (
    <section aria-labelledby="trailers" className="mt-8">
      <SectionHead
        id="trailers"
        title="Trailers"
        count={trailers.length}
        description={
          canEdit ? (
            <span className="hidden @min-[48rem]/transport:inline">
              Hook each trailer to a car that can tow.
            </span>
          ) : (
            "Transport & Logistics leads and captains keep this list."
          )
        }
        action={canEdit ? <AddTrailerButton /> : undefined}
      />
      {trailers.length === 0 ? (
        <p className="border border-dashed border-[var(--color-choice-edge,var(--color-border))] p-4 text-sm text-muted-foreground">
          No trailers yet.
          {canEdit
            ? " Add the trailers the camp has this year, then choose the car that tows each one."
            : ""}
        </p>
      ) : (
        <>
          <table className={cn(TABLE, WIDE)}>
            <caption className="sr-only">Trailers</caption>
            <colgroup>
              <col />
              <col />
              <col />
              {canEdit && <col style={{ width: 160 }} />}
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Trailer</th>
                <th className={TH}>Carries</th>
                <th className={TH}>Towed by</th>
                {canEdit && <th className={cn(TH, "text-right")}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {trailers.map((t) => {
                const panelId = `tow-${t.id}`;
                const isOpen = canEdit && open === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr aria-label={t.name} className={cn(ROW, "align-top")}>
                      <td className={cn(TD, "py-4 font-semibold")}>{t.name}</td>
                      <td className={cn(TD, "py-4 text-muted-foreground")}>
                        {t.notes ?? "—"}
                      </td>
                      <td className={cn(TD, "py-4")}>
                        <TowedBy trailer={t} cars={cars} />
                      </td>
                      {canEdit && (
                        <td className={cn(TD, "py-2.5 text-right")}>
                          <ChooseCarButton
                            trailer={t}
                            open={isOpen}
                            onToggle={() => toggle(t.id)}
                            panelId={panelId}
                          />
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr id={panelId}>
                        <td colSpan={4} className={PANEL}>
                          <TowPanel trailer={t} cars={cars} onClose={close} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <ul
            aria-label="Trailers"
            className={cn(NARROW, "flex flex-col gap-2")}
          >
            {trailers.map((t) => {
              const panelId = `tow-phone-${t.id}`;
              const isOpen = canEdit && open === t.id;
              const towed = cars.find(
                (c) => c.driverUserId === t.towedByUserId,
              );
              return (
                <li key={t.id} aria-label={t.name} className={CARD}>
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">{t.name}</span>
                    {!towed && <Chip tone="warn">No car yet</Chip>}
                  </div>
                  <dl className={PAIRS}>
                    <dt className="text-muted-foreground">Carries</dt>
                    <dd
                      className={cn("m-0", !t.notes && "text-muted-foreground")}
                    >
                      {t.notes ?? "—"}
                    </dd>
                    {towed && (
                      <>
                        <dt className="text-muted-foreground">Towed by</dt>
                        <dd className="m-0">
                          <TowedBy trailer={t} cars={cars} />
                        </dd>
                      </>
                    )}
                  </dl>
                  {canEdit && (
                    <div className={FOOT}>
                      <ChooseCarButton
                        trailer={t}
                        open={isOpen}
                        onToggle={() => toggle(t.id)}
                        panelId={panelId}
                        phone
                      />
                    </div>
                  )}
                  {isOpen && (
                    <div id={panelId} className={cn(PANEL, "-mx-4 mt-3 -mb-3")}>
                      <TowPanel trailer={t} cars={cars} onClose={close} phone />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

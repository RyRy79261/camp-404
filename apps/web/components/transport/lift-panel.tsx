import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@camp404/ui/lib/utils";
import {
  AnswerRequest,
  AskForLift,
  CarMessageButton,
  ChangeSeatsButton,
  LeaveCarButton,
  TakeOutButton,
  WithdrawRequestButton,
} from "@/components/transport/transport-controls";
import { seatsCell, type LiftPanel as Panel } from "@/lib/transport-view";

// The viewer's own lift, the same on Transport and on My lift (owner's
// Option A, 2026-10-01: "a labelled list, the same fields as Your lift").
// Four states: the car they ride in, the car they drive (with the people
// asking to ride and the riders, each with one action), their open request,
// or none (an empty state that asks for a lift). Plain text, so a saved or
// printed copy still says who drives and when on the road, with no signal.

export const LIFT_DRIVER_FORM_HREF = "/tools/forms";

const LABEL =
  "font-pixel text-[11px] leading-4 uppercase tracking-[0.2em] text-primary";
const DT =
  "text-[11px] leading-4 uppercase tracking-[0.08em] text-muted-foreground";
const DD = "text-sm leading-5 font-semibold";
const SUB =
  "mt-4 border-b border-[var(--color-choice-edge,var(--color-border))] pb-1 text-[11px] leading-4 uppercase tracking-[0.08em] text-muted-foreground";
const REQ =
  "flex min-h-14 items-center gap-2 border-t border-foreground/10 py-2 text-sm first-of-type:border-t-0";

function Missing() {
  return <span className="font-normal text-muted-foreground">Not said</span>;
}

/**
 * The label/value list. `row` lays the fields side by side when the page is
 * wide enough (Transport); `stack` keeps a label column (My lift, a phone).
 */
function Fields({
  items,
  layout,
  weights,
}: {
  items: [string, ReactNode][];
  layout: "row" | "stack";
  /** Column widths in the row layout, so a long value (the car) has room. */
  weights?: number[];
}) {
  const cols = (weights ?? items.map(() => 1))
    .map((w) => `minmax(0,${w}fr)`)
    .join(" ");
  return (
    <dl
      className={cn(
        "grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2",
        layout === "row" &&
          "page-md:grid-cols-[var(--cols)] page-md:items-start page-md:gap-4",
      )}
      style={{ ["--cols" as string]: cols }}
    >
      {items.map(([dt, dd]) => (
        <div
          key={dt}
          className={cn("contents", layout === "row" && "page-md:block")}
        >
          <dt className={DT}>{dt}</dt>
          <dd className={cn(DD, layout === "row" && "page-md:mt-1")}>{dd}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="border border-foreground/10 bg-card p-4"
    >
      <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
        <h2 className={LABEL}>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LiftPanel({
  panel,
  me,
  layout,
}: {
  panel: Panel;
  me: string;
  layout: "row" | "stack";
}) {
  if (panel.kind === "rider") {
    return (
      <Card
        label="Your lift"
        action={
          panel.driverUserId ? (
            <LeaveCarButton
              driverUserId={panel.driverUserId}
              memberUserId={me}
            />
          ) : undefined
        }
      >
        <Fields
          layout={layout}
          weights={[1, 1.6, 1, 0.8, 1.2]}
          items={[
            ["Driver", panel.driverName],
            ["Car", panel.vehicle ?? <Missing />],
            ["From", panel.from ?? <Missing />],
            ["Arriving", panel.arriving ?? <Missing />],
            [
              "Riding with",
              panel.ridingWith.length > 0 ? (
                panel.ridingWith.join(", ")
              ) : (
                <span className="font-normal text-muted-foreground">
                  Nobody else yet
                </span>
              ),
            ],
          ]}
        />
      </Card>
    );
  }

  if (panel.kind === "driver") {
    const seats = seatsCell({
      seatsOffered: panel.seatsOffered,
      riders: panel.riders,
    });
    const change = (
      <ChangeSeatsButton
        driverUserId={me}
        seatsOffered={panel.seatsOffered}
        riders={panel.riders.length}
        className="-ml-2"
      />
    );
    return (
      <Card
        label="Your car"
        action={<CarMessageButton riders={panel.riders.map((r) => r.name)} />}
      >
        <Fields
          layout={layout}
          weights={[1.6, 1, 0.8, 1.6]}
          items={[
            ["Car", panel.vehicle ?? <Missing />],
            ["From", panel.from ?? <Missing />],
            ["Arriving", panel.arriving ?? <Missing />],
            [
              "Seats",
              <span key="seats" className="flex flex-wrap items-center gap-x-2">
                <span
                  className={cn(
                    "whitespace-nowrap",
                    seats.muted && "font-normal text-muted-foreground",
                  )}
                >
                  {seats.text}
                </span>
                <span className="hidden page-sm:inline">{change}</span>
              </span>,
            ],
          ]}
        />
        {panel.asking.length > 0 && (
          <>
            <h3 className={SUB}>Asking to ride with you</h3>
            <ul aria-label="Asking to ride with you">
              {panel.asking.map((p) => (
                <li key={p.userId} className={REQ}>
                  <span className="min-w-0 flex-1">{p.name}</span>
                  <span className="hidden page-sm:inline">
                    <AnswerRequest memberUserId={p.userId} name={p.name} />
                  </span>
                  <span className="page-sm:hidden">
                    <AnswerRequest
                      memberUserId={p.userId}
                      name={p.name}
                      phone
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3 className={SUB}>Riding with you</h3>
        {panel.riders.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Nobody rides with you yet.
          </p>
        ) : (
          <ul aria-label="Riding with you">
            {panel.riders.map((r) => (
              <li key={r.userId} className={REQ}>
                <span className="min-w-0 flex-1">{r.name}</span>
                <span className="hidden page-sm:inline">
                  <TakeOutButton
                    driverUserId={me}
                    memberUserId={r.userId}
                    name={r.name}
                  />
                </span>
                <span className="page-sm:hidden">
                  <TakeOutButton
                    driverUserId={me}
                    memberUserId={r.userId}
                    name={r.name}
                    short
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-[var(--color-choice-edge,var(--color-border))] pt-3 page-sm:hidden">
          <ChangeSeatsButton
            driverUserId={me}
            seatsOffered={panel.seatsOffered}
            riders={panel.riders.length}
            className="h-10 w-full border border-[var(--color-choice-edge,var(--color-border))]"
          />
        </div>
      </Card>
    );
  }

  if (panel.kind === "asked") {
    return (
      <Card label="Your request" action={<WithdrawRequestButton />}>
        <Fields
          layout={layout}
          items={[
            ["Asked for", panel.car ?? "Any car"],
            [
              "Answer",
              <span key="answer" className="inline-flex items-center gap-2">
                <span className="border border-[oklch(0.85_0.13_85/0.5)] px-2 py-0.5 text-xs leading-4 font-semibold text-[oklch(0.85_0.13_85)]">
                  Waiting
                </span>
                <span className="font-normal">for {panel.waitingFor}</span>
              </span>,
            ],
          ]}
        />
      </Card>
    );
  }

  return (
    <section
      aria-label="No lift yet"
      className="grid justify-items-center gap-3 border border-dashed border-[var(--color-choice-edge,var(--color-border))] bg-card/40 px-4 py-6 text-center page-sm:px-6 page-sm:py-8"
    >
      <h2 className="font-sans text-base font-semibold tracking-normal normal-case">
        No lift yet
      </h2>
      <p className="m-0 max-w-[440px] text-[13px] leading-5 text-muted-foreground">
        You&apos;re not driving and not in a car yet. Ask a driver with free
        seats, or ask for any car and a Transport lead places you.
      </p>
      <AskForLift cars={panel.cars} />
      <Link
        href={LIFT_DRIVER_FORM_HREF}
        className="text-[13px] font-medium text-primary hover:underline"
      >
        Driving this year? Fill in the driver form
      </Link>
    </section>
  );
}

import { canEditTransport } from "@camp404/core";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { LiftPanel } from "@/components/transport/lift-panel";
import {
  CarsSection,
  NeedsSeatSection,
  TrailersSection,
} from "@/components/transport/transport-board";
import { captainPageGate } from "@/lib/captain-gate";
import { getMyLift } from "@/lib/lifts";
import {
  getTransportBoard,
  liftRequestsFor,
  listLiftRequests,
  listUnseated,
  type UnseatedMember,
} from "@/lib/transport";
import { liftPanel, needsSeatRows, transportStrip } from "@/lib/transport-view";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Transport — Camp 404" };

// Transport (#270), as the owner approved it (Option A, 2026-10-01): one page
// of tables, one row per person, one button in one place. The viewer's own
// lift first, then four counts in one strip, then (for a Transport editor)
// everyone who still needs a seat, the cars, and the trailers.
//
// Every approved member reads the cars and trailers (names and cars only: no
// phone, registration or travel dates of anyone else's car). Filtered here on
// the server: lift requests reach only an editor, the asked driver and the
// asker; the members still without a seat (built on attendance, which leads
// and captains read) reach only an editor. A viewer who may not change a list
// never gets its controls.

export default async function TransportPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditTransport(rank, leadTeams);
  const me = campUser.id;

  const [board, requests, unseated, lift] = await Promise.all([
    getTransportBoard(),
    listLiftRequests(),
    canEdit ? listUnseated() : Promise.resolve([] as UnseatedMember[]),
    getMyLift(me),
  ]);
  const { cars, trailers } = board;
  const visible = liftRequestsFor(requests, { userId: me, canEdit });
  const needs = canEdit ? needsSeatRows(unseated, visible, cars) : [];
  const strip = transportStrip({
    cars,
    trailers,
    needSeat: canEdit ? needs.length : null,
  });

  return (
    <div className="@container/transport flex flex-col">
      <PageHeading
        eyebrow="Camp / Transport"
        title="Transport"
        description="This year's cars, who rides in them, and the camp's trailers."
      />

      <LiftPanel
        panel={liftPanel({ me, lift, cars, requests: visible })}
        me={me}
        layout="row"
      />

      <dl
        aria-label="Transport at a glance"
        className="mt-3 grid grid-cols-2 border border-[var(--color-choice-edge,var(--color-border))] bg-card @min-[40rem]/transport:grid-cols-4"
      >
        {strip.map((s, i) => (
          <div
            key={s.key}
            className={[
              "px-4 py-3",
              i % 2 === 1 ? "border-l" : "",
              i >= 2
                ? "border-t @min-[40rem]/transport:border-t-0 @min-[40rem]/transport:border-l"
                : "",
              "border-[var(--color-choice-edge,var(--color-border))]",
            ].join(" ")}
          >
            <dt className="text-[11px] leading-4 uppercase tracking-[0.08em] text-muted-foreground">
              {s.key === "trailers" ? (
                <>
                  <span className="@min-[40rem]/transport:hidden">
                    Trailers, no car
                  </span>
                  <span className="hidden @min-[40rem]/transport:inline">
                    {s.label}
                  </span>
                </>
              ) : (
                s.label
              )}
            </dt>
            <dd className="m-0 mt-1 text-xl leading-7 font-bold tabular-nums">
              {s.value}
              {s.of !== null && (
                <small className="ml-1 text-[13px] font-medium text-muted-foreground">
                  of {s.of}
                </small>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {canEdit && <NeedsSeatSection rows={needs} cars={cars} />}
      <CarsSection cars={cars} me={me} canEdit={canEdit} />
      <TrailersSection trailers={trailers} cars={cars} canEdit={canEdit} />
    </div>
  );
}

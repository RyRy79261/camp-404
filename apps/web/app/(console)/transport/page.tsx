import { Car, Lock, Truck, Users } from "lucide-react";
import {
  canEditTransport,
  canManageCar,
  seatsLeft,
  transportTotals,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { PowerKpiCards, type PowerKpi } from "@/components/power/load-panels";
import {
  AddTrailerButton,
  AskForLift,
  CarMessageButton,
  LeaveCarButton,
  PlaceInCar,
  RequestActions,
  RiderChip,
  SeatsControl,
  TowSelect,
  TrailerRowActions,
  WithdrawRequestButton,
  type CarOption,
} from "@/components/transport/transport-controls";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getTransportBoard,
  liftRequestsFor,
  listLiftRequests,
  listUnseated,
  type LiftRequestRow,
  type TrailerRow,
  type TransportCar,
  type UnseatedMember,
} from "@/lib/transport";
import { TRANSPORT_REFUSAL, seatsText } from "@/lib/transport-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Transport — Camp 404" };

// Transport (#270): this year's cars, who rides in them, lift requests and the
// camp's trailers. Every approved member reads the car list (names and cars
// only: no phone, registration or travel dates). A driver manages their own
// car and writes to the people in it; a member asks for a lift; a captain or
// a Transport & Logistics lead matches people and keeps the trailers.
// Composed as the power load list: KPI cards, then tables in cards, and for
// anyone who may not use a control, the control present but disabled with one
// Lock line that each one points at.
//
// Filtered here on the server: lift requests reach only an editor, the asked
// driver and the asker; the members still without a seat (built on attendance,
// which leads and captains read) reach only an editor.

const REFUSAL_ID = "transport-edit-refusal";

const nameOf = (name: string | null) => name?.trim() || "A camp member";

function carLabel(car: TransportCar): string {
  const who = nameOf(car.driverName);
  return car.vehicle ? `${who} · ${car.vehicle}` : `${who}'s car`;
}

function carColumns(input: {
  viewerId: string;
  canEdit: boolean;
  rank: string;
  leadTeams: readonly string[];
}): ResponsiveColumn<TransportCar>[] {
  return [
    {
      id: "driver",
      header: "Driver",
      role: "title",
      cellClassName: "font-medium",
      cell: (c) => nameOf(c.driverName),
    },
    {
      id: "car",
      header: "Car",
      cellClassName: "text-muted-foreground",
      cell: (c) => c.vehicle ?? "Not said",
    },
    {
      id: "from",
      header: "From",
      cellClassName: "text-muted-foreground",
      cell: (c) => c.departureCity ?? "Not said",
    },
    {
      id: "seats",
      header: "Seats",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (c) => seatsText(c.seatsOffered, c.riders.length),
    },
    {
      id: "trailer",
      header: "Trailer",
      role: "badge",
      cell: (c) =>
        c.trailer ? (
          <Badge variant="secondary">Tows {c.trailer.name}</Badge>
        ) : c.canTow ? (
          <Badge variant="outline">Can tow</Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "riders",
      header: "Riders",
      cell: (c) => {
        if (c.riders.length === 0) {
          return <span className="text-muted-foreground">Nobody yet</span>;
        }
        const manages = canManageCar(
          input.rank,
          input.leadTeams,
          input.viewerId,
          c.driverUserId,
        );
        return (
          <span className="flex flex-wrap gap-1">
            {c.riders.map((r) => (
              <RiderChip
                key={r.userId}
                driverUserId={c.driverUserId}
                rider={{ userId: r.userId, name: nameOf(r.name) }}
                canRemove={manages}
              />
            ))}
          </span>
        );
      },
    },
  ];
}

function requestColumns(input: {
  cars: TransportCar[];
  viewerId: string;
  canEdit: boolean;
  rank: string;
  leadTeams: readonly string[];
  placeCars: CarOption[];
}): ResponsiveColumn<LiftRequestRow>[] {
  return [
    {
      id: "who",
      header: "Who",
      role: "title",
      cellClassName: "font-medium",
      cell: (r) => nameOf(r.name),
    },
    {
      id: "car",
      header: "Asked for",
      cellClassName: "text-muted-foreground",
      cell: (r) => {
        const car = input.cars.find((c) => c.driverUserId === r.driverUserId);
        return car ? carLabel(car) : "Any car";
      },
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (r) => {
        const name = nameOf(r.name);
        if (r.driverUserId === null) {
          return input.canEdit ? (
            <span className="flex flex-wrap items-center justify-end gap-1">
              <PlaceInCar
                memberUserId={r.userId}
                name={name}
                cars={input.placeCars}
              />
              <RequestActions
                memberUserId={r.userId}
                name={name}
                canAccept={false}
              />
            </span>
          ) : null;
        }
        const manages = canManageCar(
          input.rank,
          input.leadTeams,
          input.viewerId,
          r.driverUserId,
        );
        return manages ? (
          <RequestActions memberUserId={r.userId} name={name} canAccept />
        ) : null;
      },
    },
  ];
}

function unseatedColumns(
  placeCars: CarOption[],
  askedIds: ReadonlySet<string>,
): ResponsiveColumn<UnseatedMember>[] {
  return [
    {
      id: "who",
      header: "Who",
      role: "title",
      cellClassName: "font-medium",
      cell: (m) => nameOf(m.name),
    },
    {
      id: "asked",
      header: "Asked",
      role: "badge",
      cell: (m) =>
        askedIds.has(m.userId) ? (
          <Badge variant="outline">Asked for a lift</Badge>
        ) : (
          <span className="text-muted-foreground">Not yet</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (m) => (
        <PlaceInCar
          memberUserId={m.userId}
          name={nameOf(m.name)}
          cars={placeCars}
        />
      ),
    },
  ];
}

function trailerColumns(input: {
  canEdit: boolean;
  cars: TransportCar[];
}): ResponsiveColumn<TrailerRow>[] {
  return [
    {
      id: "name",
      header: "Trailer",
      role: "title",
      cellClassName: "font-medium",
      cell: (t) => t.name,
    },
    {
      id: "notes",
      header: "Notes",
      cellClassName: "text-muted-foreground",
      cell: (t) => t.notes ?? "",
    },
    {
      id: "tow",
      header: "Towed by",
      cell: (t) => {
        // The cars that can tow and tow nothing else this year, and this one.
        const options: CarOption[] = input.cars
          .filter(
            (c) => c.canTow && (c.trailer === null || c.trailer.id === t.id),
          )
          .map((c) => ({ driverUserId: c.driverUserId, label: carLabel(c) }));
        return (
          <TowSelect
            trailer={t}
            cars={options}
            canEdit={input.canEdit}
            refusalId={REFUSAL_ID}
          />
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (t) => (
        <TrailerRowActions
          trailer={t}
          canEdit={input.canEdit}
          refusalId={REFUSAL_ID}
        />
      ),
    },
  ];
}

const TABLE_CARD =
  "page-md:rounded-xl page-md:border page-md:bg-card page-md:text-card-foreground page-md:shadow-sm";

export default async function TransportPage() {
  // Every approved member reads the car list.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditTransport(rank, leadTeams);
  const me = campUser.id;

  const [board, requests, unseated] = await Promise.all([
    getTransportBoard(),
    listLiftRequests(),
    canEdit ? listUnseated() : Promise.resolve([] as UnseatedMember[]),
  ]);
  const { cars, trailers } = board;

  const myCar = cars.find((c) => c.driverUserId === me) ?? null;
  const myRide =
    cars.find((c) => c.riders.some((r) => r.userId === me)) ?? null;
  const myRequest = requests.find((r) => r.userId === me) ?? null;
  const askedCar =
    cars.find((c) => c.driverUserId === myRequest?.driverUserId) ?? null;
  const shownRequests = liftRequestsFor(requests, { userId: me, canEdit })
    // The member's own request is shown in their lift panel, not the list.
    .filter((r) => r.userId !== me);

  const openCars: CarOption[] = cars
    .filter(
      (c) =>
        c.driverUserId !== me &&
        (seatsLeft(c.seatsOffered, c.riders.length) ?? 1) > 0,
    )
    .map((c) => {
      const left = seatsLeft(c.seatsOffered, c.riders.length);
      return {
        driverUserId: c.driverUserId,
        label: left === null ? carLabel(c) : `${carLabel(c)} (${left} free)`,
      };
    });
  const placeCars: CarOption[] = cars
    .filter((c) => (seatsLeft(c.seatsOffered, c.riders.length) ?? 1) > 0)
    .map((c) => ({ driverUserId: c.driverUserId, label: carLabel(c) }));
  const askedIds = new Set(requests.map((r) => r.userId));

  const totals = transportTotals(
    cars.map((c) => ({
      seatsOffered: c.seatsOffered,
      riders: c.riders.length,
    })),
    trailers,
  );
  const kpis: PowerKpi[] = [
    {
      key: "cars",
      label: "Cars",
      value: String(totals.cars),
      hint: "Driving to the burn this year.",
    },
    {
      key: "seats",
      label: "Seats free",
      value: String(totals.seatsLeft),
      hint: `${totals.seatsTaken} taken of ${totals.seatsOffered} offered.`,
    },
    {
      key: "travelling",
      label: "In camp cars",
      value: String(totals.travelling),
      hint: "Drivers and riders together.",
    },
    {
      key: "trailers",
      label: "Trailers",
      value: String(totals.trailers),
      hint: `${totals.trailersTowed} with a car to tow ${totals.trailers === 1 ? "it" : "them"}.`,
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Transport & Logistics"
        title="Transport"
        description="This year's cars, who rides in them, and the trailers. Everyone can read it. Drivers look after their own car; captains and Transport & Logistics leads match people and keep the trailers."
        actions={
          myCar ? <CarMessageButton riders={myCar.riders.length} /> : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <PowerKpiCards kpis={kpis} label="Transport at a glance" />

        <Card aria-labelledby="my-lift-title">
          <CardHeader>
            <CardTitle id="my-lift-title" className="text-base">
              {myCar ? "Your car" : myRide ? "Your lift" : "Need a lift?"}
            </CardTitle>
            <CardDescription>
              {myCar
                ? `${myCar.vehicle ?? "Your car"} · ${seatsText(myCar.seatsOffered, myCar.riders.length)}`
                : myRide
                  ? `You ride with ${nameOf(myRide.driverName)}${myRide.vehicle ? ` in the ${myRide.vehicle}` : ""}.`
                  : myRequest
                    ? askedCar
                      ? `You asked for a seat in ${carLabel(askedCar)}. The driver says yes or no.`
                      : "You asked for a lift in any car. The transport team will find you one."
                    : "Ask for a seat in a car, or in any car, and the driver or the transport team will answer."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {myCar ? (
              <>
                <SeatsControl
                  key={myCar.seatsOffered ?? "none"}
                  driverUserId={me}
                  seatsOffered={myCar.seatsOffered}
                />
                <p className="text-sm text-muted-foreground">
                  {myCar.riders.length === 0
                    ? "Nobody rides with you yet. Accept a request below when someone asks."
                    : `Riding with you: ${myCar.riders.map((r) => nameOf(r.name)).join(", ")}.`}
                </p>
              </>
            ) : myRide ? (
              <div>
                <LeaveCarButton
                  driverUserId={myRide.driverUserId}
                  memberUserId={me}
                />
              </div>
            ) : myRequest ? (
              <div>
                <WithdrawRequestButton />
              </div>
            ) : (
              <AskForLift cars={openCars} />
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="cars" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cars" className="text-base font-semibold">
              This year&apos;s cars
            </h2>
            <p className="text-xs text-muted-foreground">
              Names and cars only.
            </p>
          </div>
          {cars.length === 0 ? (
            <EmptyState
              icon={<Car />}
              title="No cars yet"
              description="A car shows here once its driver says on their driver form that they're driving this year."
            />
          ) : (
            <div className={TABLE_CARD}>
              <ResponsiveDataTable
                columns={carColumns({ viewerId: me, canEdit, rank, leadTeams })}
                data={cars}
                getRowKey={(c) => c.driverUserId}
                label="Cars"
              />
            </div>
          )}
        </section>

        {shownRequests.length > 0 && (
          <section aria-labelledby="requests" className="flex flex-col gap-3">
            <h2 id="requests" className="text-base font-semibold">
              {canEdit ? "Lift requests" : "Asking to ride with you"}
            </h2>
            <div className={TABLE_CARD}>
              <ResponsiveDataTable
                columns={requestColumns({
                  cars,
                  viewerId: me,
                  canEdit,
                  rank,
                  leadTeams,
                  placeCars,
                })}
                data={shownRequests}
                getRowKey={(r) => r.userId}
                label="Lift requests"
              />
            </div>
          </section>
        )}

        {canEdit && (
          <section aria-labelledby="unseated" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="unseated" className="text-base font-semibold">
                Still without a seat
              </h2>
              <p className="text-xs text-muted-foreground">
                Coming this year, not driving, and in no car yet.
              </p>
            </div>
            {unseated.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="Everyone coming has a seat"
                description="Or nobody has said they're coming yet."
              />
            ) : (
              <div className={TABLE_CARD}>
                <ResponsiveDataTable
                  columns={unseatedColumns(placeCars, askedIds)}
                  data={unseated}
                  getRowKey={(m) => m.userId}
                  label="Still without a seat"
                />
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="trailers" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="trailers" className="text-base font-semibold">
              Trailers
            </h2>
            <AddTrailerButton canEdit={canEdit} refusalId={REFUSAL_ID} />
          </div>
          {!canEdit && (
            <p
              id={REFUSAL_ID}
              className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {TRANSPORT_REFUSAL}
            </p>
          )}
          {trailers.length === 0 ? (
            <EmptyState
              icon={<Truck />}
              title="No trailers yet"
              description="Add the trailers the camp has this year, then pick the car that tows each one."
            />
          ) : (
            <div className={TABLE_CARD}>
              <ResponsiveDataTable
                columns={trailerColumns({ canEdit, cars })}
                data={trailers}
                getRowKey={(t) => t.id}
                label="Trailers"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

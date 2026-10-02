import { canTotals, fillingCar } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  FuelCanList,
  type CanView,
  type CarView,
} from "@/components/power/fuel-cans";
import { PowerFrame } from "@/components/power/power-frame";
import { SectionHead } from "@/components/power/power-ui";
import { PRINT_CAN_SHEET_PATH } from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import { listAssignableMembers } from "@/lib/tasks";
import { getTransportBoard } from "@/lib/transport";
import { firstName, nameOf, shortCarLabel } from "@/lib/transport-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Refuelling — Camp 404" };

// Refuelling (#255) in the Power program's answer rail: the fuel can register
// the owner approved (option A, 2026-10-02). The camp takes a set number of
// jerry cans and never refills them at the burn; Fire & Fuel keep them at
// their depot. There is no signal on site, so the printed can sheet is the
// record there, ticked by hand, and this page only keeps the list it prints:
// each can's owner, size, material, the car that brings it, and a note.
//
// Who fills a can is derived here, never stored: the driver of its car
// (fillingCar). The cars are this year's in Transport. Every member reads the
// list; only a captain or a Power & Lighting lead gets Add a can and Edit.
// Names only: a can's owner and a car's driver, as Transport already shows.

async function RefuellingSection() {
  const [{ canEdit }, o, board] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
    getTransportBoard(),
  ]);
  // Only an editor picks a can's owner.
  const members = canEdit ? await listAssignableMembers() : [];

  const totals = canTotals(o.cans, board.cars);
  const cars: CarView[] = totals.cars.map(({ car, cans, litres }) => ({
    driverUserId: car.driverUserId,
    label: shortCarLabel(car),
    driverName: nameOf(car.driverName),
    firstName: firstName(car.driverName),
    cans,
    litres,
  }));
  const cans: CanView[] = o.cans.map((c, i) => {
    const car = fillingCar(c, board.cars);
    return {
      id: c.id,
      version: c.version,
      number: i + 1,
      ownerUserId: c.ownerUserId,
      ownerName: c.ownerUserId ? nameOf(c.ownerName) : "Camp",
      sizeLitres: c.sizeLitres,
      material: c.material,
      travelsWithUserId: car ? car.driverUserId : null,
      carLabel: car ? shortCarLabel(car) : null,
      filledBy: car ? nameOf(car.driverName) : null,
      note: c.note,
    };
  });

  return (
    <>
      <SectionHead
        title="Refuelling"
        sentence="Our fuel cans and the cars that bring them. Each driver fills the cans in their car before leaving home. On site the printed sheet is the record."
        actions={
          <Button asChild>
            <a href={PRINT_CAN_SHEET_PATH} target="_blank" rel="noopener">
              Print the can sheet
            </a>
          </Button>
        }
      />
      <FuelCanList
        cans={cans}
        cars={cars}
        notOnCar={totals.notOnCar}
        canEdit={canEdit}
        members={members.map((m) => ({
          id: m.id,
          name: nameOf(m.displayName),
        }))}
      />
    </>
  );
}

export default function PowerRefuellingPage() {
  return (
    <PowerFrame section="refuelling">
      <RefuellingSection />
    </PowerFrame>
  );
}

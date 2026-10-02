import Link from "next/link";
import { PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { printName } from "@/lib/lounge-copy";
import { getMyShifts } from "@/lib/shifts";
import { MY_SHIFTS_PATH } from "@/lib/shifts-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "My shifts card to print — Camp 404" };

// A member's own shifts on a pocket card (#248), in the shared print shell
// (#249: A4, black on white, no desktop, Download PDF and Print). There is
// no internet at the burn, so this is what they carry. Only their own
// shifts, and their own AfrikaBurn volunteer shifts, which nobody else sees.

export default async function MyShiftsPrintPage() {
  const { campUser } = await captainPageGate("camp_member");
  const view = await getMyShifts(campUser.id);
  const who = printName(campUser.displayName?.trim() || "Camp member");

  const options = (
    <Link href={MY_SHIFTS_PATH} className="underline">
      Back to my shifts
    </Link>
  );

  return (
    <PrintSheet area="Shifts" title={`${who}'s shifts`} options={options}>
      {view.shifts.length === 0 ? (
        <p>No shifts yet.</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {view.shifts.map((s) => (
            <li
              key={s.slotId}
              data-testid="card-shift"
              className="border-b border-neutral-400 pb-1"
            >
              <span className="font-semibold">{s.dayLabel}</span>{" "}
              <span className="tabular-nums">{s.timeText}</span>
              <span className="block">{s.name}</span>
            </li>
          ))}
        </ol>
      )}
      {view.volunteer.length > 0 && (
        <>
          <h2 className="text-sm font-bold">AfrikaBurn</h2>
          <ol className="flex flex-col gap-1 text-sm">
            {view.volunteer.map((v) => (
              <li key={v.id}>
                <span className="font-semibold">{v.dayLabel}</span>{" "}
                <span className="tabular-nums">{v.timeText}</span>{" "}
                {v.department}
              </li>
            ))}
          </ol>
        </>
      )}
    </PrintSheet>
  );
}

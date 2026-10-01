import Link from "next/link";
import { PrintButton } from "@/components/lounge/lounge-controls";
import { captainPageGate } from "@/lib/captain-gate";
import { printName } from "@/lib/lounge-copy";
import { getMyShifts } from "@/lib/shifts";
import { MY_SHIFTS_PATH } from "@/lib/shifts-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "My shifts card to print — Camp 404" };

// A member's own shifts on a pocket card (#248), printed the #249 way: black
// on white, no desktop, the browser's print dialog. There is no internet at
// the burn, so this is what they carry. Only their own shifts, and their own
// AfrikaBurn volunteer shifts, which nobody else sees.

export default async function MyShiftsPrintPage() {
  const { campUser } = await captainPageGate("camp_member");
  const view = await getMyShifts(campUser.id);
  const who = printName(campUser.displayName?.trim() || "Camp member");

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-black print:p-0">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <nav
          aria-label="Print options"
          className="flex flex-wrap items-center gap-2 text-sm print:hidden"
        >
          <Link href={MY_SHIFTS_PATH} className="underline">
            Back to my shifts
          </Link>
          <span className="ml-auto">
            <PrintButton />
          </span>
        </nav>
        <section
          aria-labelledby="card-title"
          className="w-full max-w-sm border-2 border-black p-4"
        >
          <h1 id="card-title" className="text-lg font-bold">
            {who}&apos;s shifts
          </h1>
          <p className="mb-3 text-sm">Camp 404</p>
          {view.shifts.length === 0 ? (
            <p className="text-sm">No shifts yet.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {view.shifts.map((s) => (
                <li
                  key={s.slotId}
                  data-testid="card-shift"
                  className="border-b border-black/40 pb-1"
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
              <h2 className="mt-3 text-sm font-bold">AfrikaBurn</h2>
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
        </section>
      </div>
    </div>
  );
}

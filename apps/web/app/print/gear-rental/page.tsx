import Link from "next/link";
import { PrintButton } from "@/components/lounge/lounge-controls";
import { captainPageGate } from "@/lib/captain-gate";
import { printName } from "@/lib/lounge-copy";
import { ledgerCycle } from "@/lib/payments";
import { getRentalOverview } from "@/lib/rental";
import {
  RENTAL_PRINT_PATH,
  RENTAL_REFUSAL,
  RENTAL_SUMMARY_PATH,
} from "@/lib/rental-copy";
import { runsRental } from "@/lib/rental-gate";
import { quantityText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental to print — Camp 404" };

// Gear rental on paper (#241, printed the #249 way: a page outside the
// console, black on white, no header or nav, and the browser's print dialog).
// Two sheets. "Order" is what the camp asks the supplier for and what it
// takes out of storage: item counts only, no member names and no prices, so
// it can be handed to the supplier as it is. "Tents" is each confirmed tent's
// label and who sleeps in it, to take to the Burn, where there is no signal.
// Captains only, like the screen; a sleeper prints as a first name and a
// surname initial.

const SHEETS = [
  { key: "order", label: "Order and storage" },
  { key: "tents", label: "Tents" },
] as const;

export default async function GearRentalPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const gate = await captainPageGate("team_lead");
  if (!gate.cleared || !(await runsRental(gate))) {
    return (
      <div className="min-h-screen bg-white px-6 py-8 text-black">
        <p>{RENTAL_REFUSAL}</p>
      </div>
    );
  }
  const [cycle, params] = await Promise.all([ledgerCycle(), searchParams]);
  const overview = await getRentalOverview(cycle);
  const sheet = params.sheet === "tents" ? "tents" : "order";
  const rows = overview.summary.rows;
  const toOrder = rows.filter((r) => r.toOrder > 0);
  const fromStorage = rows.filter((r) => r.fromStorage > 0);

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-black print:p-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <nav
          aria-label="Print options"
          className="flex flex-wrap items-center gap-2 text-sm print:hidden"
        >
          <Link href={RENTAL_SUMMARY_PATH} className="underline">
            Back to the summary
          </Link>
          <span aria-hidden>·</span>
          {SHEETS.map((s) => (
            <Link
              key={s.key}
              href={`${RENTAL_PRINT_PATH}?sheet=${s.key}`}
              aria-current={sheet === s.key ? "page" : undefined}
              className={sheet === s.key ? "font-semibold" : "underline"}
            >
              {s.label}
            </Link>
          ))}
          <span className="ml-auto">
            <PrintButton />
          </span>
        </nav>

        {sheet === "order" ? (
          <section
            aria-labelledby="order-title"
            className="flex flex-col gap-6"
          >
            <div>
              <h1 id="order-title" className="text-2xl font-bold">
                Camp 404 gear rental
              </h1>
              <p className="text-lg">
                {overview.confirmed === 1
                  ? "From 1 confirmed order"
                  : `From ${overview.confirmed} confirmed orders`}
                , with the adoptee reserve.
              </p>
            </div>
            <div>
              <h2 className="mb-2 text-xl font-semibold">
                Order from the supplier
              </h2>
              {toOrder.length === 0 ? (
                <p>Nothing to order.</p>
              ) : (
                <table className="w-full border-collapse text-base">
                  <thead>
                    <tr className="border-b-2 border-black text-left">
                      <th className="py-2">Item</th>
                      <th className="w-32 py-2 text-right">How many</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toOrder.map((r) => (
                      <tr
                        key={r.itemId}
                        data-testid="print-order-row"
                        className="border-b border-black/40"
                      >
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {r.toOrder}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h2 className="mb-2 text-xl font-semibold">
                Take out of storage
              </h2>
              {fromStorage.length === 0 ? (
                <p>Nothing from camp stock.</p>
              ) : (
                <table className="w-full border-collapse text-base">
                  <thead>
                    <tr className="border-b-2 border-black text-left">
                      <th className="py-2">Item</th>
                      <th className="w-32 py-2 text-right">How many</th>
                      <th className="w-24 py-2 text-right">Packed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fromStorage.map((r) => (
                      <tr
                        key={r.itemId}
                        data-testid="print-storage-row"
                        className="border-b border-black/40"
                      >
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {r.fromStorage}
                        </td>
                        <td className="py-2 text-right">
                          <span className="inline-block h-5 w-5 border border-black" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        ) : (
          <section aria-labelledby="tents-title">
            <h1 id="tents-title" className="text-2xl font-bold">
              Camp 404 tents
            </h1>
            <p className="mb-4 text-lg">
              Each tent&rsquo;s label and sleepers.
            </p>
            {overview.tents.length === 0 ? (
              <p>No confirmed tents yet.</p>
            ) : (
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="w-28 py-2">Label</th>
                    <th className="w-56 py-2">Tent</th>
                    <th className="py-2">Who sleeps in it</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.tents.map((t) => (
                    <tr
                      key={t.lineId}
                      data-testid="print-tent-row"
                      className="border-b border-black/40 align-top"
                    >
                      <td className="py-2 font-semibold">
                        {t.tentLabel ?? "________"}
                      </td>
                      <td className="py-2">
                        {quantityText(t.quantity, t.itemName)}
                      </td>
                      <td className="py-2">
                        {[t.ownerName, ...t.sharers].map(printName).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

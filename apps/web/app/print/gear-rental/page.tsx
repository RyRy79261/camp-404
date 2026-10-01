import Link from "next/link";
import { PrintRefusal, PrintSheet } from "@/components/print/print-sheet";
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
import { SHEET_TABLE } from "@/lib/print";
import { ownTentText, printedOnText, tentNeedText } from "@/lib/rental-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear rental to print — Camp 404" };

// Gear rental on paper (#241, printed the #249 way: a page outside the
// console, black on white, no header or nav, and the browser's print dialog).
// Two sheets. "Order" is what the camp asks the supplier for and what it
// takes out of storage: item counts only, no member names and no prices, so
// it can be handed to the supplier as it is. "Tents" is each confirmed tent's
// label and who sleeps in it, then the tents members bring themselves (what
// they are and how many they sleep, for the site plan), to take to the Burn,
// where there is no signal.
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
      <PrintRefusal>
        <p>{RENTAL_REFUSAL}</p>
      </PrintRefusal>
    );
  }
  const [cycle, params] = await Promise.all([ledgerCycle(), searchParams]);
  const overview = await getRentalOverview(cycle);
  const sheet = params.sheet === "tents" ? "tents" : "order";
  const rows = overview.summary.rows;
  const toOrder = rows.filter((r) => r.toOrder > 0);
  const fromStorage = rows.filter((r) => r.fromStorage > 0);
  const printed = printedOnText(cycle, new Date());

  const options = (
    <>
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
    </>
  );

  if (sheet === "order") {
    return (
      <PrintSheet
        area="Gear rental"
        title="Order and storage"
        subtitle={`${printed}. ${
          overview.confirmed === 1
            ? "From 1 confirmed order"
            : `From ${overview.confirmed} confirmed orders`
        }, with the spares for on site.`}
        options={options}
      >
        <div>
          <h2 className="mb-2 text-lg font-semibold">
            Order from the supplier
          </h2>
          {toOrder.length === 0 ? (
            <p>Nothing to order.</p>
          ) : (
            <table className={`${SHEET_TABLE} table-fixed`}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="w-32 text-right!">How many</th>
                </tr>
              </thead>
              <tbody>
                {toOrder.map((r) => (
                  <tr key={r.itemId} data-testid="print-order-row">
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{r.toOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Take out of storage</h2>
          {fromStorage.length === 0 ? (
            <p>Nothing from camp stock.</p>
          ) : (
            <table className={`${SHEET_TABLE} table-fixed`}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="w-32 text-right!">How many</th>
                  <th className="w-24 text-center!">Packed</th>
                </tr>
              </thead>
              <tbody>
                {fromStorage.map((r) => (
                  <tr key={r.itemId} data-testid="print-storage-row">
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{r.fromStorage}</td>
                    <td className="text-center">
                      <span className="inline-block h-4 w-4 border border-black align-middle" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PrintSheet>
    );
  }

  // The three tables share one column grid (label, tent, who sleeps in it),
  // so they line up down the sheet; the label is blank where there is none.
  const tentTable = (
    label: string,
    rowsOf: {
      key: string;
      testId: string;
      label: string;
      tent: string;
      who: string;
    }[],
  ) => (
    <table className={`${SHEET_TABLE} table-fixed`} aria-label={label}>
      <thead>
        <tr>
          <th className="w-24">Label</th>
          <th className="w-64">Tent</th>
          <th>Who sleeps in it</th>
        </tr>
      </thead>
      <tbody>
        {rowsOf.map((r) => (
          <tr key={r.key} data-testid={r.testId} className="align-top">
            <td className="font-semibold">{r.label}</td>
            <td>{r.tent}</td>
            <td>{r.who}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const who = (owner: string, sharers: string[]) =>
    [owner, ...sharers].map(printName).join(", ");

  return (
    <PrintSheet
      area="Gear rental"
      title="Tents"
      subtitle={`${printed}. Each tent\u2019s label and who sleeps in it.`}
      options={options}
    >
      <section className="flex flex-col">
        <h2 className="mb-2 text-lg font-semibold">The camp&rsquo;s tents</h2>
        {overview.tents.length === 0 ? (
          <p>No confirmed tents yet.</p>
        ) : (
          tentTable(
            "The camp's tents",
            overview.tents.map((t) => ({
              key: t.lineId,
              testId: "print-tent-row",
              label: t.tentLabel ?? "________",
              tent: t.itemName,
              who: who(t.ownerName, t.sharers),
            })),
          )
        )}
      </section>
      {overview.unassigned.length > 0 && (
        <section className="flex flex-col">
          <h2 className="mb-2 text-lg font-semibold">
            Needs a tent, not assigned yet
          </h2>
          {tentTable(
            "Needs a tent, not assigned yet",
            overview.unassigned.map((n) => ({
              key: n.orderId,
              testId: "print-unassigned-row",
              label: "",
              tent: tentNeedText(n.people),
              who: who(n.ownerName, n.sharers),
            })),
          )}
        </section>
      )}
      <section className="flex flex-col">
        <h2 className="mb-2 text-lg font-semibold">Members&rsquo; own tents</h2>
        {overview.ownTents.length === 0 ? (
          <p>Nobody has said they bring a tent yet.</p>
        ) : (
          tentTable(
            "Members' own tents",
            overview.ownTents.map((t) => ({
              key: t.orderId,
              testId: "print-own-tent-row",
              label: "",
              tent:
                ownTentText({
                  ownDescription: t.description,
                  ownSleeps: t.sleeps,
                }) ?? "Not said",
              who: who(t.ownerName, t.sharers),
            })),
          )
        )}
      </section>
    </PrintSheet>
  );
}

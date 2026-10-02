import Link from "next/link";
import { PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { listInventoryLoans } from "@/lib/inventory";
import {
  INVENTORY_LOANS_PATH,
  dateText,
  groupLoansByCamp,
} from "@/lib/inventory-copy";
import { printName } from "@/lib/lounge-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Strike checklist to print — Camp 404" };

// The strike checklist (#246 redesign, option A, owner 2026-10-01), in the
// shared A4 print shell (#249). There is no internet at the burn: print it
// before leaving, tick each loan when it is back in our truck, and write
// anything lent on site on the blank lines for a lead to type in after the
// burn. Every member may print it, as every member reads Lent out. A loan
// names the other camp and its address only; who lent it prints as a first
// name and an initial.

const BLANK_LINES = 8;

export default async function StrikeChecklistPrintPage() {
  await captainPageGate("camp_member");
  const loans = await listInventoryLoans();
  const out = loans.filter((l) => l.returnedAt === null);
  const camps = groupLoansByCamp(out);
  const box = <span className="inline-block size-5 border border-black" />;

  return (
    <PrintSheet
      area="Inventory"
      title="Strike checklist"
      subtitle={`Printed ${dateText(new Date())}. Tick each line when it is back in our truck.`}
      options={
        <Link href={INVENTORY_LOANS_PATH} className="underline">
          Back to Lent out
        </Link>
      }
    >
      <div>
        <h2 className="mb-2 text-xl font-semibold">Still out</h2>
        {camps.length === 0 ? (
          <p>Nothing is lent out.</p>
        ) : (
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="w-16 py-2 pr-3">Back</th>
                <th className="py-2">Item</th>
                <th className="w-24 py-2 text-right whitespace-nowrap">
                  How many
                </th>
                <th className="w-40 py-2 pl-4">Lent by</th>
              </tr>
            </thead>
            {camps.map((c) => (
              <tbody key={c.key}>
                <tr className="border-b border-black/40 bg-neutral-100">
                  <th colSpan={4} className="py-1.5 pl-1 text-left">
                    {c.camp}{" "}
                    <span className="font-normal text-neutral-700">
                      · {c.address}
                    </span>
                  </th>
                </tr>
                {c.loans.map((l) => (
                  <tr
                    key={l.id}
                    data-testid="print-loan-row"
                    className="border-b border-black/40"
                  >
                    <td className="py-2">{box}</td>
                    <td className="py-2">{l.itemName}</td>
                    <td className="py-2 text-right tabular-nums">
                      {l.quantity}
                    </td>
                    <td className="py-2 pl-4">
                      {printName(l.lentByName ?? "Camp member")}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
      <div>
        <h2 className="mb-1 text-xl font-semibold">Lent on site</h2>
        <p className="mb-2 text-sm text-neutral-700">
          Write it here when you lend something at the burn. A lead types it in
          after the burn.
        </p>
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="w-16 py-2 pr-3">Back</th>
              <th className="py-2">Item</th>
              <th className="w-24 py-2 text-right whitespace-nowrap">
                How many
              </th>
              <th className="w-56 py-2 pl-4">Camp and address</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BLANK_LINES }, (_, i) => (
              <tr
                key={i}
                data-testid="print-blank-row"
                className="h-10 border-b border-black/40"
              >
                <td className="py-2">{box}</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PrintSheet>
  );
}

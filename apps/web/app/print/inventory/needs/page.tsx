import Link from "next/link";
import { stillNeeded } from "@camp404/core";
import { PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { listInventoryNeeds } from "@/lib/inventory";
import { INVENTORY_NEEDS_PATH, dateText } from "@/lib/inventory-copy";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { printName } from "@/lib/lounge-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Who brings what to print — Camp 404" };

// Who brings what (#246 redesign, option A, owner 2026-10-01), in the shared
// A4 print shell (#249): this year's needs by team, in the camp's team order,
// with what is still to find and who pledged to bring the rest, to check on
// paper while packing and at build, where there is no internet. Every member
// may print it, as every member reads the needs and their pledges by name;
// a name prints as a first name and an initial.

export default async function NeedsPrintPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const needs = await listInventoryNeeds();
  const teams = [...new Set(needs.map((n) => n.team))].sort(
    (a, b) => viewer.teamOrder(a) - viewer.teamOrder(b),
  );
  const box = <span className="inline-block size-5 border border-black" />;

  return (
    <PrintSheet
      area="Inventory"
      title="Who brings what"
      subtitle={`This year's needs, printed ${dateText(new Date())}. Tick each one when it is packed.`}
      options={
        <Link href={INVENTORY_NEEDS_PATH} className="underline">
          Back to Needs this year
        </Link>
      }
    >
      {needs.length === 0 ? (
        <p>No needs yet this year.</p>
      ) : (
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="w-20 py-2 pr-3">Packed</th>
              <th className="py-2">Need</th>
              <th className="w-20 py-2 text-right">Needed</th>
              <th className="w-20 py-2 text-right">To find</th>
              <th className="w-64 py-2 pl-4">Who brings it</th>
            </tr>
          </thead>
          {teams.map((team) => (
            <tbody key={team}>
              <tr className="border-b border-black/40 bg-neutral-100">
                <th colSpan={5} className="py-1.5 pl-1 text-left">
                  {viewer.teamLabel(team)}
                </th>
              </tr>
              {needs
                .filter((n) => n.team === team)
                .map((n) => {
                  const pledged = n.pledges.reduce((s, p) => s + p.quantity, 0);
                  const still = stillNeeded({
                    quantity: n.quantity,
                    have: n.have,
                    bought: n.boughtQuantity,
                    pledged,
                  });
                  const from = [
                    n.have > 0 ? `Camp has ${n.have}` : null,
                    n.boughtQuantity > 0 ? `Bought ${n.boughtQuantity}` : null,
                    ...n.pledges.map(
                      (p) =>
                        `${printName(p.displayName)} ${p.quantity}${p.note ? ` (${p.note})` : ""}`,
                    ),
                  ].filter(Boolean);
                  return (
                    <tr
                      key={n.id}
                      data-testid="print-need-row"
                      className="border-b border-black/40 align-top"
                    >
                      <td className="py-2">{box}</td>
                      <td className="py-2">
                        {n.name}
                        {n.note && (
                          <span className="block text-sm text-neutral-700">
                            {n.note}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {n.quantity}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {still}
                      </td>
                      <td className="py-2 pl-4 text-sm">
                        {from.length > 0 ? from.join(" · ") : "Nobody yet"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      )}
    </PrintSheet>
  );
}

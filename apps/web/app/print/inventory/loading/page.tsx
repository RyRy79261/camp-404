import Link from "next/link";
import { addDays, loadingChecklist, shortDay } from "@camp404/core";
import type { InventoryItemRow } from "@camp404/db/inventory";
import {
  GroupRow,
  LIST_TABLE,
  LIST_TD,
  LIST_TH,
  TickBox,
  printedOn,
} from "@/components/print/print-kit";
import { PrintPage, PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { listInventoryItems } from "@/lib/inventory";
import {
  CATEGORY_LABELS,
  INVENTORY_PATH,
  countText,
} from "@/lib/inventory-copy";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listLogisticsPhases } from "@/lib/logistics";
import { getTransportBoard } from "@/lib/transport";
import { firstName } from "@/lib/transport-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Loading checklist to print — Camp 404" };

// The loading checklist on A4 (#249; the owner approved Option A of
// design/print-loading-checklist.html on 2026-10-02, with one change: "With
// inventory we don't really have shelves and things. We have categories of
// stuff that we own." So the items are grouped by the inventory's categories,
// the Gear tab's, not by shelf or place). One sheet per loading day, the Pack
// days on Logistics; the trailers and the cars that tow them, from Transport,
// at the top; each item with a tick box, how many, its weight where the camp
// knows it, and a blank "Went in" column to write the trailer or car by hand.
// Nothing says whether an item goes this year, so every item the camp owns is
// listed, and the sheet says to cross out what stays home.
//
// Every approved member reads the inventory and Transport, so every member
// prints it. A person shows by first name only: a trailer's driver, and the
// member whose home keeps an item.

const KG = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 });

function kgText(kg: number): string {
  return `${KG.format(kg)} kg`;
}

function Flag({ item }: { item: InventoryItemRow }) {
  if (item.condition === "good") return null;
  return (
    <span className="ml-1.5 text-[9.5px] font-semibold text-[#7a4a00]">
      {item.condition === "broken" ? "broken" : "needs repair"}
    </span>
  );
}

export default async function LoadingChecklistPrintPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const [items, phases, board] = await Promise.all([
    listInventoryItems(),
    listLogisticsPhases(),
    getTransportBoard(),
  ]);
  const list = loadingChecklist(items);
  const pack = phases.find((p) => p.phase === "pack");
  const days: (string | null)[] = [];
  if (pack?.startDate && pack.endDate) {
    for (
      let day: string | null = pack.startDate;
      day && day <= pack.endDate && days.length < 31;
      day = addDays(day, 1)
    ) {
      days.push(day);
    }
  }
  if (days.length === 0) days.push(null);

  const trailers = board.trailers.map(
    (t) =>
      `${t.name}, ${t.towedByName ? `behind ${firstName(t.towedByName)}'s car` : "no car yet"}`,
  );
  const drivers = board.cars.length;
  const printed = printedOn(new Date());

  return (
    <PrintSheet
      area="Inventory"
      title="Loading checklist"
      options={
        <Link href={INVENTORY_PATH} className="underline">
          Back to the inventory
        </Link>
      }
      marginMm={12}
      paged
    >
      {days.map((day, i) => {
        const subtitle = [
          day ? shortDay(day) : "Pack day not set on Logistics yet",
          pack?.place ?? null,
          `${list.count} ${list.count === 1 ? "item" : "items"}`,
          list.weighed ? `${kgText(list.weightKg)} where weighed` : null,
        ]
          .filter((p): p is string => p !== null)
          .join(" · ");
        return (
          <PrintPage
            key={day ?? "no-day"}
            area="Inventory"
            title="Loading checklist: Pack"
            subtitle={subtitle}
            label={`Loading checklist, ${day ? shortDay(day) : "Pack"}`}
            footer="Every item the camp owns is listed: cross out what stays home."
            footerEnd={`Printed ${printed}${days.length > 1 ? ` · sheet ${i + 1} of ${days.length}` : ""}`}
          >
            <p
              data-testid="loading-vehicles"
              className="mb-2.5 border-[1.5px] border-neutral-900 px-[9px] py-1.5 text-[11px] leading-normal"
            >
              <b>Trailers:</b>{" "}
              {trailers.length > 0 ? trailers.join(" · ") : "none this year"}
              <br />
              <b>Cars:</b> {drivers} {drivers === 1 ? "driver" : "drivers"} this
              year (Transport)
            </p>
            {list.count === 0 ? (
              <p className="text-[12px]">
                The inventory is empty. Add the camp&apos;s gear on the
                Inventory&apos;s Gear tab.
              </p>
            ) : (
              <table className={LIST_TABLE} aria-label="Items">
                <thead>
                  <tr>
                    <th className={`${LIST_TH} w-[18px]`}>
                      <span className="sr-only">Done</span>
                    </th>
                    <th className={LIST_TH}>Item</th>
                    <th className={`${LIST_TH} w-[88px] text-right`}>
                      How many
                    </th>
                    <th className={`${LIST_TH} w-[60px] text-right`}>Weight</th>
                    <th className={`${LIST_TH} w-[120px] pl-3.5`}>Went in</th>
                  </tr>
                </thead>
                <tbody>
                  {list.groups.flatMap((g) => [
                    <GroupRow
                      key={g.category}
                      colSpan={5}
                      aside={`${g.items.length} ${g.items.length === 1 ? "item" : "items"}`}
                    >
                      {CATEGORY_LABELS[g.category]}
                    </GroupRow>,
                    ...g.items.map((item) => (
                      <tr
                        key={item.id}
                        data-testid="loading-item"
                        className="break-inside-avoid"
                      >
                        <td className={LIST_TD}>
                          <TickBox />
                        </td>
                        <td className={LIST_TD}>
                          {item.name}
                          <span className="text-[10px] text-neutral-600">
                            {" "}
                            · {viewer.teamLabel(item.team)}
                            {item.location === "custodian_home" &&
                              item.custodianName &&
                              ` · at ${firstName(item.custodianName)}'s home`}
                          </span>
                          <Flag item={item} />
                        </td>
                        <td
                          className={`${LIST_TD} whitespace-nowrap text-right tabular-nums`}
                        >
                          {countText(item.quantity, item.unit)}
                        </td>
                        <td
                          className={`${LIST_TD} whitespace-nowrap text-right tabular-nums`}
                        >
                          {item.weightKg !== null ? kgText(item.weightKg) : ""}
                        </td>
                        <td className="border-b border-neutral-500 pl-3.5" />
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            )}
          </PrintPage>
        );
      })}
    </PrintSheet>
  );
}

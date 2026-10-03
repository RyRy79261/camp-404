import Link from "next/link";
import { formatMoney } from "@camp404/core";
import {
  GroupRow,
  LIST_TABLE,
  LIST_TD,
  TickBox,
  printedOn,
} from "@/components/print/print-kit";
import { PrintPage, PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { getShoppingFacts, getShoppingPricesFor } from "@/lib/kitchen-menu";
import { MEAL_PLAN_PATH } from "@/lib/recipe-copy";
import {
  shoppingPrint,
  type PricedPrintLine,
  type PrintShoppingLine,
} from "@/lib/shopping-print";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shopping list to print — Camp 404" };

// The shopping list on A4 (#249; the owner approved Option A of
// design/print-shopping.html, 2026-10-02), in the shared print shell with a
// real PDF. Only what is still to buy; a box on top names the dishes the list
// cannot count yet.
//
// Every approved member prints it, as every member reads the list. A captain
// or a Kitchen lead gets it by shop, each shop with its total to bring, and
// the total of all shops. Everyone else gets it by shop area with no shop and
// no price: their prices are null from getShoppingPricesFor, decided on the
// server, so no price is ever put in their page or their PDF.

const SHOPPING_PATH = "/kitchen/shopping";

function linesWord(n: number): string {
  return `${n} ${n === 1 ? "line" : "lines"}`;
}

function NotCounted({ dishes }: { dishes: readonly string[] }) {
  if (dishes.length === 0) return null;
  const one = dishes.length === 1;
  return (
    <p
      data-testid="not-counted"
      className="mb-3 border-[1.5px] border-neutral-900 px-[9px] py-1.5 text-[10.5px] leading-snug"
    >
      <b>Not on this list:</b> {dishes.join("; ")}.{" "}
      {one
        ? "It has no checked recipe for its plates yet, so its ingredients are not counted."
        : "They have no checked recipe for their plates yet, so their ingredients are not counted."}
    </p>
  );
}

function ShopBlock({
  shop,
  lines,
  totalCents,
}: {
  shop: string | null;
  lines: readonly PricedPrintLine[];
  totalCents: number;
}) {
  const showTotal = shop !== null || totalCents > 0;
  return (
    <table
      className={`${LIST_TABLE} mb-2.5 break-inside-avoid`}
      aria-label={shop ?? "No shop yet"}
      data-testid="shop-block"
    >
      <tbody>
        <GroupRow colSpan={4} aside={linesWord(lines.length)}>
          {shop ?? "No shop yet"}
        </GroupRow>
        {lines.map((line) => (
          <tr key={line.key} className="break-inside-avoid">
            <td className={`${LIST_TD} w-[18px]`}>
              <TickBox />
            </td>
            <td className={LIST_TD}>
              <span className="font-semibold">{line.name}</span>
              <span className="block text-[10px] text-neutral-600">
                {line.area}
              </span>
            </td>
            <td
              className={`${LIST_TD} w-[72px] whitespace-nowrap text-right tabular-nums`}
            >
              {line.amount}
            </td>
            <td
              className={`${LIST_TD} w-[84px] whitespace-nowrap text-right tabular-nums`}
            >
              {line.amountCents !== null ? formatMoney(line.amountCents) : ""}
            </td>
          </tr>
        ))}
        {showTotal && (
          <tr>
            <td className="px-[5px] pt-[5px]" />
            <td className="px-[5px] pt-[5px] text-[11px] font-semibold">
              Shop total
            </td>
            <td className="px-[5px] pt-[5px]" />
            <td className="whitespace-nowrap px-[5px] pt-[5px] text-right text-[11px] font-semibold tabular-nums">
              {formatMoney(totalCents)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function AreaBlock({
  label,
  lines,
}: {
  label: string;
  lines: readonly PrintShoppingLine[];
}) {
  return (
    <table
      className={`${LIST_TABLE} mb-2.5 break-inside-avoid`}
      aria-label={label}
      data-testid="area-block"
    >
      <tbody>
        <GroupRow colSpan={3}>{label}</GroupRow>
        {lines.map((line) => (
          <tr key={line.key} className="break-inside-avoid">
            <td className={`${LIST_TD} w-[18px]`}>
              <TickBox />
            </td>
            <td className={LIST_TD}>{line.name}</td>
            <td
              className={`${LIST_TD} w-[84px] whitespace-nowrap text-right tabular-nums`}
            >
              {line.amount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ShoppingListPrintPage() {
  const { campUser } = await captainPageGate("camp_member");
  const [facts, prices] = await Promise.all([
    getShoppingFacts(),
    getShoppingPricesFor(campUser.id),
  ]);
  const sheet = shoppingPrint(facts, prices);
  const withPrices = sheet.byShop !== null;

  const subtitle = [
    `From ${sheet.meals} ${sheet.meals === 1 ? "meal" : "meals"} on the menu`,
    `${linesWord(sheet.toBuy)} still to buy`,
    sheet.bought > 0
      ? `${sheet.bought} already bought ${sheet.bought === 1 ? "is" : "are"} left off`
      : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  const options = (
    <Link href={SHOPPING_PATH} className="underline">
      Back to the shopping list
    </Link>
  );

  return (
    <PrintSheet
      area="Kitchen"
      title="Shopping list"
      options={options}
      marginMm={12}
      paged
    >
      <PrintPage
        area="Kitchen"
        title="Shopping list"
        subtitle={subtitle}
        footer={
          withPrices
            ? "Captains and Kitchen leads only: this sheet shows prices."
            : "Kitchen"
        }
        footerEnd={`Printed ${printedOn(new Date())}`}
      >
        <NotCounted dishes={sheet.notCounted} />
        {sheet.toBuy === 0 ? (
          <p className="text-[12px]">
            {sheet.bought > 0 ? (
              "Everything on the list is bought."
            ) : (
              <>
                Nothing to buy yet. Put recipes on the{" "}
                <Link href={MEAL_PLAN_PATH} className="underline">
                  meal plan
                </Link>{" "}
                to fill the list.
              </>
            )}
          </p>
        ) : sheet.byShop ? (
          <>
            <div className="columns-2 gap-[22px]">
              {sheet.byShop.shops.map((s) => (
                <ShopBlock
                  key={s.shop ?? "no-shop"}
                  shop={s.shop}
                  lines={s.lines}
                  totalCents={s.totalCents}
                />
              ))}
            </div>
            <p
              data-testid="all-shops-total"
              className="mt-2.5 flex justify-between border-t-2 border-neutral-900 pt-1.5 text-[12px] font-semibold break-inside-avoid"
            >
              <span>
                To spend, all shops{sheet.estimate ? " (estimate)" : ""}
              </span>
              <span className="tabular-nums">
                {formatMoney(sheet.byShop.totalCents)}
              </span>
            </p>
          </>
        ) : (
          <div className="columns-2 gap-[22px]">
            {sheet.areas.map((a) => (
              <AreaBlock key={a.id} label={a.label} lines={a.lines} />
            ))}
          </div>
        )}
      </PrintPage>
    </PrintSheet>
  );
}

import Link from "next/link";
import { HandHelping, Info } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InventoryFrame } from "@/components/inventory/inventory-tabs";
import { ReturnLoanButton } from "@/components/inventory/item-actions";
import {
  GroupItem,
  GroupRow,
  InfoNote,
  InvCard,
  InvCardHeader,
  SubLine,
  TABLE,
  TD,
  TD_ACTION,
  TH,
} from "@/components/inventory/inventory-table";
import { PrintLink } from "@/components/inventory/print-link";
import { listInventoryLoans, type InventoryLoanRow } from "@/lib/inventory";
import {
  INVENTORY_PRINT_STRIKE_PATH,
  groupLoansByCamp,
  inventoryItemPath,
  shortDate,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lent out — Camp 404" };

// Gear lent to other camps (#246; redesign option A, owner 2026-10-01). There
// is no internet at the burn, so this is the list to PRINT before leaving:
// the strike checklist (A4) is ticked on paper at strike, and anything lent on
// site goes on its blank lines for a lead to type in after the burn. Still out
// first, grouped by the camp that has it (their camp and site address only,
// never a person), each row's one action "Mark returned" for a captain or the
// item's team lead. What came back this year sits below, quieter.

function lentBy(l: InventoryLoanRow): string {
  return `${l.lentByName ?? "A member"}, ${shortDate(l.lentAt)}`;
}

export default async function InventoryLoansPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const loans = await listInventoryLoans();
  const out = loans.filter((l) => l.returnedAt === null);
  const back = loans.filter((l) => l.returnedAt !== null);
  const camps = groupLoansByCamp(out);
  const things = out.reduce((sum, l) => sum + l.quantity, 0);
  // The action column only for someone who may mark one returned.
  const tools = out.some((l) => viewer.canEdit(l.team));

  const note = (
    <>
      <span className="hidden page-sm:inline">
        <b className="font-semibold">There is no internet at the burn.</b> Print
        the strike checklist before you leave and tick it off on paper at
        strike. Lend something on site? Write it on the blank lines of the
        sheet; a lead types it in after the burn.
      </span>
      {/* The mock-up's phone says it shorter. */}
      <span className="page-sm:hidden">
        <b className="font-semibold">No internet at the burn.</b> Print this
        before you leave and tick it off at strike. Write on-site loans on its
        blank lines.
      </span>
    </>
  );

  return (
    <InventoryFrame
      current="lent"
      actions={
        <PrintLink
          href={INVENTORY_PRINT_STRIKE_PATH}
          primary
          className="hidden page-sm:inline-flex"
        >
          Print strike checklist (A4)
        </PrintLink>
      }
    >
      <InfoNote icon={<Info />}>
        {note}
        <PrintLink
          href={INVENTORY_PRINT_STRIKE_PATH}
          primary
          className="mt-2 w-full page-sm:hidden"
        >
          Print strike checklist (A4)
        </PrintLink>
      </InfoNote>

      {loans.length === 0 ? (
        <EmptyState
          icon={<HandHelping />}
          title="Nothing lent out"
          description="Loans to other camps show here, with their camp and address. To lend something, open the item and press Lend out."
        />
      ) : (
        <div className="flex flex-col gap-5">
          <InvCard label="still-out">
            <InvCardHeader
              id="still-out"
              title="Still out"
              // The phone's list starts at its first camp (the mock-up).
              className={out.length > 0 ? "hidden page-md:flex" : undefined}
              aside={
                out.length === 0
                  ? "Everything is back"
                  : `${out.length === 1 ? "1 loan" : `${out.length} loans`} to ${
                      camps.length === 1 ? "1 camp" : `${camps.length} camps`
                    } · ${things === 1 ? "1 thing" : `${things} things`}`
              }
            />
            {out.length > 0 && (
              <>
                <div className="hidden page-md:block">
                  <table className={TABLE}>
                    <caption className="sr-only">Gear still out</caption>
                    <colgroup>
                      <col />
                      <col className="w-24" />
                      <col className="w-52" />
                      {tools && <col className="w-44" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={TH}>
                          Item
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          How many
                        </th>
                        <th scope="col" className={TH}>
                          Lent by
                        </th>
                        {tools && (
                          <th scope="col" className={`${TH} pl-0`}>
                            <span className="sr-only">Action</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    {camps.map((c) => (
                      <tbody key={c.key}>
                        <GroupRow
                          colSpan={tools ? 4 : 3}
                          title={c.camp}
                          aside={c.address}
                        />
                        {c.loans.map((l) => (
                          <tr key={l.id}>
                            <td className={TD}>
                              <Link
                                href={inventoryItemPath(l.itemId)}
                                title={l.itemName}
                                className="block truncate font-semibold underline-offset-4 hover:text-primary hover:underline"
                              >
                                {l.itemName}
                              </Link>
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>
                              {l.quantity}
                            </td>
                            <td className={`${TD} text-muted-foreground`}>
                              {lentBy(l)}
                            </td>
                            {tools && (
                              <td className={TD_ACTION}>
                                {viewer.canEdit(l.team) && (
                                  <ReturnLoanButton
                                    loanId={l.id}
                                    what={`${l.quantity} ${l.itemName} lent to ${l.borrowerCamp}`}
                                    className="w-full"
                                  />
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
                <ul className="page-md:hidden" aria-label="Gear still out">
                  {camps.map((c) => (
                    <li key={c.key}>
                      <ul>
                        <GroupItem title={c.camp} aside={c.address} />
                        {c.loans.map((l) => (
                          <li
                            key={l.id}
                            className="grid grid-cols-[1fr_8rem] items-center gap-3 border-t border-border px-4 py-3"
                          >
                            <span className="min-w-0">
                              <Link
                                href={inventoryItemPath(l.itemId)}
                                className="block truncate font-semibold"
                              >
                                {l.quantity} × {l.itemName}
                              </Link>
                              <SubLine>{lentBy(l)}</SubLine>
                            </span>
                            {viewer.canEdit(l.team) ? (
                              <ReturnLoanButton
                                loanId={l.id}
                                what={`${l.quantity} ${l.itemName} lent to ${l.borrowerCamp}`}
                                className="w-full"
                              />
                            ) : (
                              <span />
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </InvCard>

          {back.length > 0 && (
            <InvCard label="back-this-year">
              <InvCardHeader
                id="back-this-year"
                title="Back this year"
                aside={back.length === 1 ? "1 loan" : `${back.length} loans`}
              />
              <ul>
                {back.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border px-4 py-2.5 text-sm first:border-t-0"
                  >
                    <span className="min-w-0">
                      {l.quantity} × {l.itemName}{" "}
                      <span className="text-muted-foreground">
                        from {l.borrowerCamp}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Back {shortDate(l.returnedAt!)}
                    </span>
                  </li>
                ))}
              </ul>
            </InvCard>
          )}
        </div>
      )}
    </InventoryFrame>
  );
}

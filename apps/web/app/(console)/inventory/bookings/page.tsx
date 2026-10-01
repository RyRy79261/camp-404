import Link from "next/link";
import { Info, PackageCheck } from "lucide-react";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InventoryFrame } from "@/components/inventory/inventory-tabs";
import {
  BookButton,
  CancelBookingButton,
} from "@/components/inventory/item-actions";
import {
  ActionSlot,
  CountLine,
  InfoNote,
  InvCard,
  SubLine,
  TABLE,
  TD,
  TD_ACTION,
  TH,
} from "@/components/inventory/inventory-table";
import { PrintLink } from "@/components/inventory/print-link";
import { listBookableItems, type BookableItemRow } from "@/lib/inventory";
import {
  INVENTORY_PRINT_BOOKINGS_PATH,
  bookingState,
  inventoryItemPath,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bookings — Camp 404" };

// Camp gear members book for the burn (#246; redesign option A, owner
// 2026-10-01): a cooler box, a freezer shelf. A booking is one unit for the
// whole burn. What can be booked is the item's limit less what is lent to
// other camps, and nothing while it is broken (bookableNow; the write
// refuses the same). One table, one action slot per row: Book one, Cancel my
// booking, or the quiet reason there is nothing to press. Names are not on
// this page: a captain or the item's team lead sees who booked on the item's
// own page.

function Action({ i, phone = false }: { i: BookableItemRow; phone?: boolean }) {
  const s = bookingState(i);
  if (i.myBookingId) {
    return (
      <CancelBookingButton
        bookingId={i.myBookingId}
        // The phone's slot is 8rem: the mock-up's shorter words.
        text={phone ? "Cancel mine" : "Cancel my booking"}
        label={`Cancel my booking of ${i.name}`}
        className="w-full"
      />
    );
  }
  if (s.free === 0) return <ActionSlot>None free</ActionSlot>;
  if (s.left === 0) return <ActionSlot>Fully booked</ActionSlot>;
  return <BookButton itemId={i.itemId} name={i.name} className="w-full" />;
}

function YouHaveOne() {
  return (
    <span className="inline-block border border-primary bg-[var(--color-pick,var(--color-card))] px-2 py-px text-[11px] font-semibold whitespace-nowrap text-foreground">
      You have one
    </span>
  );
}

export default async function InventoryBookingsPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const items = await listBookableItems(viewer.userId);
  const mine = items.filter((i) => i.myBookingId !== null).length;
  const note = (
    <>
      <b className="font-semibold">A booking is one unit for the whole burn.</b>{" "}
      <span className="hidden page-sm:inline">
        Broken units and units lent to another camp can&apos;t be booked, so
        they are taken off first. Who booked what is on each item&apos;s page.
      </span>
      {/* The mock-up's phone says it in one line. */}
      <span className="page-sm:hidden">
        Broken and lent-out units can&apos;t be booked.
      </span>
    </>
  );

  return (
    <InventoryFrame
      current="bookings"
      actions={
        <PrintLink
          href={INVENTORY_PRINT_BOOKINGS_PATH}
          className="hidden page-sm:inline-flex"
        >
          Print bookings (A4)
        </PrintLink>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<PackageCheck />}
          title="Nothing to book yet"
          description="When a captain or a team lead sets how many members can book an item, it shows here."
        />
      ) : (
        <>
          <InfoNote icon={<Info />}>
            {note}
            <PrintLink
              href={INVENTORY_PRINT_BOOKINGS_PATH}
              className="mt-2 w-full page-sm:hidden"
            >
              Print bookings (A4)
            </PrintLink>
          </InfoNote>
          <CountLine className="hidden page-md:flex">
            {items.length === 1
              ? "1 bookable item"
              : `${items.length} bookable items`}{" "}
            · you have{" "}
            {mine === 0
              ? "no bookings"
              : mine === 1
                ? "1 booking"
                : `${mine} bookings`}
          </CountLine>
          <InvCard>
            <div className="hidden page-md:block">
              <table className={TABLE}>
                <caption className="sr-only">Gear to book</caption>
                <colgroup>
                  <col />
                  <col className="w-52" />
                  <col className="w-40" />
                  <col className="w-48" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Item
                    </th>
                    <th scope="col" className={TH}>
                      Can be booked
                    </th>
                    <th scope="col" className={TH}>
                      Booked
                    </th>
                    <th scope="col" className={`${TH} pl-0`}>
                      <span className="sr-only">Your booking</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const s = bookingState(i);
                    return (
                      <tr key={i.itemId}>
                        <td className={TD}>
                          <Link
                            href={inventoryItemPath(i.itemId)}
                            className="block truncate font-semibold underline-offset-4 hover:text-primary hover:underline"
                          >
                            {i.name}
                          </Link>
                          <SubLine>{viewer.teamLabel(i.team)}</SubLine>
                        </td>
                        <td className={TD}>
                          <span className="tabular-nums">
                            {s.free} of {i.quantity}
                          </span>
                          <SubLine>{s.why}</SubLine>
                        </td>
                        <td className={TD}>
                          <span
                            className={`tabular-nums ${s.free === 0 && i.booked === 0 ? "text-muted-foreground" : ""}`}
                          >
                            {s.free === 0 && i.booked === 0
                              ? "None"
                              : `${i.booked} of ${s.free}`}
                          </span>
                          <SubLine>
                            {i.myBookingId ? <YouHaveOne /> : s.after}
                          </SubLine>
                        </td>
                        <td className={TD_ACTION}>
                          <Action i={i} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="page-md:hidden" aria-label="Gear to book">
              {items.map((i) => {
                const s = bookingState(i);
                return (
                  <li
                    key={i.itemId}
                    className="grid grid-cols-[1fr_8rem] items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                  >
                    <span className="min-w-0">
                      <Link
                        href={inventoryItemPath(i.itemId)}
                        className="block truncate font-semibold"
                      >
                        {i.name}
                      </Link>
                      <SubLine
                        className={
                          i.myBookingId
                            ? "flex flex-wrap items-center gap-1 whitespace-normal"
                            : undefined
                        }
                      >
                        {i.myBookingId ? (
                          <>
                            {i.booked} of {s.free} booked ·
                            <YouHaveOne />
                          </>
                        ) : s.free === 0 ? (
                          s.why.replaceAll(" · ", ", ")
                        ) : s.left > 0 ? (
                          `${s.left} left${s.why === "All usable" ? "" : ` · ${s.why.replaceAll(" · ", ", ")}`}`
                        ) : (
                          `${i.booked} of ${s.free} booked`
                        )}
                      </SubLine>
                    </span>
                    <Action i={i} phone />
                  </li>
                );
              })}
            </ul>
          </InvCard>
        </>
      )}
    </InventoryFrame>
  );
}

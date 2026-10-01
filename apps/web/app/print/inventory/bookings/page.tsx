import Link from "next/link";
import { PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { listBookableItems, listItemBookings } from "@/lib/inventory";
import {
  INVENTORY_BOOKINGS_PATH,
  bookingState,
  dateText,
} from "@/lib/inventory-copy";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { printName } from "@/lib/lounge-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bookings to print — Camp 404" };

// Bookings on paper (#246 redesign, option A, owner 2026-10-01), in the shared
// A4 print shell (#249): each bookable item, how many can be booked and who
// has one, to hand out the gear at build where there is no internet. The
// same rule as the screen: a booking names its member only to a captain or a
// lead of the item's team (and the member's own to them); anyone else's
// sheet shows how many, never who.

export default async function BookingsPrintPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const items = await listBookableItems(viewer.userId);
  const rows = await Promise.all(
    items.map(async (i) => ({
      item: i,
      state: bookingState(i),
      bookings: await listItemBookings(
        i.itemId,
        viewer.userId,
        viewer.canEdit(i.team),
      ),
    })),
  );
  const box = <span className="inline-block size-5 border border-black" />;

  return (
    <PrintSheet
      area="Inventory"
      title="Bookings"
      subtitle={`Printed ${dateText(new Date())}. A booking is one unit for the whole burn. Tick when it is handed over.`}
      options={
        <Link href={INVENTORY_BOOKINGS_PATH} className="underline">
          Back to Bookings
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p>Nothing can be booked yet.</p>
      ) : (
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-2">Item</th>
              <th className="w-28 py-2 text-right">Booked</th>
              <th className="w-72 py-2 pl-4">Who has one</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, state, bookings }) => {
              const named = bookings.filter((b) => b.displayName);
              const hidden = bookings.length - named.length;
              return (
                <tr
                  key={item.itemId}
                  data-testid="print-booking-row"
                  className="border-b border-black/40 align-top"
                >
                  <td className="py-2">
                    {item.name}
                    <span className="block text-sm text-neutral-700">
                      {viewer.teamLabel(item.team)} · {state.free} of{" "}
                      {item.quantity} can be booked ({state.why.toLowerCase()})
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {bookings.length} of {state.free}
                  </td>
                  <td className="py-2 pl-4">
                    {named.length === 0 && hidden === 0 ? (
                      "Nobody yet"
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {named.map((b) => (
                          <li key={b.id} className="flex items-center gap-2">
                            {box}
                            {printName(b.displayName ?? "Camp member")}
                          </li>
                        ))}
                        {hidden > 0 && (
                          <li className="text-sm text-neutral-700">
                            {hidden === 1
                              ? "1 other member"
                              : `${hidden} other members`}
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PrintSheet>
  );
}

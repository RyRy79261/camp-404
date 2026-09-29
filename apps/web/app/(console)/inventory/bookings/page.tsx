import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { bookingsLeft } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import {
  BookButton,
  CancelBookingButton,
} from "@/components/inventory/item-actions";
import { listBookableItems, type BookableItemRow } from "@/lib/inventory";
import { inventoryItemPath } from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bookings — Camp 404" };

// Camp gear members book for the burn (#246): a cooler box, a freezer shelf.
// Each item takes a set number of bookings a year; the write refuses one past
// it. Names are not on this page: a captain or the item's team lead sees who
// booked on the item's own page.

export default async function InventoryBookingsPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const items = await listBookableItems(viewer.userId);

  const columns: ResponsiveColumn<BookableItemRow>[] = [
    {
      id: "name",
      header: "Item",
      role: "title",
      cellClassName: "font-medium",
      cell: (i) => (
        <Link
          href={inventoryItemPath(i.itemId)}
          className="underline-offset-4 hover:underline"
        >
          {i.name}
        </Link>
      ),
    },
    {
      id: "left",
      header: "Left",
      role: "badge",
      cell: (i) => {
        const left = bookingsLeft(i.bookableCount, i.booked);
        return i.myBookingId ? (
          <Badge variant="success">Booked by you</Badge>
        ) : left === 0 ? (
          <Badge variant="outline">Fully booked</Badge>
        ) : (
          <Badge variant="default">{left} left</Badge>
        );
      },
    },
    {
      id: "booked",
      header: "Booked",
      cellClassName: "tabular-nums text-muted-foreground",
      cell: (i) => `${i.booked} of ${i.bookableCount}`,
    },
    {
      id: "team",
      header: "Team",
      cellClassName: "text-muted-foreground",
      cell: (i) => viewer.teamLabel(i.team),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (i) =>
        i.myBookingId ? (
          <CancelBookingButton
            bookingId={i.myBookingId}
            label={`Cancel my booking of ${i.name}`}
          />
        ) : (
          <BookButton
            itemId={i.itemId}
            name={i.name}
            disabled={bookingsLeft(i.bookableCount, i.booked) === 0}
          />
        ),
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp gear"
        title="Bookings"
        description="Camp gear you can book for the burn this year. Each item has a limit; when it's full, it's full."
      />
      <InventoryTabs current="bookings" />
      {items.length === 0 ? (
        <EmptyState
          icon={<PackageCheck />}
          title="Nothing to book yet"
          description="When a captain or a team lead sets how many can book an item, it shows here."
        />
      ) : (
        <div className="page-md:rounded-xl page-md:border page-md:bg-card page-md:text-card-foreground page-md:shadow-sm">
          <ResponsiveDataTable
            columns={columns}
            data={items}
            getRowKey={(i) => i.itemId}
            label="Gear to book"
          />
        </div>
      )}
    </div>
  );
}

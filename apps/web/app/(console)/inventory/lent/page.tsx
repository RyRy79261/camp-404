import Link from "next/link";
import { HandHelping } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import { ReturnLoanButton } from "@/components/inventory/item-actions";
import { listInventoryLoans, type InventoryLoanRow } from "@/lib/inventory";
import { dateText, inventoryItemPath } from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lent out — Camp 404" };

// Gear lent to other camps this year (#246), still out first: the list to walk
// at strike. A loan names the other camp and its site address only, never a
// person. A captain or the item's team lead logs a loan from the item's page
// and marks it returned here.

export default async function InventoryLoansPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const loans = await listInventoryLoans();
  const out = loans.filter((l) => l.returnedAt === null).length;

  const columns: ResponsiveColumn<InventoryLoanRow>[] = [
    {
      id: "item",
      header: "Item",
      role: "title",
      cellClassName: "font-medium",
      cell: (l) => (
        <Link
          href={inventoryItemPath(l.itemId)}
          className="underline-offset-4 hover:underline"
        >
          {l.quantity} × {l.itemName}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      role: "badge",
      cell: (l) =>
        l.returnedAt ? (
          <Badge variant="success">Back</Badge>
        ) : (
          <Badge variant="warning">Still out</Badge>
        ),
    },
    { id: "camp", header: "Camp", cell: (l) => l.borrowerCamp },
    {
      id: "address",
      header: "Their address",
      cellClassName: "text-muted-foreground",
      cell: (l) => l.borrowerAddress,
    },
    {
      id: "when",
      header: "Lent",
      cellClassName: "whitespace-nowrap text-muted-foreground",
      cell: (l) =>
        `${dateText(l.lentAt)}${l.returnedAt ? ` · back ${dateText(l.returnedAt)}` : ""}`,
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (l) =>
        l.returnedAt === null && viewer.canEdit(l.team) ? (
          <ReturnLoanButton
            loanId={l.id}
            what={`${l.quantity} ${l.itemName} lent to ${l.borrowerCamp}`}
          />
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp gear"
        title="Lent out"
        description="Gear lent to other camps this year, still out first. Walk this list at strike. To log a loan, open the item and press Lend out."
      />
      <InventoryTabs current="lent" />
      {loans.length === 0 ? (
        <EmptyState
          icon={<HandHelping />}
          title="Nothing lent out"
          description="Loans to other camps show here, with their camp and address."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {out} still out · {loans.length - out} back
          </p>
          <ResponsiveDataTable
            columns={columns}
            data={loans}
            getRowKey={(l) => l.id}
            label="Gear lent out"
            framed
          />
        </div>
      )}
    </div>
  );
}

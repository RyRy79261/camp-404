import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { stillNeeded } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import {
  AddNeedButton,
  NeedRowActions,
  PledgeButton,
  WithdrawPledgeButton,
} from "@/components/inventory/need-controls";
import {
  listInventoryItems,
  listInventoryNeeds,
  type InventoryNeedRow,
} from "@/lib/inventory";
import { inventoryItemPath } from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Needs this year — Camp 404" };

// What each team needs at the burn this year, against what the camp has
// (#246): still needed = need − the camp's own item − bought − pledged. A
// captain or a lead of the team keeps its list; any member pledges to bring
// some, and every member sees the pledges by name under the need.

const REFUSAL_ID = "inventory-needs-refusal";

type Row = InventoryNeedRow & { pledged: number; still: number };

export default async function InventoryNeedsPage() {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const canAdd = viewer.editableTeams.length > 0;
  const [needs, items] = await Promise.all([
    listInventoryNeeds(),
    canAdd ? listInventoryItems() : Promise.resolve([]),
  ]);
  const itemOptions = items.map((i) => ({ value: i.id, label: i.name }));

  const rows: Row[] = needs.map((n) => {
    const pledged = n.pledges.reduce((sum, p) => sum + p.quantity, 0);
    return {
      ...n,
      pledged,
      still: stillNeeded({
        quantity: n.quantity,
        have: n.have,
        bought: n.boughtQuantity,
        pledged,
      }),
    };
  });
  const teams = [...new Set(rows.map((r) => r.team))];

  const columns: ResponsiveColumn<Row>[] = [
    {
      id: "name",
      header: "Need",
      role: "title",
      cellClassName: "font-medium",
      cell: (n) => (
        <span className="flex flex-col">
          <span>{n.name}</span>
          {n.itemId && n.itemName && (
            <Link
              href={inventoryItemPath(n.itemId)}
              className="text-xs font-normal text-muted-foreground underline-offset-4 hover:underline"
            >
              Camp item: {n.itemName}
            </Link>
          )}
          {n.note && (
            <span className="text-xs font-normal text-muted-foreground">
              {n.note}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "still",
      header: "Still needed",
      role: "badge",
      cell: (n) =>
        n.still === 0 ? (
          <Badge variant="success">Covered</Badge>
        ) : (
          <Badge variant="warning">{n.still} to find</Badge>
        ),
    },
    {
      id: "needed",
      header: "Needed",
      align: "right",
      cellClassName: "tabular-nums",
      cell: (n) => n.quantity,
    },
    {
      id: "have",
      header: "Camp has",
      align: "right",
      cellClassName: "tabular-nums text-muted-foreground",
      cell: (n) => n.have,
    },
    {
      id: "bought",
      header: "Bought",
      align: "right",
      cellClassName: "tabular-nums text-muted-foreground",
      cell: (n) => n.boughtQuantity,
    },
    {
      id: "pledges",
      header: "Pledged",
      cell: (n) =>
        n.pledges.length === 0 ? (
          <span className="text-muted-foreground">None yet</span>
        ) : (
          <ul className="flex flex-col text-sm">
            {n.pledges.map((p) => (
              <li key={p.userId}>
                {p.userId === viewer.userId ? "You" : p.displayName}:{" "}
                <span className="tabular-nums">{p.quantity}</span>
                {p.note && (
                  <span className="text-muted-foreground"> · {p.note}</span>
                )}
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      // One main button (pledge) in the same place on every row; taking a
      // pledge back, Edit and Remove are quiet icons in a slot that keeps its
      // width on every row of the team's table.
      cell: (n) => {
        const mine = n.pledges.find((p) => p.userId === viewer.userId) ?? null;
        const edits = viewer.canEdit(n.team);
        return (
          <RowActions
            label={`Actions for ${n.name}`}
            primary={<PledgeButton needId={n.id} name={n.name} mine={mine} />}
            secondarySlots={edits ? 3 : 1}
            secondary={
              <>
                {mine && <WithdrawPledgeButton needId={n.id} name={n.name} />}
                {edits && (
                  <NeedRowActions
                    need={{
                      id: n.id,
                      version: n.version,
                      team: n.team,
                      name: n.name,
                      quantity: n.quantity,
                      itemId: n.itemId,
                      boughtQuantity: n.boughtQuantity,
                      note: n.note,
                    }}
                    teams={viewer.editableTeams}
                    items={itemOptions}
                  />
                )}
              </>
            }
          />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp gear"
        title="Needs this year"
        description="What each team needs at the burn, what the camp already has, and who is bringing the rest. Pledge to bring something; captains and each team's leads keep their team's list."
        actions={
          canAdd ? (
            <AddNeedButton
              teams={viewer.editableTeams}
              items={itemOptions}
              refusalId={REFUSAL_ID}
            />
          ) : undefined
        }
      />
      <InventoryTabs current="needs" />

      <div className="flex flex-col gap-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="No needs yet this year"
            description="When a team lists what it needs, it shows here and members can pledge to bring it."
          />
        ) : (
          teams.map((team) => (
            <section
              key={team}
              aria-labelledby={`needs-${team}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`needs-${team}`} className="text-base font-semibold">
                {viewer.teamLabel(team)}
              </h2>
              <ResponsiveDataTable
                columns={columns}
                data={rows.filter((r) => r.team === team)}
                getRowKey={(r) => r.id}
                label={`${viewer.teamLabel(team)} needs`}
                framed
              />
            </section>
          ))
        )}
      </div>
    </div>
  );
}

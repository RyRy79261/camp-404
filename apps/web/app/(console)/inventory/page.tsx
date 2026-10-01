import Link from "next/link";
import { Boxes, Lock, Search, Wrench } from "lucide-react";
import { maintenanceDue } from "@camp404/core";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
  type InventoryCondition,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { Input } from "@camp404/ui/components/input";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import { AddItemButton } from "@/components/inventory/item-dialog";
import { ReviewButtons } from "@/components/inventory/item-actions";
import { NativeSelect } from "@/components/inventory/native-select";
import {
  listInventoryItems,
  listPendingProposals,
  type InventoryItemRow,
} from "@/lib/inventory";
import {
  ADD_REFUSAL,
  CATEGORY_LABELS,
  CONDITION_LABELS,
  INVENTORY_PATH,
  LOCATION_LABELS,
  countText,
  inventoryItemPath,
  whereText,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inventory — Camp 404" };

// The camp's gear (#246). Every approved member reads it and may suggest a
// change; a captain or a lead of the item's team changes it. Composed from
// AfrikaBurn's categories screen (the table in a card, Add opening a dialog)
// with the roster's filter strip above it. The filters are a plain GET form,
// so the list stays a server render and a filtered view is a link.

const REFUSAL_ID = "inventory-add-refusal";

const CONDITION_BADGE: Record<
  InventoryCondition,
  "success" | "warning" | "destructive"
> = {
  good: "success",
  needs_repair: "warning",
  broken: "destructive",
};

type Filters = {
  q: string;
  team: string;
  location: string;
  condition: string;
  maintenance: string;
};

function pick(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

/** One labelled choice in the folded filter strip. */
function FilterSelect({
  name,
  label,
  placeholder,
  options,
  value,
}: {
  name: string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <NativeSelect
        name={name}
        aria-label={label}
        placeholder={placeholder}
        options={options}
        defaultValue={value}
      />
    </label>
  );
}

function matches(item: InventoryItemRow, f: Filters, now: Date): boolean {
  if (f.q) {
    const hay = `${item.name} ${item.details ?? ""} ${item.storageLocation ?? ""}`;
    if (!hay.toLowerCase().includes(f.q.toLowerCase())) return false;
  }
  if (f.team && item.team !== f.team) return false;
  if (f.location && item.location !== f.location) return false;
  if (f.condition && item.condition !== f.condition) return false;
  if (f.maintenance === "due" && !maintenanceDue(item, now)) return false;
  return true;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const params = await searchParams;
  const filters: Filters = {
    q: pick(params.q),
    team: pick(params.team),
    location: pick(params.location),
    condition: pick(params.condition),
    maintenance: pick(params.maintenance),
  };
  const canAdd = viewer.editableTeams.length > 0;

  const [items, pending, members] = await Promise.all([
    listInventoryItems(),
    listPendingProposals(),
    // Only an editor picks a custodian in the Add dialog.
    canAdd ? listAssignableMembers() : Promise.resolve([]),
  ]);
  const now = new Date();
  const shown = items.filter((item) => matches(item, filters, now));
  const filtered = Object.values(filters).some(Boolean);
  const narrowed = [
    filters.team,
    filters.location,
    filters.condition,
    filters.maintenance,
  ].filter(Boolean).length;
  // Proposals this viewer may decide; everyone else sees only a count.
  const reviewable = pending.filter((p) => viewer.canEdit(p.team));

  const teamOptions = [...new Set(items.map((i) => i.team))]
    .map((team) => ({ value: team, label: viewer.teamLabel(team) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const columns: ResponsiveColumn<InventoryItemRow>[] = [
    {
      id: "name",
      header: "Item",
      role: "title",
      cellClassName: "font-medium",
      cell: (i) => (
        <Link
          href={inventoryItemPath(i.id)}
          className="underline-offset-4 hover:underline"
        >
          {i.name}
        </Link>
      ),
    },
    {
      id: "condition",
      header: "Condition",
      role: "badge",
      cell: (i) => (
        <Badge variant={CONDITION_BADGE[i.condition]}>
          {CONDITION_LABELS[i.condition]}
        </Badge>
      ),
    },
    {
      id: "count",
      header: "How many",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (i) => countText(i.quantity, i.unit),
    },
    {
      id: "team",
      header: "Team",
      cellClassName: "text-muted-foreground",
      cell: (i) => viewer.teamLabel(i.team),
    },
    {
      id: "where",
      header: "Where",
      cellClassName: "text-muted-foreground",
      cell: (i) => whereText(i),
    },
    {
      id: "maintenance",
      header: "Maintenance",
      cell: (i) =>
        maintenanceDue(i, now) ? (
          <span className="inline-flex items-center gap-1 text-warning">
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            Due
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const groups = INVENTORY_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp gear"
        title="Inventory"
        description="Everything the camp owns, where it is and what state it's in. Everyone can read it and suggest a change. Captains and each team's leads change their team's gear."
        actions={
          <AddItemButton
            teams={viewer.editableTeams}
            members={members.map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            refusalId={REFUSAL_ID}
          />
        }
      />
      <InventoryTabs current="items" />

      <div className="flex flex-col gap-6">
        {!canAdd && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {ADD_REFUSAL} Open an item to suggest a change.
          </p>
        )}

        {reviewable.length > 0 && (
          <section
            aria-labelledby="to-review"
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <h2 id="to-review" className="text-base font-semibold">
              Suggested changes to review
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {reviewable.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 py-3 page-sm:flex-row page-sm:items-center page-sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <Link
                      href={inventoryItemPath(p.itemId ?? "")}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {p.itemName}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {p.proposedByName ?? "A member"} says {p.quantity}
                      {p.condition
                        ? `, ${CONDITION_LABELS[p.condition].toLowerCase()}`
                        : ""}
                      {p.location
                        ? `, ${whereText({
                            location: p.location,
                            custodianName: p.custodianName,
                            storageLocation: p.storageLocation,
                          }).toLowerCase()}`
                        : ""}
                      {p.maintenancePerformedAt ? ", maintenance done" : ""}
                    </span>
                    {p.note && (
                      <p className="text-xs text-muted-foreground">
                        &ldquo;{p.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <ReviewButtons
                    updateId={p.id}
                    what={`${p.itemName}: ${p.quantity}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {reviewable.length === 0 && pending.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {pending.length} suggested change{pending.length === 1 ? "" : "s"}{" "}
            waiting for a captain or a team lead.
          </p>
        )}

        <form
          method="get"
          action={INVENTORY_PATH}
          role="search"
          aria-label="Filter the gear"
          className="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <Input
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Search the gear"
              aria-label="Search the gear"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline">
              <Search aria-hidden />
              Filter
            </Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href={INVENTORY_PATH}>Clear</Link>
              </Button>
            )}
          </div>
          {/* The four narrowing choices fold away, so the list stays in
              view; they open by themselves when one is in use. */}
          <details
            open={narrowed > 0 || undefined}
            className="group rounded-lg border border-border bg-card/40 px-3 py-2 text-sm"
          >
            <summary className="cursor-pointer select-none text-sm text-muted-foreground">
              More filters{narrowed ? ` (${narrowed})` : ""}
            </summary>
            <div className="mt-3 grid gap-3 page-sm:grid-cols-2 page-lg:grid-cols-4">
              <FilterSelect
                name="team"
                label="Team"
                placeholder="All teams"
                options={teamOptions}
                value={filters.team}
              />
              <FilterSelect
                name="location"
                label="Where"
                placeholder="Anywhere"
                options={INVENTORY_LOCATIONS.map((v) => ({
                  value: v,
                  label: LOCATION_LABELS[v],
                }))}
                value={filters.location}
              />
              <FilterSelect
                name="condition"
                label="Condition"
                placeholder="Any"
                options={INVENTORY_CONDITIONS.map((v) => ({
                  value: v,
                  label: CONDITION_LABELS[v],
                }))}
                value={filters.condition}
              />
              <FilterSelect
                name="maintenance"
                label="Maintenance"
                placeholder="Any"
                options={[{ value: "due", label: "Needs maintenance" }]}
                value={filters.maintenance}
              />
            </div>
          </details>
        </form>

        {items.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title="No gear yet"
            description={
              canAdd
                ? "Add what the camp owns: cooler boxes, gazebos, pots, tools."
                : "Nothing has been added yet. A captain or a team lead adds the camp's gear."
            }
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Nothing matches"
            description="Try another search, or clear the filters."
          />
        ) : (
          groups.map((g) => (
            <section
              key={g.category}
              aria-labelledby={`cat-${g.category}`}
              className="flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2
                  id={`cat-${g.category}`}
                  className="text-base font-semibold"
                >
                  {CATEGORY_LABELS[g.category]}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {g.items.length} item{g.items.length === 1 ? "" : "s"}
                </p>
              </div>
              <ResponsiveDataTable
                columns={columns}
                data={g.items}
                getRowKey={(i) => i.id}
                label={CATEGORY_LABELS[g.category]}
                framed
              />
            </section>
          ))
        )}
      </div>
    </div>
  );
}

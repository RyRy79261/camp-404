import Link from "next/link";
import { Boxes, ChevronRight, Search } from "lucide-react";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
} from "@camp404/types";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { GearFilters } from "@/components/inventory/gear-filters";
import { AddItemButton } from "@/components/inventory/item-dialog";
import { ReviewButtons } from "@/components/inventory/item-actions";
import { InventoryFrame } from "@/components/inventory/inventory-tabs";
import {
  CountLine,
  GroupItem,
  GroupRow,
  InvCard,
  InvCardHeader,
  StatusText,
  SubLine,
  TABLE,
  TD,
  TH,
} from "@/components/inventory/inventory-table";
import { SuggestionDiff } from "@/components/inventory/suggestion-diff";
import {
  listInventoryItems,
  listPendingProposals,
  type InventoryItemRow,
} from "@/lib/inventory";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  INVENTORY_PATH,
  LOCATION_LABELS,
  countText,
  inventoryItemPath,
  maintenanceNote,
  shortDate,
  suggestionDiff,
  whereText,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inventory — Camp 404" };

// The camp's gear (#246; redesign option A, owner 2026-10-01). Every approved
// member reads it and may suggest a change on an item's page; a captain or a
// lead of the item's team changes it. AfrikaBurn's Registrations list: the
// changes waiting for this viewer's review first, then a filter strip, a
// count line and ONE table with the category as a header row inside it, so
// the columns line up down the page. Condition and maintenance say something
// only when something needs doing.

type Filters = {
  q: string;
  team: string;
  location: string;
  condition: string;
};

function pick(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function matches(item: InventoryItemRow, f: Filters): boolean {
  if (f.q) {
    const hay = `${item.name} ${item.details ?? ""} ${item.storageLocation ?? ""}`;
    if (!hay.toLowerCase().includes(f.q.toLowerCase())) return false;
  }
  if (f.team && item.team !== f.team) return false;
  if (f.location && item.location !== f.location) return false;
  if (f.condition && item.condition !== f.condition) return false;
  return true;
}

/** The quiet line under an item's name: its team and one useful fact. */
function factLine(item: InventoryItemRow, team: string): string {
  const parts = [team];
  if (item.bookableCount !== null) {
    parts.push(`${item.bookableCount} can be booked`);
  } else if (item.wattsEach !== null) {
    parts.push(`${item.wattsEach} W`);
  } else if (item.weightKg !== null) {
    parts.push(`${item.weightKg} kg`);
  }
  return parts.join(" · ");
}

function Condition({ item }: { item: InventoryItemRow }) {
  if (item.condition === "good") return null;
  return (
    <StatusText tone={item.condition === "broken" ? "bad" : "warn"}>
      {CONDITION_LABELS[item.condition]}
    </StatusText>
  );
}

function Maintenance({ item, now }: { item: InventoryItemRow; now: Date }) {
  const note = maintenanceNote(item, now);
  if (!note) return null;
  return note.due ? (
    <StatusText tone="warn">{note.text}</StatusText>
  ) : (
    <span className="text-muted-foreground">{note.text}</span>
  );
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
  };
  const canAdd = viewer.editableTeams.length > 0;

  const [items, pending, members] = await Promise.all([
    listInventoryItems(),
    listPendingProposals(),
    // Only an editor picks a custodian in the Add dialog.
    canAdd ? listAssignableMembers() : Promise.resolve([]),
  ]);
  const now = new Date();
  const shown = items.filter((item) => matches(item, filters));
  const byId = new Map(items.map((i) => [i.id, i]));
  // Only the changes this viewer may decide; a member sees theirs on the
  // item's own page.
  const reviewable = pending.filter((p) => viewer.canEdit(p.team));

  const reviewTitle =
    reviewable.length === 1
      ? "1 change to review"
      : `${reviewable.length} changes to review`;
  const reviewList = (
    <ul>
      {reviewable.map((p) => {
        const item = p.itemId ? byId.get(p.itemId) : undefined;
        return (
          <li
            key={p.id}
            className="grid gap-3 border-t border-border px-4 py-3 first:border-t-0 page-md:grid-cols-[12rem_1fr_11.5rem] page-md:items-center page-md:gap-4"
          >
            <div className="min-w-0">
              <Link
                href={inventoryItemPath(p.itemId ?? "")}
                className="block truncate font-semibold underline-offset-4 hover:text-primary hover:underline"
              >
                {p.itemName}
              </Link>
              <SubLine>
                {p.proposedByName ?? "A member"} · {shortDate(p.createdAt)}
              </SubLine>
            </div>
            <div className="min-w-0">
              {item && (
                <SuggestionDiff
                  fields={suggestionDiff(item, p)}
                  note={p.note}
                />
              )}
            </div>
            <ReviewButtons
              updateId={p.id}
              what={`the change to ${p.itemName}`}
            />
          </li>
        );
      })}
    </ul>
  );

  const teamOptions = [...new Set(items.map((i) => i.team))]
    .map((team) => ({ value: team, label: viewer.teamLabel(team) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const groups = INVENTORY_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <InventoryFrame
      current="items"
      actions={
        canAdd ? (
          <AddItemButton
            teams={viewer.editableTeams}
            members={members.map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
          />
        ) : undefined
      }
    >
      {reviewable.length > 0 && (
        <InvCard label="to-review" className="mb-5 hidden page-md:block">
          <InvCardHeader
            id="to-review"
            title={reviewTitle}
            aside="Suggested by members after a count"
          />
          {reviewList}
        </InvCard>
      )}

      <GearFilters
        action={INVENTORY_PATH}
        values={filters}
        teams={teamOptions}
        conditions={INVENTORY_CONDITIONS.map((v) => ({
          value: v,
          label: CONDITION_LABELS[v],
        }))}
        locations={INVENTORY_LOCATIONS.map((v) => ({
          value: v,
          label: LOCATION_LABELS[v],
        }))}
      />
      {/* On a phone the review box folds to one line under the search that
          opens it (the mock-up's phone), so the gear stays near the top. */}
      {reviewable.length > 0 && (
        <details className="group mb-4 page-md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border border-[var(--color-choice-edge,var(--color-border))] bg-[var(--color-choice,var(--color-card))] px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span id="to-review-phone">{reviewTitle}</span>
            <ChevronRight
              aria-hidden
              className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
            />
          </summary>
          <InvCard label="to-review-phone" className="border-t-0">
            {reviewList}
          </InvCard>
        </details>
      )}

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
        <>
          <CountLine
            className="hidden page-md:flex"
            aside={
              <span>
                Condition and maintenance show only when something needs doing
              </span>
            }
          >
            {shown.length === 1 ? "1 item" : `${shown.length} items`} in{" "}
            {groups.length === 1 ? "1 group" : `${groups.length} groups`}
          </CountLine>
          <InvCard>
            <div className="hidden page-md:block">
              <table className={TABLE}>
                <caption className="sr-only">The camp&apos;s gear</caption>
                <colgroup>
                  <col />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="w-52" />
                  <col className="w-32" />
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
                      Condition
                    </th>
                    <th scope="col" className={TH}>
                      Where
                    </th>
                    <th scope="col" className={TH}>
                      Maintenance
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.category}>
                    <GroupRow
                      colSpan={5}
                      title={CATEGORY_LABELS[g.category]}
                      aside={
                        g.items.length === 1
                          ? "1 item"
                          : `${g.items.length} items`
                      }
                    />
                    {g.items.map((i) => (
                      <tr
                        key={i.id}
                        className="hover:bg-[color-mix(in_oklab,var(--color-card)_88%,var(--color-foreground))]"
                      >
                        <td className={TD}>
                          <Link
                            href={inventoryItemPath(i.id)}
                            className="block truncate font-semibold underline-offset-4 hover:text-primary hover:underline"
                          >
                            {i.name}
                          </Link>
                          <SubLine>
                            {factLine(i, viewer.teamLabel(i.team))}
                          </SubLine>
                        </td>
                        <td
                          className={`${TD} text-right whitespace-nowrap tabular-nums`}
                        >
                          {countText(i.quantity, i.unit)}
                        </td>
                        <td className={TD}>
                          <Condition item={i} />
                        </td>
                        <td className={`${TD} truncate text-muted-foreground`}>
                          {whereText(i)}
                        </td>
                        <td className={TD}>
                          <Maintenance item={i} now={now} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            <ul className="page-md:hidden" aria-label="The camp's gear">
              {groups.map((g) => (
                <li key={g.category}>
                  <ul>
                    <GroupItem title={CATEGORY_LABELS[g.category]} />
                    {g.items.map((i) => {
                      const note = maintenanceNote(i, now);
                      return (
                        <li key={i.id} className="border-t border-border">
                          <Link
                            href={inventoryItemPath(i.id)}
                            className="grid grid-cols-[1fr_auto_0.75rem] items-center gap-x-3 gap-y-0.5 px-4 py-3"
                          >
                            <span className="truncate font-semibold">
                              {i.name}
                            </span>
                            <span className="text-xs whitespace-nowrap tabular-nums">
                              {countText(i.quantity, i.unit)}
                            </span>
                            <ChevronRight
                              aria-hidden
                              className="row-span-2 size-4 text-muted-foreground"
                            />
                            <span className="col-span-2 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <Condition item={i} />
                              {i.condition !== "good" && <span>·</span>}
                              <span className="truncate">
                                {whereText(i)} · {viewer.teamLabel(i.team)}
                                {note
                                  ? ` · maintenance ${note.text.charAt(0).toLowerCase()}${note.text.slice(1)}`
                                  : ""}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </InvCard>
        </>
      )}
    </InventoryFrame>
  );
}

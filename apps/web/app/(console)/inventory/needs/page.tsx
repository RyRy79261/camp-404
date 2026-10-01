import Link from "next/link";
import { Check, ClipboardList } from "lucide-react";
import { stillNeeded } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { SelectFilters } from "@/components/inventory/gear-filters";
import { InventoryFrame } from "@/components/inventory/inventory-tabs";
import {
  ActionSlot,
  CountLine,
  GroupItem,
  GroupRow,
  InvCard,
  Meter,
  SubLine,
  TABLE,
  TD,
  TD_ACTION,
  TD_MENU,
  TH,
} from "@/components/inventory/inventory-table";
import {
  AddNeedButton,
  NeedRowActions,
  PledgeButton,
} from "@/components/inventory/need-controls";
import { PrintLink } from "@/components/inventory/print-link";
import {
  listInventoryItems,
  listInventoryNeeds,
  type InventoryNeedRow,
} from "@/lib/inventory";
import {
  INVENTORY_NEEDS_PATH,
  INVENTORY_PRINT_NEEDS_PATH,
  inventoryItemPath,
} from "@/lib/inventory-copy";
import { Team } from "@camp404/types";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer, type InventoryViewer } from "@/lib/inventory-viewer";
import { listTeamPeople } from "@/lib/roster";

export const dynamic = "force-dynamic";

export const metadata = { title: "Needs this year — Camp 404" };

// What each team needs at the burn this year, against what the camp has
// (#246; redesign option A, owner 2026-10-01): still to find = need − the
// camp's own item − bought − pledged. One table, the teams as header rows in
// the camp's own team order. Every row has ONE button in the same slot:
// "Pledge", "Edit my pledge" once you have, or a quiet "Covered" when nothing
// is left to find. A captain or a lead of the team keeps its list through the
// "···" in its own narrow column. Every member sees the pledges by name, the
// viewer's own first as "You".

type Row = InventoryNeedRow & {
  pledged: number;
  still: number;
  covered: number;
  mine: { quantity: number; note: string | null } | null;
};

const SHOW = [
  { value: "open", label: "Still to find" },
  { value: "covered", label: "Covered" },
];

function pledgeLine(row: Row, viewer: InventoryViewer) {
  const ordered = [...row.pledges].sort(
    (a, b) =>
      Number(b.userId === viewer.userId) - Number(a.userId === viewer.userId),
  );
  return ordered.map((p, i) => (
    <span key={p.userId}>
      {i > 0 && " · "}
      <b className="font-semibold text-foreground">
        {p.userId === viewer.userId ? "You" : p.displayName} {p.quantity}
      </b>
      {p.note ? ` (${p.note})` : ""}
    </span>
  ));
}

/** The phone's short pledge words: "Max 2, Sam 1" (first names). */
function othersShort(row: Row, viewer: InventoryViewer): string {
  return row.pledges
    .filter((p) => p.userId !== viewer.userId)
    .map((p) => `${p.displayName.split(" ")[0]} ${p.quantity}`)
    .join(", ");
}

/** A team's header row: who leads it this year. */
function leadText(leads: string[]): string {
  if (leads.length === 0) return "No lead yet";
  return `${leads.length === 1 ? "Lead" : "Leads"}: ${leads.join(", ")}`;
}

function needLine(row: Row, viewer: InventoryViewer) {
  if (row.pledges.length > 0) return <>Pledged: {pledgeLine(row, viewer)}</>;
  if (row.note) return row.note;
  if (row.boughtQuantity >= row.quantity) return "Bought by the camp";
  return "No pledges yet";
}

function Owned({ row }: { row: Row }) {
  const text = `${row.have} owned · ${row.boughtQuantity} bought`;
  if (!row.itemId) return <>{text}</>;
  return (
    <Link
      href={inventoryItemPath(row.itemId)}
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      {text}
    </Link>
  );
}

function Action({ row }: { row: Row }) {
  if (!row.mine && row.still === 0) {
    return (
      <ActionSlot tone="ok">
        <Check aria-hidden className="size-3.5" />
        Covered
      </ActionSlot>
    );
  }
  return (
    <PledgeButton
      needId={row.id}
      name={row.name}
      still={row.still}
      mine={row.mine}
      className="w-full"
    />
  );
}

export default async function InventoryNeedsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const params = await searchParams;
  const teamFilter = typeof params.team === "string" ? params.team : "";
  const show = typeof params.show === "string" ? params.show : "";
  const canAdd = viewer.editableTeams.length > 0;
  const [needs, items] = await Promise.all([
    listInventoryNeeds(),
    canAdd ? listInventoryItems() : Promise.resolve([]),
  ]);
  const itemOptions = items.map((i) => ({ value: i.id, label: i.name }));

  const rows: Row[] = needs.map((n) => {
    const pledged = n.pledges.reduce((sum, p) => sum + p.quantity, 0);
    const mine = n.pledges.find((p) => p.userId === viewer.userId);
    return {
      ...n,
      pledged,
      still: stillNeeded({
        quantity: n.quantity,
        have: n.have,
        bought: n.boughtQuantity,
        pledged,
      }),
      covered: Math.min(n.quantity, n.have + n.boughtQuantity + pledged),
      mine: mine ? { quantity: mine.quantity, note: mine.note } : null,
    };
  });
  const open = rows.filter((r) => r.still > 0).length;
  const shown = rows.filter(
    (r) =>
      (!teamFilter || r.team === teamFilter) &&
      (show !== "open" || r.still > 0) &&
      (show !== "covered" || r.still === 0),
  );
  const teams = [...new Set(shown.map((r) => r.team))].sort(
    (a, b) =>
      viewer.teamOrder(a) - viewer.teamOrder(b) ||
      viewer.teamLabel(a).localeCompare(viewer.teamLabel(b)),
  );
  // Each team's leads for its header row (the mock-up's "Lead: Kim
  // Kitchen"); every approved member reads who leads which team.
  const leads = await Promise.all(
    teams.map(async (team) => {
      const parsed = Team.safeParse(team);
      if (!parsed.success) return [];
      const people = await listTeamPeople(parsed.data);
      return people.filter((p) => p.isLead).map((p) => p.displayName);
    }),
  );
  const groups = teams.map((team, i) => ({
    team,
    leads: leads[i] ?? [],
    rows: shown.filter((r) => r.team === team),
  }));
  const teamOptions = [...new Set(rows.map((r) => r.team))]
    .sort((a, b) => viewer.teamOrder(a) - viewer.teamOrder(b))
    .map((t) => ({ value: t, label: viewer.teamLabel(t) }));
  // The lead tools' column is there only for someone who may use it.
  const tools = canAdd;
  const cols = tools ? 5 : 4;

  const editable = (r: Row) => ({
    id: r.id,
    version: r.version,
    team: r.team,
    name: r.name,
    quantity: r.quantity,
    itemId: r.itemId,
    boughtQuantity: r.boughtQuantity,
    note: r.note,
  });

  return (
    <InventoryFrame
      current="needs"
      actions={
        <>
          <PrintLink
            href={INVENTORY_PRINT_NEEDS_PATH}
            className="hidden page-sm:inline-flex"
          >
            Print who brings what (A4)
          </PrintLink>
          <AddNeedButton teams={viewer.editableTeams} items={itemOptions} />
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No needs yet this year"
          description="When a team lists what it needs, it shows here and members can pledge to bring it."
        />
      ) : (
        <>
          {/* No filters on a phone (the mock-up's phone): the list is
              short, and grouped by team. */}
          <SelectFilters
            className="hidden"
            action={INVENTORY_NEEDS_PATH}
            label="Filter the needs"
            selects={[
              {
                name: "team",
                label: "Team",
                placeholder: "All teams",
                options: teamOptions,
                value: teamFilter,
              },
              {
                name: "show",
                label: "Show",
                placeholder: "All needs",
                options: SHOW,
                value: show,
              },
            ]}
          />
          <CountLine
            aside={
              <>
                <span className="hidden page-md:inline">
                  Teams in camp order
                </span>
                <PrintLink
                  href={INVENTORY_PRINT_NEEDS_PATH}
                  size="sm"
                  className="page-sm:hidden"
                >
                  Print list (A4)
                </PrintLink>
              </>
            }
          >
            <span className="hidden page-md:inline">
              {rows.length === 1 ? "1 need" : `${rows.length} needs`} ·{" "}
            </span>
            {open} still to find · {rows.length - open} covered
          </CountLine>
          {groups.length === 0 ? (
            <EmptyState
              icon={<ClipboardList />}
              title="Nothing matches"
              description="Try another team, or show all needs."
            />
          ) : (
            <InvCard>
              <div className="hidden page-md:block">
                <table className={TABLE}>
                  <caption className="sr-only">
                    What the teams need this year
                  </caption>
                  <colgroup>
                    <col />
                    <col className="w-48" />
                    <col className="w-24" />
                    <col className="w-40" />
                    {tools && <col className="w-11" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Need
                      </th>
                      <th scope="col" className={TH}>
                        Covered so far
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Still to find
                      </th>
                      <th scope="col" className={`${TH} pl-0`}>
                        Your pledge
                      </th>
                      {tools && (
                        <th scope="col" className={`${TH} px-0`}>
                          <span className="sr-only">Team lead tools</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  {groups.map((g) => (
                    <tbody key={g.team}>
                      <GroupRow
                        colSpan={cols}
                        title={viewer.teamLabel(g.team)}
                        aside={leadText(g.leads)}
                      />
                      {g.rows.map((r) => (
                        <tr key={r.id}>
                          <td className={TD}>
                            <span className="block truncate font-semibold">
                              {r.name}
                            </span>
                            <SubLine>{needLine(r, viewer)}</SubLine>
                            {r.pledges.length > 0 && r.note && (
                              <SubLine>{r.note}</SubLine>
                            )}
                          </td>
                          <td className={TD}>
                            <span className="tabular-nums">
                              {r.covered} of {r.quantity}
                            </span>
                            <Meter value={r.covered} max={r.quantity} />
                            <SubLine>
                              <Owned row={r} />
                            </SubLine>
                          </td>
                          <td
                            className={`${TD} text-right tabular-nums ${r.still === 0 ? "text-muted-foreground" : "font-bold"}`}
                          >
                            {r.still}
                          </td>
                          <td className={TD_ACTION}>
                            <Action row={r} />
                          </td>
                          {tools && (
                            <td className={TD_MENU}>
                              {viewer.canEdit(r.team) && (
                                <NeedRowActions
                                  need={editable(r)}
                                  teams={viewer.editableTeams}
                                  items={itemOptions}
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

              <ul className="page-md:hidden" aria-label="What the teams need">
                {groups.map((g) => (
                  <li key={g.team}>
                    <ul>
                      <GroupItem title={viewer.teamLabel(g.team)} />
                      {g.rows.map((r) => (
                        <li
                          key={r.id}
                          className={`grid items-center gap-3 border-t border-border px-4 py-3 ${tools ? "grid-cols-[1fr_7.5rem_2rem]" : "grid-cols-[1fr_7.5rem]"}`}
                        >
                          <span className="min-w-0">
                            <span className="line-clamp-2 font-semibold">
                              {r.name}
                            </span>
                            <SubLine>
                              {r.covered} of {r.quantity}
                              {r.still > 0 && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <b className="font-semibold text-foreground">
                                    {r.still} to find
                                  </b>
                                </>
                              )}
                              {r.mine && ` · you bring ${r.mine.quantity}`}
                              {othersShort(r, viewer) &&
                                ` · ${othersShort(r, viewer)}`}
                            </SubLine>
                            <Meter value={r.covered} max={r.quantity} />
                          </span>
                          <Action row={r} />
                          {tools && (
                            <span>
                              {viewer.canEdit(r.team) && (
                                <NeedRowActions
                                  need={editable(r)}
                                  teams={viewer.editableTeams}
                                  items={itemOptions}
                                />
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </InvCard>
          )}
        </>
      )}
    </InventoryFrame>
  );
}

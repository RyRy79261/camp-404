import {
  AlertTriangle,
  Cable,
  Lock,
  PlugZap,
  Printer,
  Zap,
} from "lucide-react";
import {
  CABLE_WARN_PCT,
  canEditPower,
  connectedWatts,
  downstreamIds,
  gridRuns,
  treeOrder,
  type CableBand,
  type GridLoad,
} from "@camp404/core";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { cn } from "@camp404/ui/lib/utils";
import {
  AddPointButton,
  CopyLastYearGridButton,
  LoadPointSelect,
  PointRowActions,
  type EditablePoint,
  type FeedOption,
} from "@/components/power/grid-controls";
import { PowerTabs } from "@/components/power/power-tabs";
import { captainPageGate } from "@/lib/captain-gate";
import { getPowerPlan, listPowerLoads, type PowerLoadRow } from "@/lib/power";
import {
  GRID_KIND_LABELS,
  POWER_REFUSAL,
  PRINT_GRID_SHEET_PATH,
  formatNumber,
  watts,
} from "@/lib/power-copy";
import {
  listGridNodes,
  listLoadGridPoints,
  previousGridCycle,
  type GridNodeRow,
} from "@/lib/power-site";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Grid plan — Camp 404" };

// The grid plan (#256). Every approved member reads it; a captain or a Power
// & Lighting lead edits it. The points are drawn as a tree, from the
// generator out, each with the cable run that feeds it and the amps that run
// carries (everything plugged in beyond it, at full draw, at 230 V) against
// the cable's rating: fine below 80%, near its limit from 80%, over its rating
// above 100%, and "rating unknown" with none, never a guess. Below the tree,
// where each load plugs in, and what the camp still has to get.
//
// Every figure is worked out here on the server with the core functions. No
// member data and no money on this page.

const REFUSAL_ID = "power-grid-refusal";

const BAND: Record<
  CableBand,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  ok: { label: "Fine", variant: "success" },
  warn: { label: "Near its limit", variant: "warning" },
  over: { label: "Over its rating", variant: "destructive" },
  unknown: { label: "Rating unknown", variant: "outline" },
};

function editable(n: GridNodeRow): EditablePoint {
  return {
    id: n.id,
    version: n.version,
    name: n.name,
    kind: n.kind,
    parentId: n.parentId,
    cable: n.cable,
    cableLengthM: n.cableLengthM,
    cableGaugeMm2: n.cableGaugeMm2,
    cableRatedAmps: n.cableRatedAmps,
    adapter: n.adapter,
    haveCable: n.haveCable,
    haveAdapter: n.haveAdapter,
  };
}

/** "25 m · 2.5 mm² · rated 16 A": what is known of a run's cable. */
function cableText(n: GridNodeRow): string {
  const parts = [
    n.cable,
    n.cableLengthM !== null ? `${formatNumber(n.cableLengthM, 1)} m` : null,
    n.cableGaugeMm2 !== null ? `${formatNumber(n.cableGaugeMm2, 2)} mm²` : null,
    n.cableRatedAmps !== null
      ? `rated ${formatNumber(n.cableRatedAmps, 1)} A`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No cable noted";
}

function loadColumns(
  canEdit: boolean,
  where: Record<string, string>,
  points: FeedOption[],
  names: Map<string, string>,
): ResponsiveColumn<PowerLoadRow>[] {
  return [
    {
      id: "name",
      header: "Load",
      role: "title",
      cellClassName: "font-medium",
      cell: (l) => l.name,
    },
    {
      id: "draw",
      header: "Full draw",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (l) => watts(connectedWatts(l)),
    },
    {
      id: "area",
      header: "Area",
      cellClassName: "text-muted-foreground",
      cell: (l) => l.area,
    },
    {
      id: "point",
      header: "Plugs in at",
      cell: (l) =>
        canEdit ? (
          <LoadPointSelect
            key={`${l.id}:${where[l.id] ?? ""}`}
            loadId={l.id}
            loadName={l.name}
            nodeId={where[l.id] ?? null}
            points={points}
          />
        ) : (
          (names.get(where[l.id] ?? "") ?? "Not on the grid yet")
        ),
    },
  ];
}

export default async function PowerGridPage() {
  // Every approved member reads the grid.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditPower(rank, leadTeams);

  const [nodes, where, loads, plan, earlier] = await Promise.all([
    listGridNodes(),
    listLoadGridPoints(),
    listPowerLoads(),
    getPowerPlan(),
    previousGridCycle(),
  ]);

  const gridLoads: GridLoad[] = loads.map((l) => ({
    ...l,
    gridNodeId: where[l.id] ?? null,
  }));
  const runs = new Map(
    gridRuns(nodes, gridLoads, plan.daysOnSite).map((r) => [r.id, r]),
  );
  const tree = treeOrder(nodes);
  const names = new Map(nodes.map((n) => [n.id, n.name]));

  // Points a load can plug in at, and points that can feed another.
  const pointOptions: FeedOption[] = tree.map(({ point }) => ({
    id: point.id,
    label: `${point.name} (${GRID_KIND_LABELS[point.kind]})`,
  }));
  const feeders = nodes.filter((n) => n.kind !== "end_point");
  const feedOptions = (except?: GridNodeRow): FeedOption[] => {
    const beyond = except ? downstreamIds(nodes, except.id) : new Set<string>();
    return feeders
      .filter((n) => !beyond.has(n.id))
      .map((n) => ({ id: n.id, label: n.name }));
  };

  const over = [...runs.values()].filter((r) => r.band === "over");
  const near = [...runs.values()].filter((r) => r.band === "warn");
  const unknown = [...runs.values()].filter((r) => r.band === "unknown");
  const offGrid = loads.filter((l) => !where[l.id]);
  const toGet = nodes.flatMap((n) => {
    if (n.parentId === null) return [];
    const needs: { key: string; what: string; run: string }[] = [];
    const run = `${names.get(n.parentId) ?? "?"} → ${n.name}`;
    if (!n.haveCable) {
      needs.push({ key: `${n.id}:cable`, what: cableText(n), run });
    }
    if (n.adapter && !n.haveAdapter) {
      needs.push({ key: `${n.id}:adapter`, what: n.adapter, run });
    }
    return needs;
  });

  const copyButton =
    nodes.length === 0 && earlier !== null ? (
      <CopyLastYearGridButton
        fromCycle={earlier}
        canEdit={canEdit}
        refusalId={REFUSAL_ID}
      />
    ) : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Power & Lighting"
        title="Grid plan"
        description="The cables from the generator out to where things plug in, and the amps each one carries. Everyone can read it; captains and Power & Lighting leads edit it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <a href={PRINT_GRID_SHEET_PATH} target="_blank" rel="noopener">
                <Printer aria-hidden />
                Grid sheet
              </a>
            </Button>
            <AddPointButton
              canEdit={canEdit}
              refusalId={REFUSAL_ID}
              feeds={feedOptions()}
            />
          </div>
        }
      />
      <PowerTabs tab="grid" />

      <div className="flex flex-col gap-6">
        {!canEdit && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {POWER_REFUSAL}
          </p>
        )}

        {(over.length > 0 || near.length > 0) && (
          <div className="flex flex-col gap-2">
            {over.length > 0 && (
              <Alert variant="error">
                <Zap aria-hidden />
                <span>
                  {over.length === 1
                    ? "One cable carries"
                    : `${over.length} cables carry`}{" "}
                  more than its rating. Move loads to another run, or use a
                  heavier cable.
                </span>
              </Alert>
            )}
            {near.length > 0 && (
              <Alert variant="warning">
                <AlertTriangle aria-hidden />
                <span>
                  {near.length === 1
                    ? "One cable is"
                    : `${near.length} cables are`}{" "}
                  at {CABLE_WARN_PCT}% of its rating or more. It may run warm.
                </span>
              </Alert>
            )}
          </div>
        )}

        <section aria-labelledby="grid-tree" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="grid-tree" className="text-base font-semibold">
              From the generator out
            </h2>
            <p className="text-xs text-muted-foreground">
              {nodes.length} point{nodes.length === 1 ? "" : "s"}
              {unknown.length > 0 &&
                ` · ${unknown.length} with no cable rating`}
            </p>
          </div>
          {nodes.length === 0 ? (
            <EmptyState
              icon={<Cable />}
              title="No grid yet"
              description={
                copyButton
                  ? `Start from ${earlier}'s grid and change what is different, or add the generator first.`
                  : "Add the generator first, then the junctions and the end points it feeds."
              }
              action={copyButton}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul aria-label="Grid points" className="divide-y divide-border">
                  {tree.map(({ point, depth }) => {
                    const run = runs.get(point.id);
                    const band = run ? BAND[run.band] : null;
                    return (
                      <li
                        key={point.id}
                        aria-label={point.name}
                        className="flex items-start gap-3 px-4 py-3"
                        style={{
                          paddingLeft: `calc(1rem + ${Math.min(depth, 4) * 1.25}rem)`,
                        }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                            point.kind === "generator"
                              ? "bg-primary"
                              : point.kind === "junction"
                                ? "bg-accent"
                                : "bg-muted-foreground",
                          )}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{point.name}</span>
                            <Badge variant="outline">
                              {GRID_KIND_LABELS[point.kind]}
                            </Badge>
                            {band && run && (
                              <Badge variant={band.variant}>{band.label}</Badge>
                            )}
                            {point.parentId !== null && !point.haveCable && (
                              <Badge variant="warning">Need the cable</Badge>
                            )}
                            {point.adapter && !point.haveAdapter && (
                              <Badge variant="warning">Need the adapter</Badge>
                            )}
                          </div>
                          {point.parentId !== null && (
                            <p className="text-xs text-muted-foreground">
                              From {names.get(point.parentId)} ·{" "}
                              {cableText(point)}
                              {point.adapter
                                ? ` · ${point.adapter} at the end`
                                : ""}
                            </p>
                          )}
                          {run && (
                            <p className="text-xs tabular-nums">
                              Carries {formatNumber(run.amps, 1)} A
                              {run.pct !== null
                                ? ` of ${formatNumber(point.cableRatedAmps ?? 0, 1)} A (${formatNumber(run.pct, 0)}%)`
                                : ""}
                            </p>
                          )}
                        </div>
                        <PointRowActions
                          point={editable(point)}
                          canEdit={canEdit}
                          refusalId={REFUSAL_ID}
                          feeds={feedOptions(point)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="grid-loads" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="grid-loads" className="text-base font-semibold">
              What plugs in where
            </h2>
            <p className="text-xs text-muted-foreground">
              A run carries everything plugged in beyond it, at full draw, as a
              fridge&apos;s motor pulls it all while it runs.
              {offGrid.length > 0 &&
                ` ${offGrid.length} load${offGrid.length === 1 ? " is" : "s are"} not on the grid yet.`}
            </p>
          </div>
          {loads.length === 0 ? (
            <EmptyState
              icon={<PlugZap />}
              title="No loads yet"
              description="List what the camp plugs in on the load list, then say here where each plugs in."
            />
          ) : (
            <div className="page-md:rounded-xl page-md:border page-md:bg-card page-md:text-card-foreground page-md:shadow-sm">
              <ResponsiveDataTable
                columns={loadColumns(canEdit, where, pointOptions, names)}
                data={loads}
                getRowKey={(l) => l.id}
                label="What plugs in where"
              />
            </div>
          )}
        </section>

        <Card role="article" aria-labelledby="still-to-get">
          <CardHeader>
            <CardTitle id="still-to-get" className="text-base">
              Still to get
            </CardTitle>
            <CardDescription>
              Cables and adapters the grid needs that the camp does not have
              yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {toGet.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing: the camp has everything the grid names.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {toGet.map((need) => (
                  <li key={need.key} className="flex flex-col">
                    <span className="font-medium">{need.what}</span>
                    <span className="text-xs text-muted-foreground">
                      {need.run}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

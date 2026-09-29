import { gridRuns, treeOrder, type GridLoad } from "@camp404/core";
import { PrintSheet, SHEET_TABLE } from "@/components/power/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { getPowerPlan, listPowerLoads } from "@/lib/power";
import { GRID_KIND_LABELS, formatNumber } from "@/lib/power-copy";
import { listGridNodes, listLoadGridPoints } from "@/lib/power-site";

export const dynamic = "force-dynamic";

export const metadata = { title: "Grid sheet — Camp 404" };

// The grid sheet for set-up day (#256, #249): each run from the generator
// out, with its cable, length and rating, the adapter at the end, what plugs
// in there, the amps it carries, and a box to tick when it is laid. It names
// no member and holds no money.

export default async function GridSheetPage() {
  // Every approved member may print it, as they read the grid.
  await captainPageGate("camp_member");
  const [nodes, where, loads, plan] = await Promise.all([
    listGridNodes(),
    listLoadGridPoints(),
    listPowerLoads(),
    getPowerPlan(),
  ]);
  const gridLoads: GridLoad[] = loads.map((l) => ({
    ...l,
    gridNodeId: where[l.id] ?? null,
  }));
  const runs = new Map(
    gridRuns(nodes, gridLoads, plan.daysOnSite).map((r) => [r.id, r]),
  );
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const pluggedAt = (id: string) =>
    loads.filter((l) => where[l.id] === id).map((l) => l.name);

  return (
    <PrintSheet
      title="Grid sheet"
      subtitle="Each run from the generator out. Tick it when it is laid."
    >
      {nodes.length === 0 ? (
        <p className="text-sm">There is no grid plan for this year yet.</p>
      ) : (
        <table className={SHEET_TABLE} aria-label="Grid runs">
          <thead>
            <tr>
              <th>Run</th>
              <th>Cable</th>
              <th>Adapter at the end</th>
              <th>Plugged in there</th>
              <th className="text-right">Amps</th>
              <th className="w-[8%]">Laid</th>
            </tr>
          </thead>
          <tbody>
            {treeOrder(nodes).map(({ point, depth }) => {
              const run = runs.get(point.id);
              const cable = [
                point.cable,
                point.cableLengthM !== null
                  ? `${formatNumber(point.cableLengthM, 1)} m`
                  : null,
                point.cableRatedAmps !== null
                  ? `${formatNumber(point.cableRatedAmps, 1)} A`
                  : point.parentId !== null
                    ? "rating unknown"
                    : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <tr key={point.id}>
                  <td style={{ paddingLeft: `${0.5 + Math.min(depth, 4)}rem` }}>
                    {point.parentId !== null
                      ? `${names.get(point.parentId)} → ${point.name}`
                      : `${point.name} (${GRID_KIND_LABELS[point.kind]})`}
                    {point.parentId !== null && !point.haveCable && (
                      <span className="font-semibold">
                        {" "}
                        · cable still to get
                      </span>
                    )}
                  </td>
                  <td>{cable || "—"}</td>
                  <td>
                    {point.adapter ?? "—"}
                    {point.adapter && !point.haveAdapter && (
                      <span className="font-semibold"> · still to get</span>
                    )}
                  </td>
                  <td>{pluggedAt(point.id).join(", ") || "—"}</td>
                  <td className="text-right tabular-nums">
                    {run ? formatNumber(run.amps, 1) : "—"}
                  </td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-neutral-700">
        Amps are everything plugged in beyond the run at full draw, at 230 V.
        Keep a run below 80% of its cable&apos;s rating.
      </p>
    </PrintSheet>
  );
}

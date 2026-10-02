import { blockPartLabel, pieceKeys } from "@camp404/core";
import { LayoutKey } from "@/components/layout/layout-key";
import { LayoutPlan } from "@/components/layout/layout-plan";
import { PrintRefusal, PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampLayout } from "@/lib/camp-layout";

export const dynamic = "force-dynamic";

export const metadata = { title: "Site plan — Camp 404" };

// The site plan on A4 paper (the approved redesign's "Print plan (A4)";
// audit 2026-10-01: at the burn there is no internet, and Structures sets the
// camp out from paper). Landscape: the plan to scale with its roads, north
// arrow and scale bar on the left, the numbered key on the right, the version
// and its date in the heading. Every approved member reads the plan, so every
// approved member may print it. Labels are the camp's own words (a tent's
// first name); the sheet holds no phone, email or other private detail.

const SAVED = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

export default async function CampLayoutPrintPage() {
  await captainPageGate("camp_member");
  const state = await getCampLayout();
  if (!state.layout || state.version === 0) {
    return (
      <PrintRefusal>
        <p>There is no site plan for this year yet.</p>
      </PrintRefusal>
    );
  }
  const layout = state.layout;
  const keys = pieceKeys(layout.pieces);
  const part = blockPartLabel(layout.plot.part);
  const subtitle = [
    `Version ${state.version}`,
    state.savedAt ? `saved ${SAVED.format(state.savedAt)}` : null,
    state.savedByName ? `drawn by ${state.savedByName}` : null,
    part
      ? `${part.toLowerCase()}, ${layout.plot.widthM} × ${layout.plot.depthM} m`
      : `${layout.plot.widthM} × ${layout.plot.depthM} m`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PrintSheet
      area="Structures"
      title={state.cycle > 1 ? `Site plan ${state.cycle}` : "Site plan"}
      subtitle={subtitle}
      orientation="landscape"
    >
      <div
        data-plan-tone="paper"
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-6"
      >
        <LayoutPlan
          plot={layout.plot}
          pieces={layout.pieces}
          keys={keys}
          edges={layout.plot.edges}
          label={`Site plan, ${layout.plot.widthM} m by ${layout.plot.depthM} m`}
          className="h-[150mm] w-auto max-w-[150mm]"
        />
        <div className="flex flex-col gap-3 text-neutral-900 [&_.text-muted-foreground]:text-neutral-600 [&_li]:border-neutral-300">
          <LayoutKey pieces={layout.pieces} keys={keys} />
          <p className="mt-auto text-xs text-neutral-700">
            Sizes and places in metres. Places are measured from the plot&apos;s
            left edge and from {layout.plot.edges.top.trim() || "its top edge"}.
            The arrow marks north; the bar is to scale.
          </p>
        </div>
      </div>
    </PrintSheet>
  );
}

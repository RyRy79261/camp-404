import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kindKeys, pieceCounts } from "@camp404/core";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ArrivalCounts } from "@/components/layout/arrival-counts";
import { KindKey } from "@/components/layout/layout-key";
import { BlockLocator, LayoutPlan } from "@/components/layout/layout-plan";
import { getSharedLayout } from "@/lib/camp-layout";

export const dynamic = "force-dynamic";

// The page our neighbours see (#271; the approved redesign, 2026-10-01): public,
// opened by the link a captain made, with no sign-in. It reads through
// getSharedLayout alone, which hands back only neighbourView's allowlist (each
// piece's kind, size and place; the plot's size, north and which half of the
// block) and arrival COUNTS per day. No label, no road or side note, no name,
// no who-saved-it: nothing typed inside the camp reaches this page, so its
// key numbers kinds, not pieces. A link that was never made, was turned off
// or was replaced answers 404.
//
// It wears the 404 OS look (a window on the dark desktop colours), with no
// desktop, no member data and no links into the app. Not indexed, and no
// referrer leaves it, so the link does not spread by itself.

export const metadata: Metadata = {
  title: "Camp 404 site plan",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function NeighbourPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedLayout(token);
  if (!shared) notFound();
  const { layout, arrivals, cycle } = shared;
  const pieces = layout
    ? layout.pieces.map((p, i) => ({ ...p, id: `n-${i}` }))
    : [];
  const kinds = kindKeys(pieces);
  const keys = new Map(pieces.map((p) => [p.id, kinds.get(p.kind) ?? ""]));
  const counts = pieceCounts(pieces);
  const part = layout?.plot.part ?? "whole";

  return (
    <main
      data-os-skin
      className="min-h-svh bg-os-bg px-3 py-6 text-os-fg page-sm:px-6 page-sm:py-10"
    >
      <div className="mx-auto flex w-full max-w-[70rem] flex-col border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]">
        <div className="flex h-9 shrink-0 select-none items-center justify-between gap-2 bg-os-primary px-3 text-os-primary-fg">
          <span className="truncate font-pixel text-xs uppercase tracking-[0.2em]">
            Camp 404 · site plan
          </span>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider opacity-80"
          >
            No sign-in
          </span>
        </div>
        <div className="os-window-colours px-4 pb-6 pt-5 page-sm:px-6">
          <PageHeading
            eyebrow={cycle > 1 ? `Camp 404 · ${cycle}` : "Camp 404"}
            title="Our site plan"
            description={
              <>
                Hello, neighbours.{" "}
                <span className="hidden page-sm:inline">
                  This is how our camp is laid out this year, and how many of us
                  arrive each day.{" "}
                </span>
                Questions? Find us at our 404 sign.
              </>
            }
          />
          <div className="grid grid-cols-1 gap-4 page-md:grid-cols-[auto_minmax(0,1fr)]">
            {layout ? (
              <div className="flex items-center justify-center border border-border bg-[var(--plan-card)] p-2 page-md:h-[564px] page-md:p-3">
                <LayoutPlan
                  plot={layout.plot}
                  pieces={pieces}
                  keys={keys}
                  label={`Camp 404's site plan: a plot ${layout.plot.widthM} m wide and ${layout.plot.depthM} m deep${part !== "whole" ? `, the ${part} half of the block` : ""}`}
                  className="h-auto w-full page-md:h-full page-md:w-auto page-md:max-w-full"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The plan isn&apos;t ready yet.
              </p>
            )}
            <div className="flex flex-col gap-4">
              {counts.length > 0 ? (
                <section
                  aria-labelledby="key-heading"
                  className="border border-border bg-card p-4"
                >
                  <h2
                    id="key-heading"
                    className="mb-2 flex items-baseline gap-2 font-pixel text-[11px] tracking-[0.2em]"
                  >
                    KEY
                    <span className="font-sans text-xs normal-case tracking-normal text-muted-foreground">
                      each number is a kind of piece
                    </span>
                  </h2>
                  <KindKey counts={counts} keys={kinds} />
                </section>
              ) : null}
              <section
                aria-labelledby="arrivals-heading"
                className="flex flex-col gap-3 border border-border bg-card p-4"
              >
                <h2
                  id="arrivals-heading"
                  className="font-pixel text-[11px] tracking-[0.2em]"
                >
                  WHEN WE ARRIVE
                </h2>
                <ArrivalCounts
                  arrivals={arrivals}
                  empty="We don't know our arrival days yet."
                />
                {arrivals.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Numbers may change before the burn.
                  </p>
                ) : null}
                {part !== "whole" ? (
                  <div className="mt-1 flex items-center gap-3 border-t border-border pt-4">
                    <BlockLocator part={part} className="w-20" />
                    <p className="text-xs text-muted-foreground">
                      We&apos;re on the {part} half of the block. The hatched
                      side of the plan is the other half.
                    </p>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

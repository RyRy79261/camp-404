import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Tent } from "lucide-react";
import { pieceCounts } from "@camp404/core";
import { ArrivalCounts } from "@/components/layout/arrival-counts";
import { LayoutLegend, LayoutPlan } from "@/components/layout/layout-plan";
import { getSharedLayout } from "@/lib/camp-layout";

export const dynamic = "force-dynamic";

// The page our neighbours see (#271): public, opened by the link a captain
// made, with no sign-in. It reads through getSharedLayout alone, which hands
// back only neighbourView's allowlist (each piece's kind, size and place; the
// plot's size and north) and arrival COUNTS per day. No label, no side note,
// no name, no who-saved-it: nothing typed inside the camp reaches this page.
// A link that was never made, was turned off or was replaced answers 404.
//
// Outside the console: no desktop, no member data, no links into the app.
// Not indexed, and no referrer leaves it, so the link does not spread by
// itself.

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

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Tent className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">Camp 404</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight sm:text-3xl">
            Camp 404{cycle > 1 ? ` · ${cycle}` : ""}: our site plan
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Hello, neighbours. This is how our camp is laid out this year, and
            how many of us arrive on each day.
          </p>
        </div>

        <section aria-labelledby="plan" className="flex flex-col gap-3">
          <h2 id="plan" className="text-base font-semibold">
            Layout
          </h2>
          {layout ? (
            <>
              <div className="rounded-xl border border-border bg-card/40 p-2 sm:p-3">
                <LayoutPlan
                  plot={layout.plot}
                  pieces={layout.pieces.map((p, i) => ({ ...p, id: `n-${i}` }))}
                  label={`Camp 404's site plan: a plot ${layout.plot.widthM} m wide and ${layout.plot.depthM} m deep`}
                  className="max-h-[70vh]"
                />
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <LayoutLegend counts={pieceCounts(layout.pieces)} />
                <p className="text-xs text-muted-foreground">
                  {layout.plot.widthM} m × {layout.plot.depthM} m. N marks
                  north.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The plan isn&apos;t ready yet.
            </p>
          )}
        </section>

        <section aria-labelledby="arrivals" className="flex flex-col gap-3">
          <h2 id="arrivals" className="text-base font-semibold">
            When we arrive
          </h2>
          <div className="max-w-xl">
            <ArrivalCounts
              arrivals={arrivals}
              empty="We don't know our arrival days yet."
            />
          </div>
        </section>
      </main>
    </div>
  );
}

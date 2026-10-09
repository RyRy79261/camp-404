import Link from "next/link";
import { LayoutGrid, Printer } from "lucide-react";
import {
  blockPartLabel,
  canEditLayout,
  canShareLayout,
  emptyLayout,
} from "@camp404/core";
import type { CampLayout } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ArrivalCounts } from "@/components/layout/arrival-counts";
import {
  CopyLastYearLayoutButton,
  NeighbourShareControls,
  RestoreVersionButton,
} from "@/components/layout/layout-controls";
import { LayoutWorkspace } from "@/components/layout/layout-editor";
import { BlockLocator } from "@/components/layout/layout-plan";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getCampLayout,
  getLayoutShare,
  layoutArrivalCounts,
  listLayoutVersions,
  previousLayoutCycle,
  type LayoutShare,
  type LayoutVersionRow,
} from "@/lib/camp-layout";
import {
  LAYOUT_PATH,
  LAYOUT_PRINT_PATH,
  NEIGHBOUR_SEES,
} from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp layout — Camp 404" };

// This year's site plan (#271; the approved redesign, owner 2026-10-01,
// option A). Every approved member reads it; a captain or a Structures lead
// edits it (canEditLayout); a captain alone shares it with neighbours
// (canShareLayout). The heading names the version and who drew it, with a
// Print plan (A4) for site, where there is no internet; under it the plan,
// its numbered key and the rail (components/layout/layout-editor.tsx). The
// neighbour link is read only for a captain, so no one else's page holds it.

const SAVED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Johannesburg",
});

const SHARED_SINCE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Johannesburg",
});

export default async function CampLayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  // Every approved member reads the plan.
  const { campUser, rank } = await captainPageGate("camp_member");
  const { version: asked } = await searchParams;
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditLayout(rank, leadTeams);
  const canShare = canShareLayout(rank);

  const askedNumber =
    asked !== undefined && /^\d{1,6}$/.test(asked) ? Number(asked) : undefined;
  const [state, latest, versions, arrivals, earlier, share] = await Promise.all(
    [
      getCampLayout(undefined, askedNumber),
      askedNumber === undefined ? null : getCampLayout(),
      listLayoutVersions(),
      layoutArrivalCounts(),
      previousLayoutCycle(),
      canShare ? getLayoutShare() : Promise.resolve(null),
    ],
  );
  const latestVersion = latest?.version ?? state.version;
  const viewingOld = state.version !== 0 && state.version !== latestVersion;
  const canChange = canEdit && !viewingOld;
  const canCopy = latestVersion === 0 && earlier !== null && canEdit;
  const layout: CampLayout = state.layout ?? emptyLayout();
  const year = state.cycle > 1 ? String(state.cycle) : null;

  // The heading always carries one meta line, so the body below keeps its
  // height. A phone gets the mock-up's short one: no time, no "drawn by".
  const meta =
    state.version === 0
      ? canChange
        ? "No version saved yet."
        : "Nothing drawn yet."
      : [
          `Version ${state.version}`,
          state.savedByName ? `drawn by ${state.savedByName}` : null,
          state.savedAt ? SAVED.format(state.savedAt) : null,
          state.shared ? "Shared with neighbours" : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const shortMeta =
    state.version === 0
      ? meta
      : [
          `Version ${state.version}`,
          state.savedByName,
          state.savedAt ? SHARED_SINCE.format(state.savedAt) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  // The plan fills its window down to the bottom (data-fills-window: the
  // window's body gives the page its height; layout-editor.tsx).
  return (
    <div
      data-fills-window
      className="flex flex-col page-md:min-h-0 page-md:flex-1"
    >
      <PageHeading
        eyebrow={year ? `Camp · ${year}` : "Camp"}
        title="Camp layout"
        description={
          <>
            <span className="hidden page-md:inline">
              This year&apos;s site plan, to scale.{" "}
              {canChange
                ? "Pick a piece on the plan to change it."
                : "Structures leads and captains change it."}
            </span>
            <span className="mt-2 hidden text-xs page-md:block">{meta}</span>
            <span className="block text-xs page-md:hidden">
              {shortMeta}
              {canEdit ? ". The plan is changed on a computer." : null}
            </span>
          </>
        }
        actions={
          <>
            {canCopy ? <CopyLastYearLayoutButton fromCycle={earlier} /> : null}
            {latestVersion > 0 ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[13px] font-semibold"
              >
                <Link href={LAYOUT_PRINT_PATH}>
                  <Printer aria-hidden />
                  <span className="page-sm:hidden">Print (A4)</span>
                  <span className="hidden page-sm:inline">Print plan (A4)</span>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {viewingOld ? (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-3 border border-warning/50 bg-warning/10 px-4 py-2 text-[13px] page-md:min-h-12 page-md:flex-nowrap"
        >
          <span className="min-w-0 flex-1">
            You are looking at{" "}
            <b className="font-semibold">version {state.version}</b>, an older
            plan.
            {canEdit ? " Nothing changes until you bring it back." : null}
          </span>
          {canEdit ? (
            <RestoreVersionButton
              number={state.version}
              latest={latestVersion}
            />
          ) : null}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[13px] font-semibold"
          >
            <Link href={LAYOUT_PATH}>Back to the latest</Link>
          </Button>
        </div>
      ) : null}

      {state.version === 0 && !canEdit ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="No layout yet"
          description="The Structures leads haven't drawn this year's plan yet."
        />
      ) : (
        <LayoutWorkspace
          // A new version on the server starts the workspace afresh.
          key={`${state.version}-${viewingOld}`}
          initial={layout}
          version={latestVersion}
          canEdit={canChange}
          underBanner={viewingOld}
          label={planLabel(layout)}
          about={
            <AboutPlan
              layout={layout}
              version={state.version}
              savedAt={state.savedAt}
              savedByName={state.savedByName}
              shared={state.shared}
            />
          }
          versions={
            <VersionList
              versions={versions}
              showing={state.version}
              latest={latestVersion}
            />
          }
          arrivals={
            <div className="flex flex-col gap-3">
              <ArrivalCounts
                arrivals={arrivals}
                overDays
                empty="Nobody has given an arrival day yet. It comes from a questionnaire's Arrival day question."
              />
              <p className="text-xs text-muted-foreground">
                Counts only. Who arrives when stays with the captains.
              </p>
            </div>
          }
          share={
            share ? (
              <SharePanel share={share} canShareNow={latestVersion > 0} />
            ) : null
          }
        />
      )}
    </div>
  );
}

/** The drawing's accessible name: its size, our part of the block, its pieces. */
function planLabel(layout: CampLayout): string {
  const part = blockPartLabel(layout.plot.part);
  const n = layout.pieces.length;
  return `Camp layout: a plot ${layout.plot.widthM} m wide and ${layout.plot.depthM} m deep${part ? `, the ${part.toLowerCase()}` : ""}, ${n} piece${n === 1 ? "" : "s"}`;
}

/** "This plan": the facts a reader asks first, and where we are in the block. */
function AboutPlan({
  layout,
  version,
  savedAt,
  savedByName,
  shared,
}: {
  layout: CampLayout;
  version: number;
  savedAt: Date | null;
  savedByName: string | null;
  shared: boolean;
}) {
  const part = blockPartLabel(layout.plot.part);
  const size = `${layout.plot.widthM} × ${layout.plot.depthM} m`;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-muted-foreground">Version</dt>
        <dd>
          {version === 0
            ? "Not saved yet"
            : `${version}${savedAt ? `, saved ${SAVED.format(savedAt)}` : ""}`}
        </dd>
        {savedByName ? (
          <>
            <dt className="text-muted-foreground">Drawn by</dt>
            <dd>{savedByName}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Our plot</dt>
        <dd>{part ? `${part}, ${size}` : size}</dd>
        <dt className="text-muted-foreground">Neighbours</dt>
        <dd>{shared ? "Shared (counts and kinds only)" : "Not shared"}</dd>
      </dl>
      {layout.plot.part !== "whole" ? (
        <div className="flex items-center gap-3">
          <BlockLocator
            part={layout.plot.part}
            edges={layout.plot.edges}
            className="w-24"
          />
          <p className="text-xs text-muted-foreground">
            We have the {layout.plot.part} half this year.
            {layout.plot.part === "left" ? " Most years it's the right." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Every saved version, with one action in the same slot on each row. */
function VersionList({
  versions,
  showing,
  latest,
}: {
  versions: readonly LayoutVersionRow[];
  showing: number;
  latest: number;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Each save is kept here, so an older plan can be brought back.
      </p>
    );
  }
  return (
    <ul aria-label="Saved versions" className="flex flex-col">
      {versions.map((v, i) => (
        <li
          key={v.number}
          className={`grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 py-3 text-[13px] ${i === 0 ? "pt-0" : "border-t border-border/60"}`}
        >
          <div className="min-w-0">
            <b className="font-semibold">Version {v.number}</b>
            {v.number === latest ? (
              <Badge className="ml-2 rounded-none">Latest</Badge>
            ) : null}
            {v.note ? (
              <small className="mt-0.5 block text-xs text-muted-foreground">
                {v.note}
              </small>
            ) : null}
            <small className="mt-0.5 block text-xs text-muted-foreground">
              {[v.savedByName, SAVED.format(v.savedAt)]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </div>
          {v.number === showing ? (
            <span className="justify-self-end text-xs text-muted-foreground">
              Showing
            </span>
          ) : (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 w-[4.5rem] px-0 text-[13px] font-semibold"
            >
              <Link
                href={
                  v.number === latest
                    ? LAYOUT_PATH
                    : `${LAYOUT_PATH}?version=${v.number}`
                }
                aria-label={`View version ${v.number}`}
              >
                View
              </Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A captain's Share tab: whether it is on, what neighbours see, the link. */
function SharePanel({
  share,
  canShareNow,
}: {
  share: LayoutShare;
  canShareNow: boolean;
}) {
  const on = share.token !== null;
  return (
    <div className="flex flex-col">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <i
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-success" : "bg-muted-foreground"}`}
        />
        {on
          ? `Shared with neighbours${share.sharedAt ? ` since ${SHARED_SINCE.format(share.sharedAt)}` : ""}`
          : "Not shared with neighbours"}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {NEIGHBOUR_SEES}
        {on ? " A new link stops the old one working." : ""}
      </p>
      <NeighbourShareControls token={share.token} canShareNow={canShareNow} />
      {!canShareNow ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Save a layout first, then share it.
        </p>
      ) : null}
    </div>
  );
}

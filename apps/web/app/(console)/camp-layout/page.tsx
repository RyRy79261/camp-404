import Link from "next/link";
import { History, LayoutGrid, Lock, Truck, Users } from "lucide-react";
import { canEditLayout, canShareLayout, emptyLayout } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ArrivalCounts } from "@/components/layout/arrival-counts";
import {
  CopyLastYearLayoutButton,
  NeighbourShareControls,
  RestoreVersionButton,
} from "@/components/layout/layout-controls";
import { LayoutEditor } from "@/components/layout/layout-editor";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getCampLayout,
  getLayoutShare,
  layoutArrivalCounts,
  listLayoutVersions,
  previousLayoutCycle,
} from "@/lib/camp-layout";
import { LAYOUT_PATH, LAYOUT_REFUSAL } from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp layout — Camp 404" };

// This year's site plan (#271). Every approved member reads it; a captain or a
// Structures lead edits it (canEditLayout); a captain alone shares it with
// neighbours (canShareLayout). Composed like the power load list: the
// PageHeading, one Lock line for a viewer who may not edit (every edit control
// present but disabled, pointing at it), the work in the middle, and cards
// under it. The neighbour link is read only for a captain, so no one else's
// page ever holds it.

const REFUSAL_ID = "layout-edit-refusal";

const SAVED = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
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
  const canCopy = latestVersion === 0 && earlier !== null && canEdit;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Structures"
        title="Camp layout"
        description="This year's site plan, to scale. Everyone in camp can see it; captains and Structures leads change it."
        actions={
          canCopy ? <CopyLastYearLayoutButton fromCycle={earlier} /> : null
        }
      />

      <div className="flex flex-col gap-6">
        {!canEdit && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {LAYOUT_REFUSAL}
          </p>
        )}

        {viewingOld ? (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
            <History className="h-4 w-4 shrink-0" aria-hidden />
            You&apos;re looking at version {state.version}, not the latest.
            <Link
              href={LAYOUT_PATH}
              className="font-medium text-accent hover:underline"
            >
              Back to the latest
            </Link>
          </p>
        ) : null}

        <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plan-heading" className="text-base font-semibold">
              {state.cycle > 1 ? `${state.cycle} site plan` : "Site plan"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {state.version === 0
                ? "Not saved yet"
                : `Version ${state.version}${state.savedByName ? ` · ${state.savedByName}` : ""}${state.savedAt ? ` · ${SAVED.format(state.savedAt)}` : ""}`}
            </p>
          </div>

          {state.version === 0 && !canEdit ? (
            <EmptyState
              icon={<LayoutGrid />}
              title="No layout yet"
              description="The Structures leads haven't drawn this year's plan yet."
            />
          ) : (
            <LayoutEditor
              // A new version on the server starts the editor afresh.
              key={`${state.version}-${viewingOld}`}
              initial={state.layout ?? emptyLayout()}
              version={latestVersion}
              canEdit={canEdit && !viewingOld}
              refusalId={REFUSAL_ID}
            />
          )}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-accent" aria-hidden />
                Arrivals
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ArrivalCounts
                arrivals={arrivals}
                empty="Nobody has given an arrival day yet. It comes from a questionnaire's Arrival day question."
              />
              <p className="text-xs text-muted-foreground">
                Counts only. Who arrives when stays with the captains.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-accent" aria-hidden />
                Versions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Each save is kept here.
                </p>
              ) : (
                <ul
                  aria-label="Saved versions"
                  className="-my-2 divide-y divide-border"
                >
                  {versions.map((v) => (
                    <li
                      key={v.number}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">Version {v.number}</span>
                        {v.number === latestVersion ? (
                          <Badge variant="outline" className="ml-2">
                            Latest
                          </Badge>
                        ) : null}
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            v.note,
                            `${v.pieces} piece${v.pieces === 1 ? "" : "s"}`,
                            v.savedByName,
                            SAVED.format(v.savedAt),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {v.number !== latestVersion ? (
                        <span className="flex items-center gap-1">
                          <Link
                            href={`${LAYOUT_PATH}?version=${v.number}`}
                            className="text-xs font-medium text-accent hover:underline"
                            aria-label={`Look at version ${v.number}`}
                          >
                            Look
                          </Link>
                          {canEdit ? (
                            <RestoreVersionButton
                              number={v.number}
                              latest={latestVersion}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-accent" aria-hidden />
              Neighbours
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              A page for neighbouring camps, opened by a link, with no sign-in.
              It shows the latest plan (each piece&apos;s kind, never its label
              or the sides&apos; notes) and how many people arrive each day. No
              names.
            </p>
            {share ? (
              <NeighbourShareControls
                token={share.token}
                canShareNow={latestVersion > 0}
              />
            ) : (
              <p className="text-sm">
                {state.shared
                  ? "A captain has shared it with neighbours."
                  : "Not shared. A captain can turn the link on."}
              </p>
            )}
            {share && latestVersion === 0 ? (
              <p className="text-xs text-muted-foreground">
                Save a layout first, then share it.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

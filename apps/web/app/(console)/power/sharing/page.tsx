import type { ReactNode } from "react";
import { fuelSplit, powerTotals } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { PowerFrame } from "@/components/power/power-frame";
import {
  CardFoot,
  CardHead,
  EmptyNote,
  PowerCard,
  SectionHead,
  TONE_TEXT,
  Verdict,
} from "@/components/power/power-ui";
import { ChangeAgreementButton } from "@/components/power/readiness-controls";
import {
  FUEL_LABELS,
  PRINT_SHARING_PATH,
  formatNumber,
  litres,
} from "@/lib/power-copy";
import {
  getPowerOverview,
  powerTeamContext,
  powerViewer,
} from "@/lib/power-overview";
import { sharingSummary } from "@/lib/power-summary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sharing — Camp 404" };

// Sharing a generator with a neighbouring camp (#257), its own section of the
// Power program's answer rail (the owner's approved redesign, 2026-10-01). It
// opens on one sentence: who shares whose generator, and whether the fuel
// split is agreed. Then the agreement as the paper summary will print it. The
// agreement names a camp and a contact ROLE, never a person's phone or email,
// and splits fuel in percent and litres, never money. The paper summary is
// offered only once the split is agreed.

const COLS =
  "grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] page-sm:grid-cols-[136px_minmax(0,1fr)_minmax(0,1fr)]";

function AgreementRow({
  label,
  ours,
  theirs,
}: {
  label: string;
  ours: ReactNode;
  /** Absent: `ours` spans both camps. */
  theirs?: ReactNode;
}) {
  return (
    <div
      role="row"
      className={`grid min-h-14 items-center gap-3 border-t border-border px-3 py-3 text-sm leading-5 page-sm:px-4 ${COLS}`}
    >
      <div
        role="rowheader"
        className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground"
      >
        {label}
      </div>
      {theirs === undefined ? (
        <div role="cell" className="col-span-2">
          {ours}
        </div>
      ) : (
        <>
          <div role="cell">{ours}</div>
          <div role="cell">{theirs}</div>
        </>
      )}
    </div>
  );
}

async function SharingSection() {
  const [{ canEdit }, o, team] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
    powerTeamContext(),
  ]);
  const a = o.agreement;
  const share = sharingSummary(o);

  // Their share proposed from each camp's kWh, for the dialog's help line.
  const theirKwh = powerTotals(
    o.loads.filter((l) => l.owner === "neighbour"),
    o.plan.daysOnSite,
    o.plan.powerFactor,
  ).burnKwh;
  const ourKwh = powerTotals(
    o.loads.filter((l) => l.owner !== "neighbour"),
    o.plan.daysOnSite,
    o.plan.powerFactor,
  ).burnKwh;
  const proposed = fuelSplit(ourKwh, theirKwh);

  const button = canEdit ? (
    <ChangeAgreementButton
      key={a?.version ?? 0}
      agreement={
        a
          ? {
              partnerCamp: a.partnerCamp,
              contactRole: a.contactRole,
              generatorSource: a.generatorSource,
              generatorId: a.generatorId,
              theirGenerator: a.theirGenerator,
              partnerFuelPct: a.partnerFuelPct,
              watchCover: a.watchCover,
              version: a.version,
            }
          : null
      }
      generators={o.generators.map((g) => ({ id: g.id, label: g.model }))}
      proposedTheirPct={Number(formatNumber(proposed.theirPct, 1))}
      defaultGeneratorId={o.generator?.id ?? null}
    />
  ) : null;

  if (!a || !share) {
    return (
      <>
        <SectionHead
          title="Sharing"
          sentence="A generator shared with a neighbouring camp."
          actions={button ?? undefined}
        />
        <PowerCard label="The answer">
          <EmptyNote title="No sharing this year.">
            The camp runs its generator for itself.
          </EmptyNote>
        </PowerCard>
      </>
    );
  }

  const ours = a.generatorSource === "ours";
  const model = o.shareGenerator?.model ?? null;
  const fuelWord = o.shareGenerator
    ? FUEL_LABELS[o.shareGenerator.fuelType].toLowerCase()
    : "fuel";
  const shareText = (pct: number, l: number | null) =>
    share.agreed ? (
      `${formatNumber(pct, 0)}%${l !== null ? ` · ${litres(l, 0)}` : ""}`
    ) : (
      <span className="text-muted-foreground">Not agreed yet</span>
    );

  return (
    <>
      <SectionHead
        title="Sharing"
        sentence="A generator shared with a neighbouring camp."
        actions={
          <>
            {share.agreed && (
              <Button asChild variant="outline">
                <a href={PRINT_SHARING_PATH} target="_blank" rel="noopener">
                  Print the summary
                </a>
              </Button>
            )}
            {button}
          </>
        }
      />

      <Verdict>
        {ours ? (
          <>
            {a.partnerCamp} shares <b>our {model ?? "generator"}</b>
            {share.litres !== null
              ? ` and its ${litres(share.litres, 0)} of ${fuelWord}.`
              : "."}
          </>
        ) : (
          <>
            We share <b>{a.partnerCamp}&apos;s generator</b>
            {a.theirGenerator ? `, a ${a.theirGenerator}.` : "."}
          </>
        )}{" "}
        {share.agreed ? (
          <span>
            They take {formatNumber(share.theirPct, 0)}% of the fuel
            {share.theirs !== null ? `: ${litres(share.theirs, 0)}.` : "."}
          </span>
        ) : (
          <span className={`font-bold ${TONE_TEXT.warn}`}>
            The split isn&apos;t agreed yet.
          </span>
        )}
      </Verdict>

      <PowerCard label="The agreement">
        <CardHead
          title="The agreement"
          meta="What the paper summary will say"
        />
        <div role="table" aria-label="The agreement">
          <div
            role="row"
            className={`grid min-h-10 items-center gap-3 px-3 py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground page-sm:px-4 ${COLS}`}
          >
            <div role="columnheader" />
            <div role="columnheader">Camp 404</div>
            <div role="columnheader">{a.partnerCamp}</div>
          </div>
          <AgreementRow
            label="Contact"
            ours={
              team.leadNames.length > 0
                ? team.leadNames.join(", ")
                : "Power & Lighting lead"
            }
            theirs={
              a.contactRole ?? (
                <span className="text-muted-foreground">Not given</span>
              )
            }
          />
          <AgreementRow
            label="Generator"
            ours={ours ? `Brings the ${model ?? "generator"}` : "Brings none"}
            theirs={
              ours
                ? "Brings none"
                : `Brings ${a.theirGenerator ? `the ${a.theirGenerator}` : "theirs"}`
            }
          />
          <AgreementRow
            label="Fuel share"
            ours={shareText(share.ourPct, share.ours)}
            theirs={shareText(share.theirPct, share.theirs)}
          />
          <AgreementRow
            label="Night watch"
            ours={
              a.watchCover ?? (
                <span className="text-muted-foreground">Not agreed yet</span>
              )
            }
          />
        </div>
        <CardFoot>
          {share.agreed ? (
            share.how === "typed" ? (
              "The split was typed in by the team."
            ) : (
              `Split by what each camp plugs in: ${a.partnerCamp}'s loads are on the load list, marked Neighbour.`
            )
          ) : (
            <>
              {canEdit &&
                `To split the fuel, add ${a.partnerCamp}'s loads to the load list (marked Neighbour), or type their share. `}
              The paper summary prints once the split is agreed.
            </>
          )}
        </CardFoot>
      </PowerCard>
    </>
  );
}

export default function PowerSharingPage() {
  return (
    <PowerFrame section="sharing">
      <SharingSection />
    </PowerFrame>
  );
}

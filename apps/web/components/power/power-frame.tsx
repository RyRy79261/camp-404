import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import {
  getPowerOverview,
  namesOr,
  powerTeamContext,
  powerViewer,
} from "@/lib/power-overview";
import { POWER_HOME_PATH, POWER_READ_ONLY } from "@/lib/power-copy";
import { powerRail, type PowerSection } from "@/lib/power-summary";
import { Dot } from "./power-ui";

// The Power program's frame (the owner's approved redesign, option B, the
// "answer rail", 2026-10-01). The page heading, then on the left a rail with
// every section's answer written in it, so the whole power picture reads in
// one glance, and the open section beside it. Each rail line is a link, so
// every section stays a server render with its own address.
//
// Below the page's 48rem (a phone, or a narrow window) the rail is the home
// list: /power shows only the rail, and a section shows only itself with a
// way back. A reader who may not edit sees one quiet line under the heading
// and no buttons at all, never a greyed-out form.

export async function PowerFrame({
  section,
  home = false,
  children,
}: {
  /** The section open beside the rail (on /power, the load list). */
  section: PowerSection;
  /** The program's home, /power: on a phone, the rail alone. */
  home?: boolean;
  children: ReactNode;
}) {
  const [{ canEdit }, overview, team] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
    powerTeamContext(),
  ]);
  const rail = powerRail(overview);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={
          team.year === null
            ? "Power & Lighting"
            : `Power & Lighting · ${team.year}`
        }
        title="Power"
        description="The camp's loads, fuel, cable runs and generator for this year's burn."
      />
      {!canEdit && (
        <p className="-mt-4 mb-6 text-[13px] leading-5 text-muted-foreground">
          <span>{POWER_READ_ONLY}</span>
          {team.leadNames.length > 0 && (
            <span> Ask {namesOr(team.leadNames)}.</span>
          )}
        </p>
      )}
      <div className="grid items-start gap-6 page-md:grid-cols-[208px_minmax(0,1fr)]">
        <nav
          aria-label="Power"
          className={cn(
            "flex-col gap-1 page-md:sticky page-md:top-0",
            home ? "flex" : "hidden page-md:flex",
          )}
        >
          {rail.map((entry) => {
            const open = entry.section === section;
            return (
              <Link
                key={entry.section}
                href={entry.href}
                aria-current={open ? "page" : undefined}
                className={cn(
                  "grid grid-cols-[8px_minmax(0,1fr)_16px] items-center gap-x-3 gap-y-1 border border-transparent bg-card p-3 text-left text-foreground hover:brightness-110 page-md:grid-cols-[8px_minmax(0,1fr)]",
                  open &&
                    "page-md:border-primary page-md:bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_26%,var(--color-card)))]",
                )}
              >
                <span className="col-start-2 row-start-1 font-pixel text-[9px] uppercase leading-3 tracking-[0.14em] text-muted-foreground">
                  {entry.label}
                </span>
                <span className="col-start-1 row-start-2 flex">
                  <Dot tone={entry.tone} />
                </span>
                <span className="col-start-2 row-start-2 text-[15px] font-bold leading-5">
                  {entry.answer}
                </span>
                <span className="col-start-2 row-start-3 truncate text-xs leading-4 text-muted-foreground">
                  {entry.detail}
                </span>
                <span
                  aria-hidden
                  className="col-start-3 row-span-3 row-start-1 text-xl text-muted-foreground page-md:hidden"
                >
                  ›
                </span>
              </Link>
            );
          })}
        </nav>
        <div className={cn("min-w-0", home && "hidden page-md:block")}>
          {!home && (
            <Link
              href={POWER_HOME_PATH}
              className="mb-3 inline-flex h-8 items-center text-[13px] font-semibold text-primary page-md:hidden"
            >
              ‹ All of Power
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getTeamsConfig } from "@/lib/camp-config";
import { getKitchenSettings } from "@/lib/recipes";
import { KitchenSettingsCard } from "./kitchen-settings-card";
import { TeamSettingsManager, type TeamRow } from "./team-settings-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp settings — Camp 404" };

// Captains' camp settings, as the AfrikaBurn console's settings cards: the team
// editor in the main column, the camp's year and the kitchen beside it. Preview-but-locked
// (D3): non-captains see the heading and a CaptainLock, and the config is
// withheld server-side — never fetched, never sent. Captains get the full team
// editor (relabel / reorder / archive). The editor needs the WHOLE list (incl.
// archived, so they can be restored), order-sorted — not the active-only
// projection the roster filter uses.

export default async function CampSettingsPage() {
  const { cleared } = await captainPageGate("captain");

  const teams: TeamRow[] = cleared
    ? [...(await getTeamsConfig()).teams].sort((a, b) => a.order - b.order)
    : [];
  const kitchen = cleared ? await getKitchenSettings() : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Camp settings"
        title="Camp settings"
        description="Your camp's teams, the year everything is filed under, and the kitchen."
      />

      {cleared ? (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <TeamSettingsManager teams={teams} />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
                  The camp&apos;s year
                </CardTitle>
                <CardDescription>
                  Say what year the camp is in, and when it moves on to the next
                  burn, say so here. You see exactly which questionnaires go out
                  again before anything changes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/captains/camp-settings/cycle">
                    Open the camp&apos;s year
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {kitchen && <KitchenSettingsCard settings={kitchen} />}
          </div>
        </div>
      ) : (
        <CaptainLock message="Camp settings are captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}

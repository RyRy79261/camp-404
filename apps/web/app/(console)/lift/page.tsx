import { PageHeading } from "@camp404/ui/components/page-heading";
import { LiftCard } from "@/components/home/home-view";
import { liftCard } from "@/lib/home";
import { getMyLift } from "@/lib/lifts";
import { requireMemberPage } from "@/lib/member-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "My lift — Camp 404" };

/**
 * My lift (the owner's decision 11 A, 2026-09-26): the member's own car or
 * seat this year, the same card Home shows. The program manifest offers it to
 * a driver and to a member with a seat; the page itself is open to every
 * approved member and says so plainly when they have neither. Nothing links
 * here yet: the 404 OS desktop (PR C) draws its icon.
 */
export default async function MyLiftPage() {
  const { campUser } = await requireMemberPage();
  const lift = liftCard(await getMyLift(campUser.id));

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My lift"
        title="My lift"
        description="Your car or your seat for this year's burn."
      />
      {lift ? (
        <LiftCard lift={lift} />
      ) : (
        <p className="text-sm text-muted-foreground">
          You are not driving this year, and you have no seat in anyone&apos;s
          car yet.
        </p>
      )}
    </div>
  );
}

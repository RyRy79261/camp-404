import Link from "next/link";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { LiftPanel } from "@/components/transport/lift-panel";
import { getMyLift } from "@/lib/lifts";
import { requireMemberPage } from "@/lib/member-gate";
import {
  getTransportBoard,
  liftRequestsFor,
  listLiftRequests,
} from "@/lib/transport";
import { TRANSPORT_PATH } from "@/lib/transport-copy";
import { liftPanel } from "@/lib/transport-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "My lift — Camp 404" };

/**
 * My lift (the owner's decision 11 A, 2026-09-26; laid out as the approved
 * Option A, 2026-10-01): the member's own car or seat this year, the same
 * labelled panel as the top of Transport. A rider reads who drives, the car,
 * where from and when, and who else rides; a driver also answers the people
 * asking to ride and takes riders out; a member with neither asks for a lift
 * here. Plain text, so a saved copy still reads on the road.
 *
 * Lift requests are filtered on the server (liftRequestsFor): a member sees
 * their own, a driver the ones for their car. The page is open to every
 * approved member (the manifest offers its icon only to a driver or a rider).
 */
export default async function MyLiftPage() {
  const { campUser } = await requireMemberPage();
  const me = campUser.id;
  const [lift, board, requests] = await Promise.all([
    getMyLift(me),
    getTransportBoard(),
    listLiftRequests(),
  ]);
  const panel = liftPanel({
    me,
    lift,
    cars: board.cars,
    requests: liftRequestsFor(requests, { userId: me, canEdit: false }),
  });

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My lift"
        title="My lift"
        description="Your car or your seat for this year's burn."
      />
      <LiftPanel panel={panel} me={me} layout="stack" />
      {panel.kind !== "none" && (
        <p className="mt-3 mb-0">
          <Link
            href={TRANSPORT_PATH}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            See every car on Transport
          </Link>
        </p>
      )}
    </div>
  );
}

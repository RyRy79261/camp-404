import {
  PinnedAnnouncementBanner,
  PinnedAnnouncementScroller,
  PinnedAnnouncementSlot,
} from "@camp404/ui/components/pinned-announcement-banner";
import { listPinnedForUser } from "@/lib/notifications";

// The pinned-announcement banner for the console shell, from AfrikaBurn's
// `PinnedBulletinBanner` above the camp dashboard.
//
// A server component with no client half: a member with no pins renders
// nothing at all — no wrapper, no markup, no JavaScript. The read is one
// indexed query (a partial index on the pinned rows) joined to this member's
// own deliveries, so who sees a pin was settled at fan-out and is not
// re-decided here.
//
// EVERY pin that applies shows (owner's call, 2026-09-22) — the scroller
// carries them and names the count, so a fourth pin is never silently dropped.
// The order comes from `sortPinned` in @camp404/core, applied by the read:
// newest pinned first, a captain's pin above a lead's on a tie.
export async function PinnedAnnouncements({ userId }: { userId: string }) {
  const pins = await listPinnedForUser(userId);
  if (pins.length === 0) return null;
  const single = pins.length === 1;

  return (
    <PinnedAnnouncementScroller count={pins.length} className="mb-6">
      {pins.map((pin) => (
        <PinnedAnnouncementSlot key={pin.id} single={single}>
          <PinnedAnnouncementBanner
            title={pin.title}
            href={`/announcements/${pin.id}`}
            className={single ? undefined : "h-full"}
          />
        </PinnedAnnouncementSlot>
      ))}
    </PinnedAnnouncementScroller>
  );
}

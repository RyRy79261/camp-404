// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KITCHEN_ALLERGENS, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// The Safety and Communications & HR team panels' counts, through
// lib/team-glance-counts.ts, on the database and on the E2E store: the same
// people counted the same way, and the same refusal for a viewer who is not
// a captain or a Safety lead. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { saveMyDietary } from "../dietary";
import { createAnnouncementDraft, publishAnnouncement } from "../notifications";
import {
  countAnnouncementsSince,
  countTelegramReach,
  getSafetyCountsFor,
} from "../team-glance-counts";
import {
  connectTelegram,
  createTelegramLinkCode,
} from "../telegram-connection";
import { setEmergencyContacts, upsertBurnerProfile } from "../users";

const [NUTS] = KITCHEN_ALLERGENS;

describe("team page counts: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("counts the Safety figures for a captain or a Safety lead, and refuses anyone else", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const safetyLead = await seed.user("Medic");
      await seed.lead(safetyLead, Team.enum.health_and_safety);
      // Coming, with a contact, a finished profile and an anaphylaxis.
      await seed.participation(p.member, "accepted");
      await setEmergencyContacts(p.member, [
        { name: "Jo", phone: "0820000000", relationship: "sister" },
      ]);
      await upsertBurnerProfile({
        userId: p.member,
        version: "v1",
        responses: {},
        markComplete: true,
      });
      await saveMyDietary({
        userId: p.member,
        foods: [{ food: NUTS!, reaction: "anaphylaxis" }],
        diets: [],
      });
      // Coming, nothing done.
      await seed.participation(p.other, "applied");
      // A Maybe is not counted.
      await seed.participation(p.kitchenLead, "maybe");
      return {
        captain: await getSafetyCountsFor(p.captain),
        lead: await getSafetyCountsFor(safetyLead),
        kitchenLead: await getSafetyCountsFor(p.kitchenLead),
        member: await getSafetyCountsFor(p.member),
      };
    });
    const counts = {
      coming: 2,
      noEmergencyContact: 1,
      burnerProfileDone: 1,
      anaphylactic: 1,
      allergiesNoted: 1,
    };
    expect(db).toEqual({
      captain: counts,
      lead: counts,
      kitchenLead: null,
      member: null,
    });
    expect(store).toEqual(db);
  });

  it("counts Ol' Jeb's reach and the announcements published since a day", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await connectTelegram({
        code: await createTelegramLinkCode(p.member),
        telegramUserId: "777",
        username: "nova",
      });
      const before = await countAnnouncementsSince(new Date(0));
      const { id } = await createAnnouncementDraft({
        senderId: p.captain,
        title: "Hello",
        body: "Hi camp",
        presentation: "feed",
        audience: { scope: "everyone" },
        pinned: false,
      });
      await createAnnouncementDraft({
        senderId: p.captain,
        title: "Still a draft",
        body: "Hi",
        presentation: "feed",
        audience: { scope: "everyone" },
        pinned: false,
      });
      await publishAnnouncement({ id, senderId: p.captain });
      return {
        reach: await countTelegramReach(),
        before,
        after: await countAnnouncementsSince(new Date(0)),
        future: await countAnnouncementsSince(
          new Date(Date.now() + 86_400_000),
        ),
      };
    });
    expect(db).toEqual({
      reach: { connected: 1, members: 5 },
      before: 0,
      after: 1,
      future: 0,
    });
    expect(store).toEqual(db);
  });
});

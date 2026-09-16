import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  DRAFT_MISSING,
  DRAFT_NOT_YOURS,
  DRAFT_PUBLISHED,
  explainDraftRefusal,
  publishAnnouncement,
  updateAnnouncementDraft,
} from "../broadcasts";

// A draft write claims its row with one predicate (owned by the caller, still
// a draft), so a refusal cannot say which half failed. explainDraftRefusal
// reads the row to tell the captain the real cause. Each cause is a row shape
// a mock would invent, so these run against real Postgres.

const DRAFT = {
  title: "Burn-night briefing",
  body: "Meet at the effigy at 20:00.",
  presentation: "acknowledge" as const,
};

describe("explainDraftRefusal", () => {
  const h = useTestDb();

  it("says the draft is gone when no row has the id, or the id is malformed", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    expect(
      await explainDraftRefusal(
        "00000000-0000-4000-8000-000000000000",
        captain.id,
      ),
    ).toBe(DRAFT_MISSING);
    expect(await explainDraftRefusal("not-a-uuid", captain.id)).toBe(
      DRAFT_MISSING,
    );
  });

  it("says a deleted draft is gone", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    expect(await deleteAnnouncementDraft({ id, senderId: captain.id })).toBe(
      true,
    );
    expect(await deleteAnnouncementDraft({ id, senderId: captain.id })).toBe(
      false,
    );
    expect(await explainDraftRefusal(id, captain.id)).toBe(DRAFT_MISSING);
  });

  it("names the author when another captain edits the draft", async () => {
    const author = await makeUser(h.db(), { rank: "captain" });
    const other = await makeUser(h.db(), { rank: "captain" });
    const { id } = await createAnnouncementDraft({
      senderId: author.id,
      ...DRAFT,
    });
    expect(
      await updateAnnouncementDraft({ id, senderId: other.id, ...DRAFT }),
    ).toBe(false);
    expect(await explainDraftRefusal(id, other.id)).toBe(DRAFT_NOT_YOURS);
  });

  it("says a published announcement is final, and publish passes that on", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    await makeUser(h.db(), { approvalStatus: "approved" });
    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    expect(
      await publishAnnouncement({ id, senderId: captain.id }),
    ).toMatchObject({ ok: true });
    expect(
      await updateAnnouncementDraft({ id, senderId: captain.id, ...DRAFT }),
    ).toBe(false);
    expect(await explainDraftRefusal(id, captain.id)).toBe(DRAFT_PUBLISHED);
    expect(await publishAnnouncement({ id, senderId: captain.id })).toEqual({
      ok: false,
      error: DRAFT_PUBLISHED,
    });
  });
});

describe("countAnnouncementAudience", () => {
  const h = useTestDb();

  it("counts the members a publish would reach: approved, not the sender", async () => {
    const captain = await makeUser(h.db(), {
      rank: "captain",
      approvalStatus: "approved",
    });
    await makeUser(h.db(), { approvalStatus: "approved" });
    await makeUser(h.db(), { approvalStatus: "approved" });
    await makeUser(h.db(), { approvalStatus: "pending" });
    await makeUser(h.db(), { approvalStatus: "approved", isSystem: true });

    const counted = await countAnnouncementAudience(captain.id);
    expect(counted).toBe(2);

    const { id } = await createAnnouncementDraft({
      senderId: captain.id,
      ...DRAFT,
    });
    const published = await publishAnnouncement({ id, senderId: captain.id });
    expect(published).toEqual({ ok: true, recipientCount: counted });
  });
});

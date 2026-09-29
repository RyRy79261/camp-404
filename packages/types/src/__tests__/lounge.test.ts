import { describe, expect, it } from "vitest";
import {
  DecideLoungeOfferInput,
  EditLoungeOfferInput,
  LoungeMusicPolicyInput,
  LoungeOfferInput,
  PlaceLoungeOfferInput,
} from "../lounge";

// The lounge programme's shapes (#269): what a member may offer, how a
// decision must be put, and where an item may be placed.

const OFFER = {
  title: "Sunset set",
  kind: "dj_set",
  durationMinutes: 90,
};

function issue(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.success ? null : result.error!.issues[0]!.message;
}

describe("LoungeOfferInput", () => {
  it("fills the defaults and reads a blank field as no answer", () => {
    expect(
      LoungeOfferInput.parse({ ...OFFER, description: " ", needsNote: "" }),
    ).toEqual({
      ...OFFER,
      description: null,
      needsNote: null,
      needs: [],
      preferredDays: [],
      preferredBands: [],
      recurring: false,
      publicGuide: false,
    });
  });

  it("refuses a length off the 15-minute steps", () => {
    expect(
      issue(LoungeOfferInput.safeParse({ ...OFFER, durationMinutes: 50 })),
    ).toBe("Use steps of 15 minutes.");
  });

  it("refuses a need, a day or a time ticked twice", () => {
    expect(
      issue(
        LoungeOfferInput.safeParse({ ...OFFER, needs: ["sound", "sound"] }),
      ),
    ).toBe("Tick each need once.");
    expect(
      issue(LoungeOfferInput.safeParse({ ...OFFER, preferredDays: [2, 2] })),
    ).toBe("Tick each day once.");
    expect(
      issue(
        LoungeOfferInput.safeParse({
          ...OFFER,
          preferredBands: ["night", "night"],
        }),
      ),
    ).toBe("Tick each time once.");
  });

  it("refuses a day past the Burn and a blank name", () => {
    expect(
      issue(LoungeOfferInput.safeParse({ ...OFFER, preferredDays: [15] })),
    ).toBe("Pick a day of the Burn.");
    expect(issue(LoungeOfferInput.safeParse({ ...OFFER, title: "  " }))).toBe(
      "Give it a name.",
    );
  });

  it("takes an edit only with the offer and the version the host saw", () => {
    expect(EditLoungeOfferInput.safeParse(OFFER).success).toBe(false);
    expect(
      EditLoungeOfferInput.safeParse({
        ...OFFER,
        offerId: "o1",
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });
});

describe("DecideLoungeOfferInput", () => {
  const base = { offerId: "o1", expectedStatus: "offered", expectedVersion: 1 };

  it("accepts without a reason, and needs one to decline", () => {
    expect(
      DecideLoungeOfferInput.safeParse({ ...base, decision: "accepted" })
        .success,
    ).toBe(true);
    expect(
      issue(
        DecideLoungeOfferInput.safeParse({ ...base, decision: "declined" }),
      ),
    ).toBe("Say why, so the host knows what to do.");
  });

  it("refuses a decision that changes nothing", () => {
    expect(
      issue(
        DecideLoungeOfferInput.safeParse({
          ...base,
          expectedStatus: "declined",
          decision: "declined",
          reason: "No",
        }),
      ),
    ).toBe("It already has that answer.");
  });
});

describe("PlaceLoungeOfferInput and the music note", () => {
  it("places on a 15-minute step within the day", () => {
    expect(
      PlaceLoungeOfferInput.safeParse({
        offerId: "o",
        day: 1,
        startMinute: 1425,
      }).success,
    ).toBe(true);
    expect(
      issue(
        PlaceLoungeOfferInput.safeParse({
          offerId: "o",
          day: 1,
          startMinute: 10,
        }),
      ),
    ).toBe("Use steps of 15 minutes.");
  });

  it("keeps a music note to its length, and a blank one is none", () => {
    expect(
      LoungeMusicPolicyInput.parse({ musicPolicy: " ", expectedVersion: 0 })
        .musicPolicy,
    ).toBe(null);
    expect(
      LoungeMusicPolicyInput.safeParse({
        musicPolicy: "x".repeat(2001),
        expectedVersion: 0,
      }).success,
    ).toBe(false);
  });
});

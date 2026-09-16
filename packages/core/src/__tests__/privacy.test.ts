import { describe, expect, it } from "vitest";

import {
  ALWAYS_PRIVATE,
  MEMBER_FIELD_READERS,
  PROFILE_ANSWER_READERS,
  SAFETY_VISIBLE,
  canReadMemberField,
  canReadProfileAnswer,
  isFieldLocked,
  isSafetyVisible,
  patchLeaksAny,
  safetyReadBasis,
  uncoveredPrivateUserColumns,
} from "../privacy";

describe("ALWAYS_PRIVATE", () => {
  it("names the government ID answer key and both encrypted ID columns", () => {
    // `id.number` is ID_NUMBER_KEY in @camp404/db/id-documents; the columns are
    // users.passport_encrypted / users.sa_id_encrypted.
    expect(ALWAYS_PRIVATE.has("id.number")).toBe(true);
    expect(ALWAYS_PRIVATE.has("passportEncrypted")).toBe(true);
    expect(ALWAYS_PRIVATE.has("saIdEncrypted")).toBe(true);
  });

  it("names the EFT details column", () => {
    expect(ALWAYS_PRIVATE.has("eftDetailsEncrypted")).toBe(true);
  });

  it("does not swallow ordinary self-expression answers", () => {
    expect(ALWAYS_PRIVATE.has("bio.statement")).toBe(false);
    expect(ALWAYS_PRIVATE.has("ideas.this_year")).toBe(false);
    // id.type is not sensitive and deliberately stays in `responses`.
    expect(ALWAYS_PRIVATE.has("id.type")).toBe(false);
  });
});

describe("SAFETY_VISIBLE", () => {
  it("names all three emergency fields", () => {
    expect(isSafetyVisible("emergencyContacts")).toBe(true);
    expect(isSafetyVisible("allergies")).toBe(true);
    expect(isSafetyVisible("isAnaphylactic")).toBe(true);
    expect(SAFETY_VISIBLE.size).toBe(3);
  });

  it("does not classify a private field as safety-visible", () => {
    expect(isSafetyVisible("id.number")).toBe(false);
  });
});

describe("isFieldLocked", () => {
  it("locks an always-private key regardless of the descriptor", () => {
    expect(isFieldLocked("id.number")).toBe(true);
    expect(isFieldLocked("id.number", { locked: false })).toBe(true);
    expect(isFieldLocked("eftDetailsEncrypted", {})).toBe(true);
  });

  it("honours the author's lock on any other field", () => {
    expect(isFieldLocked("bio.statement", { locked: true })).toBe(true);
    expect(isFieldLocked("bio.statement", { locked: false })).toBe(false);
    expect(isFieldLocked("bio.statement")).toBe(false);
  });

  it("leaves safety-visible fields unlocked by default", () => {
    expect(isFieldLocked("allergies")).toBe(false);
    expect(isFieldLocked("emergencyContacts")).toBe(false);
  });
});

describe("MEMBER_FIELD_READERS agrees with the two privacy classes", () => {
  /** A registry entry for a class key, wherever the key lives. */
  function readersOf(key: string): string[] {
    const columns = Object.entries(MEMBER_FIELD_READERS)
      .filter(([field]) => field.endsWith(`.${key}`))
      .map(([, reader]) => reader);
    const answer = PROFILE_ANSWER_READERS[key];
    return answer ? [...columns, answer] : columns;
  }

  it("keeps every always-private column captain-only", () => {
    for (const key of ALWAYS_PRIVATE) {
      if (key === "id.number") {
        // An answer key: unlisted answers are captain-only.
        expect(PROFILE_ANSWER_READERS[key]).toBeUndefined();
        continue;
      }
      expect(`${key}: ${readersOf(key).join(",")}`).toBe(`${key}: captain`);
    }
  });

  it("opens every safety field to team leads, and no lower", () => {
    for (const key of SAFETY_VISIBLE) {
      expect(`${key}: ${readersOf(key).join(",")}`).toBe(`${key}: team_lead`);
    }
  });
});

describe("canReadMemberField", () => {
  const member = { rank: "camp_member" as const, isSelf: false };
  const lead = { rank: "team_lead" as const, isSelf: false };
  const captain = { rank: "captain" as const, isSelf: false };

  it("lets any member read what the member roster shows", () => {
    for (const field of [
      "users.displayName",
      "users.telegramHandle",
      "users.rank",
      "teamMemberships.team",
      "teamMemberships.isLead",
    ]) {
      expect(canReadMemberField(member, field)).toBe(true);
    }
  });

  it("opens safety data to a team lead but not to a member", () => {
    expect(canReadMemberField(member, "users.emergencyContacts")).toBe(false);
    expect(canReadMemberField(lead, "users.emergencyContacts")).toBe(true);
    expect(canReadMemberField(lead, "dietaryRequirements.allergies")).toBe(
      true,
    );
  });

  it("keeps ID numbers, dues and travel captain-only", () => {
    for (const field of [
      "users.saIdEncrypted",
      "users.duesPaid",
      "driverProfiles.arrivalAt",
    ]) {
      expect(canReadMemberField(lead, field)).toBe(false);
      expect(canReadMemberField(captain, field)).toBe(true);
    }
  });

  it("lets a member read all of their own data", () => {
    expect(
      canReadMemberField(
        { rank: "camp_member", isSelf: true },
        "users.saIdEncrypted",
      ),
    ).toBe(true);
  });

  it("refuses an unlisted field or an unknown rank, even for a captain", () => {
    expect(canReadMemberField(captain, "users.somethingNew")).toBe(false);
    expect(
      canReadMemberField(
        { rank: "owner" as never, isSelf: false },
        "users.displayName",
      ),
    ).toBe(false);
  });
});

describe("canReadProfileAnswer", () => {
  it("lets a member read the public answers and nothing else", () => {
    const member = { rank: "camp_member" as const, isSelf: false };
    expect(canReadProfileAnswer(member, "bio.statement")).toBe(true);
    expect(canReadProfileAnswer(member, "country")).toBe(true);
    expect(canReadProfileAnswer(member, "phone")).toBe(false);
    expect(canReadProfileAnswer(member, "a.brand.new.question")).toBe(false);
  });

  it("keeps every other answer, the ID number included, captain-only", () => {
    const lead = { rank: "team_lead" as const, isSelf: false };
    const captain = { rank: "captain" as const, isSelf: false };
    expect(canReadProfileAnswer(lead, "id.number")).toBe(false);
    expect(canReadProfileAnswer(captain, "id.number")).toBe(true);
    expect(canReadProfileAnswer(captain, "phone")).toBe(true);
  });
});

describe("uncoveredPrivateUserColumns", () => {
  it("names each private users column the patch leaves set", () => {
    expect(
      uncoveredPrivateUserColumns({
        passportEncrypted: null,
        saIdEncrypted: "ciphertext",
        emergencyContacts: [],
      }).sort(),
    ).toEqual(["eftDetailsEncrypted", "emergencyContacts", "saIdEncrypted"]);
  });

  it("ignores keys that do not live on users", () => {
    // id.number, allergies and isAnaphylactic live in rows erasure deletes.
    expect(
      uncoveredPrivateUserColumns({
        passportEncrypted: null,
        saIdEncrypted: null,
        eftDetailsEncrypted: null,
        emergencyContacts: null,
      }),
    ).toEqual([]);
  });
});

describe("patchLeaksAny", () => {
  it("finds a person's value anywhere in the patch, in any case", () => {
    expect(
      patchLeaksAny({ nested: { note: "Call GRACE on Sunday" } }, ["grace"]),
    ).toBe(true);
  });

  it("is false for a clean patch or no values to look for", () => {
    expect(patchLeaksAny({ displayName: "Lost Cat #7" }, ["Grace"])).toBe(
      false,
    );
    expect(
      patchLeaksAny({ displayName: "Grace" }, [null, "  ", undefined]),
    ).toBe(false);
  });
});

describe("safetyReadBasis", () => {
  it("names the basis for the member, a captain and any team lead", () => {
    expect(safetyReadBasis({ rank: "camp_member", isSelf: true })).toBe("self");
    expect(safetyReadBasis({ rank: "captain", isSelf: false })).toBe("captain");
    expect(safetyReadBasis({ rank: "team_lead", isSelf: false })).toBe(
      "team_lead",
    );
  });

  it("refuses another member and an unknown rank", () => {
    expect(safetyReadBasis({ rank: "camp_member", isSelf: false })).toBeNull();
    expect(
      safetyReadBasis({ rank: "medic" as never, isSelf: false }),
    ).toBeNull();
  });
});

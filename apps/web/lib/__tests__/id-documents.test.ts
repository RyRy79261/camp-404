import { describe, it, expect } from "vitest";
import type { CampMemberDetail } from "@camp404/db/roster";
import {
  splitIdNumber,
  mergeIdNumber,
  idColumnsFor,
  ID_NUMBER_KEY,
} from "@camp404/db/id-documents";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { presentMemberDetail } from "../member-detail";
import { buildQuestionnaire } from "../questionnaire";

const DEFAULT_QUESTIONNAIRE = buildQuestionnaire(
  DEFAULT_TEAMS.map((t) => ({ value: t.key, label: t.label })),
);

describe("splitIdNumber", () => {
  it("removes id.number, returns idType + idNumber, keeps id.type", () => {
    const { cleaned, idType, idNumber } = splitIdNumber({
      "id.type": "passport",
      "id.number": "A12345678",
      phone: "+27",
    });
    expect(idNumber).toBe("A12345678");
    expect(idType).toBe("passport");
    expect(cleaned[ID_NUMBER_KEY]).toBeUndefined();
    expect(cleaned["id.type"]).toBe("passport");
    expect(cleaned.phone).toBe("+27");
  });

  it("returns null idNumber when absent or empty", () => {
    expect(splitIdNumber({ "id.type": "sa_id", "id.number": "" }).idNumber).toBeNull();
    expect(splitIdNumber({ "id.type": "sa_id", "id.number": "   " }).idNumber).toBeNull();
    expect(splitIdNumber({ phone: "x" }).idNumber).toBeNull();
  });
});

describe("mergeIdNumber", () => {
  it("restores id.number + id.type into responses", () => {
    const merged = mergeIdNumber(
      { phone: "+27" },
      { idType: "sa_id", idNumber: "9001015800089" },
    );
    expect(merged["id.number"]).toBe("9001015800089");
    expect(merged["id.type"]).toBe("sa_id");
  });

  it("is a no-op when idNumber is null", () => {
    const merged = mergeIdNumber({ phone: "+27" }, { idType: null, idNumber: null });
    expect(merged["id.number"]).toBeUndefined();
  });

  it("round-trips with splitIdNumber", () => {
    const original = { "id.type": "passport", "id.number": "A12345678", phone: "+27" };
    const { cleaned, idType, idNumber } = splitIdNumber(original);
    expect(mergeIdNumber(cleaned, { idType, idNumber })).toEqual(original);
  });
});

describe("idColumnsFor", () => {
  it("routes passport to passportEncrypted and nulls the other", () => {
    expect(idColumnsFor("passport", "ct")).toEqual({
      passportEncrypted: "ct",
      saIdEncrypted: null,
    });
  });
  it("routes sa_id to saIdEncrypted and nulls the other", () => {
    expect(idColumnsFor("sa_id", "ct")).toEqual({
      passportEncrypted: null,
      saIdEncrypted: "ct",
    });
  });
});

describe("captain member-detail render", () => {
  it("shows id.number once it has been merged into the responses", () => {
    const detail: CampMemberDetail = {
      id: "u1",
      displayName: "Test Burner",
      rank: "member",
      approvalStatus: "approved",
      approvalDecidedAt: null,
      approvalDecidedByName: null,
      onboardingComplete: true,
      onboardingVersion: "v",
      responses: mergeIdNumber(
        { "id.type": "passport" },
        { idType: "passport", idNumber: "A12345678" },
      ),
      passportEncrypted: null,
      saIdEncrypted: null,
      inviteCode: null,
      inviteNote: null,
      invitedByName: null,
      createdAt: new Date(),
    };
    const flat = presentMemberDetail(
      detail,
      DEFAULT_QUESTIONNAIRE,
    ).profileSections.flatMap((s) => s.items);
    expect(flat.some((i) => i.value === "A12345678")).toBe(true);
  });
});

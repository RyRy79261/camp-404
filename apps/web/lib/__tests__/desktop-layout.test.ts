// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MemberGate from "@/lib/member-gate";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../packages/db/src/__tests__/_factories";
import * as schema from "@camp404/db/schema";

// The member's saved desktop (decision 14 B). Two halves:
// - the E2E twin answers what the database answers (save, replace, refuse,
//   and a stored value that is not a layout), so Playwright can drive it;
// - getMyDesktopLayout reads it beside the manifest and prunes it: a
//   shortcut or folder entry for a program the member does not have is
//   dropped, a bad stored value is the default layout, and a visitor with no
//   desktop gets none.

const store = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => store.on,
  usesTestStore: () => store.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("@/lib/member-gate", async (importActual) => ({
  ...(await importActual<typeof MemberGate>()),
  resolveMemberState: vi.fn(),
}));

import { DesktopLayoutInvalidError } from "@camp404/db/desktop-layouts";
import {
  desktopFolderKey,
  desktopTeamFolderKey,
  Team,
  type DesktopLayout,
} from "@camp404/types";
import { resolveMemberState, type MemberState } from "@/lib/member-gate";
import { testStore } from "../test-store";
import type { CampUser } from "../users";
import type { ProgramId } from "../program-routes";
import {
  buildProgramManifest,
  manifestForRank,
  type FolderId,
} from "../programs";
import {
  desktopLayoutAllowed,
  getMyDesktopLayout,
  saveDesktopLayoutFor,
} from "../desktop-layout";

// Program ids from the vocabulary the manifest uses (TypeScript checks them).
const TASKS: ProgramId = "tasks";
const INBOX: ProgramId = "inbox";
const AUDIT: ProgramId = "audit";
const RECIPE_REVIEW: ProgramId = "recipe-review";
// A desktop icon for a captain and not for a member: the Captains folder
// (the Audit log itself lives inside it, so it is never a desktop cell).
const CAPTAINS_FOLDER_ID: FolderId = "captains";
const CAPTAINS_FOLDER = desktopFolderKey(CAPTAINS_FOLDER_ID);

const LAYOUT: DesktopLayout = {
  cells: { [INBOX]: { c: 0, r: 2 }, "uf-1": { c: 1, r: 1 } },
  items: [{ kind: "folder", id: "uf-1", name: "Daily", items: [TASKS] }],
};

describe("desktop layout: the database and the test store agree", () => {
  const h = useTestDb();

  beforeEach(() => {
    store.on = false;
    testStore.reset();
  });
  afterEach(() => {
    store.on = false;
  });

  async function run(userId: string) {
    const saved = await saveDesktopLayoutFor(userId, LAYOUT);
    const moved = await saveDesktopLayoutFor(userId, {
      ...LAYOUT,
      cells: { [INBOX]: { c: 4, r: 0 } },
      items: [{ kind: "folder", id: "uf-1", name: " Renamed ", items: [] }],
    });
    const refused = await saveDesktopLayoutFor(userId, {
      cells: {},
      items: [{ kind: "shortcut", id: "sc-1", target: "/captains/audit" }],
    }).catch((err: unknown) => err);
    return { saved, moved, refused };
  }

  it("saves, replaces, and refuses what is not a layout", async () => {
    const member = await makeUser(h.db());
    const fromDb = await run(member.id);
    const { getDesktopLayout } = await import("@camp404/db/desktop-layouts");
    const dbRead = await getDesktopLayout(member.id);

    store.on = true;
    const sMember = testStore.createUser({
      authUserId: "auth-m",
      displayName: "M",
      inviteCode: "seed",
    });
    const fromStore = await run(sMember.id);
    const storeRead = testStore.getDesktopLayout(sMember.id);

    expect(fromDb.moved.items).toEqual([
      { kind: "folder", id: "uf-1", name: "Renamed", items: [] },
    ]);
    expect(fromDb.refused).toBeInstanceOf(DesktopLayoutInvalidError);
    expect(fromStore.refused).toBeInstanceOf(DesktopLayoutInvalidError);
    expect({ ...fromStore, refused: null }).toEqual({
      ...fromDb,
      refused: null,
    });
    expect(storeRead).toEqual(dbRead);
    expect(dbRead).toEqual(fromDb.moved);
  });

  it("reads a stored value that is not a layout as none", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db.insert(schema.desktopLayouts).values({
      userId: member.id,
      layout: { cells: "all" } as unknown as DesktopLayout,
    });
    const { getDesktopLayout } = await import("@camp404/db/desktop-layouts");

    store.on = true;
    const sMember = testStore.createUser({
      authUserId: "auth-m",
      displayName: "M",
      inviteCode: "seed",
    });
    testStore.seedRawDesktopLayout(sMember.id, { cells: "all" });

    expect(await getDesktopLayout(member.id)).toBeNull();
    expect(testStore.getDesktopLayout(sMember.id)).toBeNull();
  });
});

describe("desktopLayoutAllowed", () => {
  it("names the desktop's own icons by grid key, and every program the member may open", () => {
    const manifest = buildProgramManifest({
      mode: "full",
      approved: true,
      rank: "team_lead",
      memberships: [{ team: Team.enum.kitchen, isLead: true }],
      teams: [
        { key: Team.enum.kitchen, label: "Kitchen", archived: false, order: 0 },
      ],
      hasLift: false,
      inbox: 0,
      healthWarnings: null,
    });
    const allowed = desktopLayoutAllowed(manifest);
    const icons = [...allowed.icons];
    const programs = new Set(allowed.programs);

    expect(icons).toContain(INBOX);
    expect(icons).toContain(desktopFolderKey("kitchen"));
    expect(icons).toContain(desktopTeamFolderKey(Team.enum.kitchen));
    // A program inside a folder is a shortcut target, not a desktop icon.
    expect(icons).not.toContain(RECIPE_REVIEW);
    expect(programs.has(RECIPE_REVIEW)).toBe(true);
    expect(programs.has(`team:${Team.enum.kitchen}`)).toBe(true);
    expect(programs.has(AUDIT)).toBe(false);
  });

  it("lets a captain's layout name the captain programs", () => {
    const programs = new Set(
      desktopLayoutAllowed(manifestForRank("captain")).programs,
    );
    expect(programs.has(AUDIT)).toBe(true);
  });
});

describe("getMyDesktopLayout", () => {
  const AUTH = {
    id: "auth-me",
    primaryEmail: "me@example.com",
    displayName: "Me",
    emailVerified: true,
  };

  function campUserOf(user: ReturnType<typeof testStore.createUser>): CampUser {
    return {
      id: user.id,
      authUserId: user.authUserId,
      displayName: user.displayName,
      profileImageUrl: null,
      inviteCode: user.inviteCode,
      rank: user.rank,
      approvalStatus: user.approvalStatus,
      approvalDecisionReason: null,
    };
  }

  function asMember(
    campUser: CampUser,
    block: Extract<MemberState, { kind: "member" }>["block"] = null,
  ) {
    vi.mocked(resolveMemberState).mockResolvedValue({
      kind: "member",
      authUser: AUTH,
      campUser,
      block,
    });
  }

  function member(rank: "member" | "captain" = "member") {
    return testStore.createUser({
      authUserId: AUTH.id,
      displayName: "Me",
      inviteCode: "seed",
      rank,
    });
  }

  const FORGED: DesktopLayout = {
    cells: {
      [INBOX]: { c: 3, r: 0 },
      [CAPTAINS_FOLDER]: { c: 0, r: 0 },
      "sc-1": { c: 1, r: 0 },
      "sc-2": { c: 2, r: 0 },
      "uf-1": { c: 4, r: 0 },
    },
    items: [
      { kind: "shortcut", id: "sc-1", target: AUDIT },
      { kind: "shortcut", id: "sc-2", target: TASKS },
      { kind: "folder", id: "uf-1", name: "Mine", items: [AUDIT, TASKS] },
    ],
  };

  beforeEach(() => {
    store.on = true;
    testStore.reset();
  });
  afterEach(() => {
    store.on = false;
    vi.clearAllMocks();
  });

  it("gives a member with none saved the default (empty) layout", async () => {
    asMember(campUserOf(member()));
    expect(await getMyDesktopLayout()).toEqual({ cells: {}, items: [] });
  });

  it("drops what a plain member's manifest does not hold", async () => {
    const me = member();
    testStore.saveDesktopLayout(me.id, FORGED);
    asMember(campUserOf(me));

    expect(await getMyDesktopLayout()).toEqual({
      cells: {
        [INBOX]: { c: 3, r: 0 },
        "sc-2": { c: 2, r: 0 },
        "uf-1": { c: 4, r: 0 },
      },
      items: [
        { kind: "shortcut", id: "sc-2", target: TASKS },
        { kind: "folder", id: "uf-1", name: "Mine", items: [TASKS] },
      ],
    });
  });

  it("keeps a captain's shortcut to a captain program", async () => {
    const me = member("captain");
    testStore.saveDesktopLayout(me.id, FORGED);
    asMember(campUserOf(me));

    const layout = await getMyDesktopLayout();
    expect(layout?.items.map((item) => item.id)).toEqual([
      "sc-1",
      "sc-2",
      "uf-1",
    ]);
    expect(layout?.cells["sc-1"]).toEqual({ c: 1, r: 0 });
    // The Captains folder's cell is the captain's to keep.
    expect(layout?.cells[CAPTAINS_FOLDER]).toEqual({ c: 0, r: 0 });
  });

  it("reads a stored value that is not a layout as the default layout", async () => {
    const me = member();
    testStore.seedRawDesktopLayout(me.id, { cells: { inbox: "top left" } });
    asMember(campUserOf(me));
    expect(await getMyDesktopLayout()).toEqual({ cells: {}, items: [] });
  });

  it("gives no layout to a visitor with no desktop", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    expect(await getMyDesktopLayout()).toBeNull();

    const rejected = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "No",
      inviteCode: "seed",
      approvalStatus: "rejected",
    });
    testStore.saveDesktopLayout(rejected.id, LAYOUT);
    asMember(campUserOf(rejected), {
      reason: "approval",
      href: "/pending-approval",
    });
    expect(await getMyDesktopLayout()).toBeNull();
  });

  it("draws nothing of the member's own on a held desktop before approval", async () => {
    const pending = testStore.createUser({
      authUserId: AUTH.id,
      displayName: "New",
      inviteCode: "seed",
      approvalStatus: "pending",
    });
    testStore.saveDesktopLayout(pending.id, LAYOUT);
    asMember(campUserOf(pending), {
      reason: "questionnaire",
      href: "/questionnaires/q",
    });
    expect(await getMyDesktopLayout()).toEqual({ cells: {}, items: [] });
  });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { EMPTY_CAMP_BANK_DETAILS, ViewerRank } from "@camp404/types";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";
import type { PayGuideData } from "@/lib/pledge-view";

// The pay guide on the desktop (camp fees sprint, mock-up step 4 A): drawn on
// a full desktop, outside every window, so a frozen copy never holds it; never
// over a blocking form or on the held desktop, never on an applicant's
// restricted desktop, and not at all without the server's say-so.

const nav = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: nav.refresh,
    prefetch: vi.fn(),
  }),
}));
vi.mock("@/app/(console)/desktop-layout-actions", () => ({
  saveDesktopLayoutAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));
vi.mock("@/app/(console)/dues/my-dues-forms", () => ({
  ProofDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

import { Desktop, type DesktopProps } from "../desktop-shell";
import { HeldScreen } from "../held-screen";

const GUIDE: PayGuideData = {
  refCode: "C404-M017",
  feeTotalCents: 720_000,
  paidCents: 0,
  next: {
    kind: "due",
    dueOn: "2026-11-30",
    amountCents: 360_000,
    overdue: false,
    first: true,
    source: "pledge",
  },
  bank: EMPTY_CAMP_BANK_DETAILS,
};

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: ViewerRank.enum.camp_member,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

function props(over: Partial<DesktopProps> = {}): DesktopProps {
  const mode = over.mode ?? "full";
  return {
    mode,
    manifest: buildProgramManifest(
      facts({ mode, approved: mode === "full" || mode === "held" }),
    ),
    layout: { cells: {}, items: [] },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: [] },
    payGuide: GUIDE,
    children: <h1>The page</h1>,
    ...over,
  };
}

const card = () => document.querySelector("[data-pay-guide]");

afterEach(cleanup);
beforeEach(() => {
  nav.pathname = "/";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("the pay guide on the desktop", () => {
  it("rises from the tray on a full desktop, outside every window", () => {
    nav.pathname = "/tasks";
    render(<Desktop {...props()} />);
    const guide = card();
    expect(guide?.textContent).toMatch(/R\s3\s600,00 is due by 30 Nov/);
    expect(guide?.closest("[data-window]")).toBeNull();
    expect(document.getElementById("os-desktop")?.contains(guide!)).toBe(true);
  });

  it("is not drawn without the server's figures", () => {
    render(<Desktop {...props({ payGuide: null })} />);
    expect(card()).toBeNull();
  });

  it("never sits on the held desktop or over the blocking form", () => {
    nav.pathname = "/questionnaires/act-1";
    render(<Desktop {...props({ mode: "held" })} />);
    expect(card()).toBeNull();
    expect(document.querySelector("[data-pay-guide-banner]")).toBeNull();
  });

  it("goes the moment a page says a form holds the member", () => {
    nav.pathname = "/questionnaires/act-1";
    render(
      <Desktop {...props()}>
        <HeldScreen />
        <h1>The form</h1>
      </Desktop>,
    );
    expect(card()).toBeNull();
  });

  it("is not on an applicant's restricted desktop", () => {
    render(<Desktop {...props({ mode: "restricted" })} />);
    expect(card()).toBeNull();
  });
});

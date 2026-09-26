"use client";

import type { ReactNode } from "react";
import { AccountChip } from "./account-chip";
import type { DesktopAccount } from "./desktop-taskbar";

/**
 * The strip along the top of the desktop (the approved prototype's header):
 * "CAMP 404" lit like a tube and "<rank> console" beside it, the pinned
 * announcements between (from md up), and the member's account chip on the
 * right. Chrome, so its text cannot be selected; nothing on it moves on its
 * own. The words are drawn by CSS from data-label, not written into the page,
 * so they never collide with the same words in a window's page.
 */
export function DesktopHeader({
  account,
  onOpenAccount,
  pins,
  phoneTray,
}: {
  account: DesktopAccount;
  onOpenAccount: () => void;
  /** The pinned-announcements ticker, drawn from md up. */
  pins?: ReactNode;
  /**
   * Tray items a phone has no taskbar for (the system-health icon, owner
   * 2026-09-25: "the warning icon indicator"), shown below md only.
   */
  phoneTray?: ReactNode;
}) {
  return (
    <header className="relative z-10 flex h-11 shrink-0 select-none items-center gap-4 border-b border-os-line/60 bg-os-bg/80 px-3 md:z-[90] md:px-4">
      <span className="flex shrink-0 items-baseline gap-2">
        <span
          aria-hidden
          data-label="Camp 404"
          className="os-glow font-pixel text-sm uppercase tracking-widest text-os-fg after:content-[attr(data-label)]"
        />
        <span
          aria-hidden
          data-label={`${account.rank} console`}
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-os-muted after:content-[attr(data-label)] max-lg:hidden"
        />
      </span>
      {pins && (
        <div className="flex min-w-0 max-w-xl flex-1 max-md:hidden">{pins}</div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {phoneTray && (
          <div className="flex items-center md:hidden">{phoneTray}</div>
        )}
        <AccountChip
          name={account.name}
          rank={account.rank}
          leads={account.leads}
          onOpen={onOpenAccount}
        />
      </div>
    </header>
  );
}

"use client";

import type { ReactNode } from "react";
import { AccountChip } from "./account-chip";
import type { DesktopAccount } from "./desktop-taskbar";

/**
 * The strip along the top of the desktop (the prototype's header): the camp's
 * name on the left and the member's account chip on the right. Chrome, so its
 * text cannot be selected; nothing on it moves or updates on its own.
 */
export function DesktopHeader({
  account,
  onOpenAccount,
  phoneTray,
}: {
  account: DesktopAccount;
  onOpenAccount: () => void;
  /**
   * Tray items a phone has no taskbar for (the system-health icon, owner
   * 2026-09-25: "the warning icon indicator"), shown below md only.
   */
  phoneTray?: ReactNode;
}) {
  return (
    <header className="relative flex h-11 md:z-[90] shrink-0 select-none items-center gap-4 border-b border-os-line/60 bg-os-bg/80 px-4">
      <span
        aria-hidden
        className="font-pixel text-sm uppercase tracking-widest text-os-fg"
      >
        Camp 404
      </span>
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

"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  TODAY_OPEN_KEY,
  TodayGadget,
  localStorageBoolean,
  usePhone,
  useStoredBoolean,
} from "@camp404/os";
import { burnCountdownLabel } from "@/lib/burn-countdown";
import { PhoneSheet } from "./phone-chrome";

/**
 * The phone's Today sheet, opened from the bottom bar (visual-language doc,
 * section 9). The desktop owns whether it is open, since the bar is the
 * desktop's; the page owns what it shows. It always starts closed on a hard
 * load, so the home screen shows first.
 */
export interface PhoneToday {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The Burn's dates, for the countdown, which moves into the sheet on a phone. */
  burn: { start: string; end: string } | null;
}

export const PhoneTodayContext = createContext<PhoneToday | null>(null);

/**
 * The Today gadget on the desktop page (owner, 2026-09-25: "I don't like it
 * being open the whole time"): closed by default, a handle on the right edge
 * opens it, and the choice is kept in this browser (`camp404.os.today-open`,
 * a boolean and nothing else). Its body is rendered on the server with the
 * page, so opening it needs no request; while closed it is not in the DOM.
 * It sits below every window (band 10).
 *
 * On a phone the handle is not drawn (CSS, so the first paint is right) and
 * the same body opens as a sheet from the bottom bar's Today instead. Only
 * one of the two ever holds the body.
 */
export function TodayGadgetPanel({
  count,
  children,
}: {
  /** Things due today, on the handle. */
  count: number;
  children: ReactNode;
}) {
  const [stored, setStored] = useStoredBoolean(
    localStorageBoolean(TODAY_OPEN_KEY),
  );
  const phone = usePhone();
  const sheet = useContext(PhoneTodayContext);
  // Only ever drawn after a tap on a phone, never on the server, so reading
  // the clock here cannot split the two paints.
  const countdown =
    phone && sheet?.open ? burnCountdownLabel(new Date(), sheet.burn) : null;
  return (
    <>
      <TodayGadget
        // The server paints it closed; a phone never opens it.
        open={stored && !phone}
        onOpenChange={setStored}
        count={count}
        className="absolute inset-y-0 right-0 max-md:hidden"
      >
        {children}
      </TodayGadget>
      {phone && sheet?.open && (
        <PhoneSheet title="Today" short onClose={() => sheet.setOpen(false)}>
          {countdown && (
            <p className="border-b border-os-line px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-os-fg">
              {countdown}
            </p>
          )}
          {children}
        </PhoneSheet>
      )}
    </>
  );
}

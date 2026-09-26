"use client";

import type { ComponentProps, MouseEvent } from "react";
import { forgetDeviceToken } from "@/components/push/device-token";
import { forgetAllWindows } from "@/components/os/window-storage";

export const SIGN_OUT_HREF = "/auth/sign-out";

/** How long sign-out waits for the token cleanup before it goes anyway. */
export const FORGET_TOKEN_TIMEOUT_MS = 2000;

/**
 * Every "Sign out" in the app. Before it follows the sign-out route it forgets
 * this tab's desktop windows and removes this device's push token, so the next person to use the device does not get
 * the last member's notifications. The cleanup gets two seconds; a slow network
 * never holds a member on a page they chose to leave.
 *
 * A plain link underneath (it works with Button asChild), and without
 * JavaScript it is just the sign-out link.
 */
export function SignOutLink({
  href = SIGN_OUT_HREF,
  onClick,
  children = "Sign out",
  ...props
}: ComponentProps<"a">) {
  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    // The desktop's window stack (layout only) belongs to this member; the
    // next person on this tab starts with a clean desktop.
    forgetAllWindows(window.sessionStorage);
    await Promise.race([
      forgetDeviceToken(),
      new Promise((resolve) => setTimeout(resolve, FORGET_TOKEN_TIMEOUT_MS)),
    ]);
    window.location.assign(href);
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

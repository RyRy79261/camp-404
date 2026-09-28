"use client";

import type { ComponentProps, MouseEvent } from "react";
import { forgetAllWindows } from "@/components/os/window-storage";

export const SIGN_OUT_HREF = "/auth/sign-out";

/**
 * Every "Sign out" in the app. Before it follows the sign-out route it forgets
 * this tab's desktop windows. The push token is forgotten on the sign-out page
 * itself (SignOutView), because erasure's redirect and a typed address reach
 * that page without this link.
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
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
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
    // The desktop's window stack (layout only) belongs to this member; the
    // next person on this tab starts with a clean desktop. The link then
    // follows its href as usual.
    forgetAllWindows(window.sessionStorage);
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

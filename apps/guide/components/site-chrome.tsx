import Link from "next/link";
import { APP_GUIDE_URL } from "@/lib/book";
import { ContentsMenu, type MenuSection } from "./contents-menu";

// The public guide's top bar and footer (#250's mock-up): the 404 mark and
// SURVIVAL GUIDE on the left, the way into the app for members on the right;
// on a phone a CONTENTS button opens the book's sections instead.

export function SiteHeader({
  menu,
}: {
  /** The book, on a chapter's page: the phone's CONTENTS sheet. */
  menu?: { sections: MenuSection[]; current: string };
}) {
  return (
    <header className="bar">
      <div className="bar-in">
        <Link className="brand" href="/" aria-label="Survival Guide contents">
          <span className="mark">404</span>
          <span className="name">SURVIVAL GUIDE</span>
        </Link>
        <span className="spacer" />
        <a className="members" href={APP_GUIDE_URL}>
          Camp 404 member? <b>The full guide is in the app →</b>
        </a>
        {menu ? (
          <ContentsMenu sections={menu.sections} current={menu.current} />
        ) : null}
      </div>
    </header>
  );
}

export function SiteFooter({
  checked,
  appLink = true,
}: {
  /** The contents page adds "Written by the camp, checked every year." */
  checked?: boolean;
  appLink?: boolean;
}) {
  return (
    <footer className="foot">
      <div className="foot-in">
        <span>
          Camp 404, a theme camp at AfrikaBurn.
          {checked ? " Written by the camp, checked every year." : ""}
        </span>
        {appLink ? (
          <a href={APP_GUIDE_URL}>Members: open the full guide</a>
        ) : null}
      </div>
    </footer>
  );
}

/** The padlock on the "more for camp members" line. */
export function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="10" height="7" />
      <path
        d="M4 6V4a3 3 0 0 1 6 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

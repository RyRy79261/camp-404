"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { APP_GUIDE_URL } from "@/lib/book";

// The phone's CONTENTS sheet (#250's mock-up, guide-site-chapter-phone-menu):
// the book's sections over the page, the open chapter marked. Only titles and
// addresses reach the browser. The sheet is put on <body>: the top bar's
// backdrop blur would otherwise hold a fixed sheet inside the bar.

export interface MenuSection {
  label: string;
  chapters: { slug: string; title: string }[];
}

export function ContentsMenu({
  sections,
  current,
}: {
  sections: MenuSection[];
  current: string;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="menu-btn"
        aria-expanded={open}
        aria-controls="contents-sheet"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          width="14"
          height="12"
          viewBox="0 0 14 12"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect width="14" height="2" />
          <rect y="5" width="14" height="2" />
          <rect y="10" width="14" height="2" />
        </svg>
        Contents
      </button>
      {open
        ? createPortal(
            <nav
              id="contents-sheet"
              className="sheet"
              aria-label="Contents"
              data-open={open}
            >
              <Link className="home" href="/" onClick={() => setOpen(false)}>
                ← Contents
              </Link>
              {sections.map((s) => (
                <div key={s.label}>
                  <h3>{s.label}</h3>
                  <ul>
                    {s.chapters.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/${c.slug}` as Route}
                          aria-current={c.slug === current ? "page" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          {c.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="members">
                Camp 404 member?{" "}
                <a href={APP_GUIDE_URL}>The full guide is in the app →</a>
              </p>
            </nav>,
            document.body,
          )
        : null}
    </>
  );
}

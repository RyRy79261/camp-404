"use client";

import { useEffect, useRef, useState } from "react";
import {
  ABOUT_CONTENTS_HEADING,
  ABOUT_SECTIONS,
  aboutAnchor,
} from "@camp404/types";
import { useJoinData } from "../join-data";
import { AboutWords, jumpTo } from "../about-words";

// About Camp 404 on one page (Caitlin, 2026-11-15: "in case people don't
// understand the individual icons, they can see it all on one page"), laid
// out as About Camp 404 in the app: the List of contents on the left, every
// section down the middle. In a narrow window the contents sit above the
// sections. The same words as the app's page and each section's window.

export function AboutWindow() {
  const { about } = useJoinData().content;
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string>(
    aboutAnchor(ABOUT_SECTIONS[0].key),
  );

  // Mark the section in view: an IntersectionObserver (an event, not a
  // loop), so nothing runs while the window sits still.
  useEffect(() => {
    const box = root.current?.closest<HTMLElement>("[data-window-body]");
    if (!box || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ABOUT_SECTIONS.find((s) => seen.get(aboutAnchor(s.key)));
        if (first) setCurrent(aboutAnchor(first.key));
      },
      { root: box, rootMargin: "0px 0px -60% 0px" },
    );
    for (const s of ABOUT_SECTIONS) {
      const el = document.getElementById(aboutAnchor(s.key));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      className="grid gap-6 p-5 @min-[40rem]/page:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <nav
        aria-label={ABOUT_CONTENTS_HEADING}
        className="self-start @min-[40rem]/page:sticky @min-[40rem]/page:top-0"
      >
        <p className="pb-2 font-pixel text-[10px] uppercase tracking-widest text-os-muted">
          {ABOUT_CONTENTS_HEADING}
        </p>
        <ul className="flex flex-col">
          {ABOUT_SECTIONS.map((s) => {
            const id = aboutAnchor(s.key);
            const on = id === current;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-current={on ? "location" : undefined}
                  onClick={() => {
                    setCurrent(id);
                    jumpTo(document.getElementById(id));
                  }}
                  className={`flex w-full gap-2 border-l-2 py-1.5 pl-3 text-left text-[13px] leading-5 hover:text-os-primary ${
                    on
                      ? "border-os-primary text-os-fg"
                      : "border-os-line text-os-muted"
                  }`}
                >
                  <span aria-hidden>{s.emoji}</span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* About 80 characters a line, as every page of long prose keeps. */}
      <div className="flex min-w-0 max-w-[46rem] flex-col gap-4">
        <section
          aria-label="Intro to Camp 404"
          className="border border-os-line bg-os-bg/60 p-4"
        >
          <AboutWords sectionsHere>{about.intro}</AboutWords>
        </section>
        {ABOUT_SECTIONS.map((s) => (
          <section
            key={s.key}
            id={aboutAnchor(s.key)}
            aria-labelledby={`${aboutAnchor(s.key)}-title`}
            className="border border-os-line bg-os-bg/60 p-4"
          >
            <h3
              id={`${aboutAnchor(s.key)}-title`}
              className="mb-3 flex items-baseline gap-2 font-pixel text-sm uppercase leading-tight text-os-fg"
            >
              <span aria-hidden>{s.emoji}</span>
              {s.title}
            </h3>
            <AboutWords sectionsHere>{about.sections[s.key]}</AboutWords>
          </section>
        ))}
      </div>
    </div>
  );
}

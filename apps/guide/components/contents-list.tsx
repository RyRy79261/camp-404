"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";

// The contents with its Find box (#250). The box filters, in the browser,
// titles and first sentences the server has already cut: there is no search
// over the stored text on the public site, which would let anyone test
// whether a private word is in a chapter.

export interface ContentsEntry {
  slug: string;
  number: number;
  title: string;
  excerpt: string;
  day: string;
  card: boolean;
  /** A team's chapter: its team, as a tag. */
  team: string | null;
}

export interface ContentsSection {
  number: number;
  label: string;
  entries: ContentsEntry[];
}

const two = (n: number) => String(n).padStart(2, "0");

export function ContentsList({ sections }: { sections: ContentsSection[] }) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const shown = sections
    .map((s) => ({
      ...s,
      entries: s.entries.filter(
        (e) =>
          q === "" ||
          e.title.toLowerCase().includes(q) ||
          e.excerpt.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.entries.length > 0);
  return (
    <>
      <div className="toc-tools">
        <label className="find">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a chapter"
            aria-label="Find a chapter"
            maxLength={100}
          />
        </label>
      </div>
      <div className="toc">
        {sections.length === 0 ? (
          <p className="none">
            No chapters are shared here yet. Camp members read the whole guide
            in the app.
          </p>
        ) : shown.length === 0 ? (
          <p className="none" role="status">
            No chapter here mentions &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          shown.map((s) => (
            <section key={s.label} className="part" aria-label={s.label}>
              <h2>
                <span className="n">{two(s.number)}</span>
                {s.label}
              </h2>
              <ol>
                {s.entries.map((e) => (
                  <li key={e.slug}>
                    <Link className="entry" href={`/${e.slug}` as Route}>
                      <span className="num">{two(e.number)}</span>
                      <span className="t">
                        {e.title}
                        {e.card ? (
                          <span className="tag card">Duty card</span>
                        ) : null}
                        {e.team ? (
                          <span className="tag team">{e.team}</span>
                        ) : null}
                      </span>
                      <span className="d">{e.day}</span>
                      {e.excerpt ? (
                        <span className="sub">{e.excerpt}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </>
  );
}

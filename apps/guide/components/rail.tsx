import Link from "next/link";
import type { Route } from "next";
import type { BookSection } from "@/lib/book";

// The reading page's side rail (#250's mock-up): every public section and its
// chapters, the open one marked, with its own headings beneath it.

export function Rail({
  book,
  current,
  headings,
}: {
  book: BookSection[];
  current: string;
  headings: { id: string; text: string }[];
}) {
  return (
    <nav className="rail" aria-label="Contents">
      <Link className="home" href="/">
        ← Contents
      </Link>
      {book.map((s) => (
        <div key={s.category}>
          <h3>{s.label}</h3>
          <ul>
            {s.chapters.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/${c.slug}` as Route}
                  aria-current={c.slug === current ? "page" : undefined}
                >
                  {c.title}
                </Link>
                {c.slug === current && headings.length > 0 ? (
                  <ul className="here" aria-label="On this page">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a href={`#${h.id}`}>{h.text}</a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

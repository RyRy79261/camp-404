"use client";

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

// When a page cannot be read (the database is down, say), the guide says so
// in its own look rather than Next's bare error, and offers another try. It
// names no chapter, so it gives away no more than the 404 page does.

export default function GuideError({ reset }: { reset: () => void }) {
  return (
    <>
      <SiteHeader />
      <main className="nf">
        <div className="big" aria-hidden="true">
          500
        </div>
        <h1>The guide could not be read just now.</h1>
        <p>Something went wrong on our side. Try again in a moment.</p>
        <div className="row">
          <button type="button" className="slab" onClick={() => reset()}>
            Try again
          </button>
          <Link className="link" href="/">
            Open the contents
          </Link>
        </div>
      </main>
      <SiteFooter appLink={false} />
    </>
  );
}

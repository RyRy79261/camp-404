import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { APP_GUIDE_URL } from "@/lib/book";

// The one answer for every address that is not a public chapter (#250): a
// slug never used, a draft, a chapter in a private section or kept members
// only all get this same page, so the site never says which exist.

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="nf">
        <div className="big" aria-hidden="true">
          404
        </div>
        <h1>This page isn&apos;t in the guide.</h1>
        <p>
          The link may be old, or the chapter is one we keep for camp members.
        </p>
        <div className="row">
          <Link className="slab" href="/">
            Open the contents
          </Link>
          <a className="link" href={APP_GUIDE_URL}>
            Member? Read it in the app
          </a>
        </div>
      </main>
      <SiteFooter appLink={false} />
    </>
  );
}

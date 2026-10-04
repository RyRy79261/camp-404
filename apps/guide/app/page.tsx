import { ContentsList, type ContentsSection } from "@/components/contents-list";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { APP_GUIDE_URL, buildBook, shortDay, teamName } from "@/lib/book";
import { publicChapters, teamLabels } from "@/lib/guide-data";

// The contents of survival-guide.camp-404.com (#250): the public sections, in
// the guide's order, each chapter numbered through the book with its first
// sentence. Rendered on every request: a section turned off is gone on the
// next load.

export const dynamic = "force-dynamic";

export default async function ContentsPage() {
  const [chapters, labels] = await Promise.all([
    publicChapters(),
    teamLabels(),
  ]);
  const sections: ContentsSection[] = buildBook(chapters).map((s) => ({
    number: s.number,
    label: s.label,
    entries: s.chapters.map((c) => ({
      slug: c.slug,
      number: c.number,
      title: c.title,
      excerpt: c.excerpt,
      day: shortDay(c.publishedAt),
      card: c.kind === "duty_card",
      team: c.team ? teamName(c.team, labels) : null,
    })),
  }));
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="cover">
          <div>
            <p className="kicker">CAMP 404 · AFRIKABURN</p>
            <h1>Survival Guide</h1>
            <p className="lede">
              What our camp has learnt about getting to the Tankwa Karoo, living
              in the dust for a week, and leaving it as we found it. Read it
              before you pack.
            </p>
          </div>
          <p className="aside">
            These are the chapters we share with anyone. Members read the whole
            guide, team pages included,{" "}
            <a href={APP_GUIDE_URL}>in the camp app</a>.
          </p>
        </div>
        <ContentsList sections={sections} />
      </main>
      <SiteFooter checked />
    </>
  );
}

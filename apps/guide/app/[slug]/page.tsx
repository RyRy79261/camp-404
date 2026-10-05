import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  headcountText,
  publicExcerpt,
  publicPieces,
  type PublicGuideChapter,
} from "@camp404/core";
import { GUIDE_CATEGORY_LABELS } from "@camp404/types";
import {
  DutyCardPage,
  dutyCardPageStyles,
} from "@camp404/ui/components/duty-card-print";
import { ChapterText } from "@/components/chapter-text";
import { PrintButton } from "@/components/print-button";
import { Rail } from "@/components/rail";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import {
  buildBook,
  chapterHeadings,
  chapterPageStyles,
  checkedFor,
  longDay,
  neighbours,
  publicCardParts,
  shortDay,
  siteChapterAddress,
  teamName,
  type BookChapter,
  type BookSection,
} from "@/lib/book";
import { publicChapter, publicChapters, teamLabels } from "@/lib/guide-data";
import { linkResolver } from "@/lib/links";

// One chapter or duty card on survival-guide.camp-404.com (#250). Only what a
// public page may show (the plan's section 2): its title, section, team,
// kind, the cut text, the card, the version and its day, "Checked for the
// <year> burn". Never an author, older versions, drafts or the shifts that use
// a card. A slug that is not public gets the same 404 as one never used.
//
// Rendered on every request, so an unpublish takes effect on the next load.
// Print is the browser's: a chapter on A4 with a running head and page
// numbers in the margin (chapterPageStyles); a card as the app prints it
// (@camp404/ui's DutyCardPage), without "Used by".

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const chapter = await publicChapter((await params).slug);
  if (!chapter) return { title: "Not in the guide" };
  const description =
    publicExcerpt(chapter.markdown) ||
    `${GUIDE_CATEGORY_LABELS[chapter.category]}: a chapter of Camp 404's Survival Guide.`;
  return {
    title: chapter.title,
    description,
    openGraph: {
      type: "article",
      siteName: "Camp 404",
      locale: "en_GB",
      title: chapter.title,
      description,
      url: `/${chapter.slug}`,
    },
  };
}

function Turn({
  previous,
  next,
}: {
  previous: BookChapter | null;
  next: BookChapter | null;
}) {
  return (
    <nav className="turn" aria-label="Next and previous">
      {previous ? (
        <Link href={`/${previous.slug}` as Route}>
          <small>← Previous</small>
          <span>{previous.title}</span>
        </Link>
      ) : (
        <Link href="/">
          <small>← Contents</small>
          <span>Survival Guide</span>
        </Link>
      )}
      {next ? (
        <Link className="next" href={`/${next.slug}` as Route}>
          <small>Next →</small>
          <span>{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

export default async function ChapterPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [chapter, all, labels] = await Promise.all([
    publicChapter(slug),
    publicChapters(),
    teamLabels(),
  ]);
  if (!chapter) notFound();

  const book = buildBook(all);
  const here = book
    .flatMap((s) => s.chapters)
    .find((c) => c.slug === chapter.slug);
  const { previous, next } = neighbours(book, chapter.slug);
  const section = GUIDE_CATEGORY_LABELS[chapter.category];
  const headings = chapterHeadings(chapter);
  const linkFor = linkResolver(new Map(all.map((c) => [c.slug, c.title])));
  const team = teamName(chapter.team, labels);
  const checked = checkedFor(chapter.cycleReviewed);
  const printed = longDay(new Date());
  const menu = {
    current: chapter.slug,
    sections: book.map((s: BookSection) => ({
      label: s.label,
      chapters: s.chapters.map((c) => ({ slug: c.slug, title: c.title })),
    })),
  };

  return (
    <>
      <SiteHeader menu={menu} />
      <main className="book">
        <Rail book={book} current={chapter.slug} headings={headings} />
        {chapter.kind === "duty_card" ? (
          <CardArticle
            chapter={chapter}
            number={here?.number ?? null}
            section={section}
            team={team}
            linkFor={linkFor}
            turn={<Turn previous={previous} next={next} />}
          />
        ) : (
          <article data-kind="chapter" aria-labelledby="chapter-title">
            <style>{chapterPageStyles(section, chapter.title)}</style>
            <p className="print-only pc-kicker">
              Camp 404 Survival Guide · {section}
            </p>
            <p className="crumb">
              <b>{section}</b>
              {here ? ` · Chapter ${here.number}` : ""}
            </p>
            <h1 id="chapter-title">{chapter.title}</h1>
            <div className="meta">
              <span>{team}</span>
              <span>Updated {longDay(chapter.publishedAt)}</span>
              {checked ? <span>{checked}</span> : null}
              <PrintButton label="Print" className="print-link" />
            </div>
            <ChapterText
              slug={chapter.slug}
              markdown={chapter.markdown}
              linkFor={linkFor}
            />
            <p className="print-only pc-end">
              Read it online: <b>{siteChapterAddress(chapter.slug)}</b> ·
              version {chapter.version} · printed {printed}
            </p>
            <Turn previous={previous} next={next} />
          </article>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function CardArticle({
  chapter,
  number,
  section,
  team,
  linkFor,
  turn,
}: {
  chapter: PublicGuideChapter;
  number: number | null;
  section: string;
  team: string;
  linkFor: ReturnType<typeof linkResolver>;
  turn: React.ReactNode;
}) {
  const card = publicCardParts(chapter);
  const printedShort = shortDay(new Date());
  // The card's own text as paper prints it: a card cannot have members-only
  // parts, but one cut anyway leaves no gap marker on paper.
  const paperText = publicPieces(chapter.markdown)
    .flatMap((p) => (p.gap ? [] : [p.markdown]))
    .join("\n\n");
  const footer = `Survival Guide · version ${chapter.version} · updated ${shortDay(chapter.publishedAt)} · ${siteChapterAddress(chapter.slug)}`;
  const hasText = chapter.markdown.trim() !== "";
  return (
    <article data-kind="duty_card" aria-labelledby="chapter-title">
      <p className="crumb">
        <b>{section}</b>
        {number ? ` · Chapter ${number}` : ""}
      </p>
      <div className="card-head">
        <h1 id="chapter-title">{chapter.title}</h1>
        <PrintButton label="Print card" className="slab" />
      </div>
      <div className="meta">
        <span>
          <span className="tag card" style={{ margin: 0 }}>
            Duty card
          </span>
        </span>
        <span>{chapter.team ? `${team} team` : team}</span>
        <span>
          Version {chapter.version} · updated {longDay(chapter.publishedAt)}
        </span>
      </div>
      {chapter.card ? (
        <div className="dc">
          {chapter.card.subRoles.length > 0 ? (
            <section aria-labelledby="dc-roles">
              <h2 id="dc-roles">Who&apos;s on it</h2>
              <ul className="roles" aria-label="Who's on it">
                {chapter.card.subRoles.map((r) => (
                  <li key={r.name}>
                    <b>{r.name}</b>
                    <span>{headcountText(r.min, Math.max(r.min, r.max))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="dc-steps">
            <h2 id="dc-steps">Steps, in order</h2>
            <ol className="steps" aria-label="Steps">
              {chapter.card.steps.map((s, i) => (
                <li key={i}>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
          {chapter.card.hardRules.length > 0 ? (
            <section className="rules" aria-labelledby="dc-rules">
              <h2 id="dc-rules">Hard rules</h2>
              <ul aria-label="Hard rules">
                {chapter.card.hardRules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {chapter.card.checklist.length > 0 ? (
            <section aria-labelledby="dc-check">
              <h2 id="dc-check">Lead&apos;s end-of-shift checklist</h2>
              <ul className="check" aria-label="Checklist">
                {chapter.card.checklist.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {card?.ask ? (
            <section aria-labelledby="dc-ask">
              <h2 id="dc-ask">Stuck?</h2>
              <p className="ask">
                Ask {card.ask.article} <b>{card.ask.role}</b>.
              </p>
            </section>
          ) : null}
          {hasText ? (
            <section aria-labelledby="dc-know">
              <h2 id="dc-know">Good to know</h2>
              <ChapterText
                slug={chapter.slug}
                markdown={chapter.markdown}
                linkFor={linkFor}
                className="know prose"
              />
            </section>
          ) : null}
        </div>
      ) : null}
      <p className="note">
        Print makes an A4 page, black on white: the same card the camp pins up
        on site.
      </p>
      {turn}

      {/* What Print puts on paper: the app's #348 card, without "Used by". */}
      {card ? (
        <div className="print-only print-card">
          <style>
            {`@page duty-card-0 { size: A4; margin: 12mm 12mm 14mm 6mm; }\n${dutyCardPageStyles([{ footer }], printedShort)}`}
          </style>
          <DutyCardPage
            print={{
              key: chapter.slug,
              title: chapter.title,
              team: chapter.team,
              teamLabel: team,
              draft: false,
              card,
              markdown: paperText,
              usedBy: [],
              footer,
            }}
            index={0}
            printed={printedShort}
            screenPage="page 1 of 1"
          />
        </div>
      ) : null}
    </article>
  );
}

import Link from "next/link";
import { Pencil, Ticket } from "lucide-react";
import { hasClearance } from "@camp404/core";
import { ABOUT_SECTIONS, ABOUT_TITLE, aboutAnchor } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { MarkdownBody } from "@camp404/ui/components/markdown-body";
import { PageHeading } from "@camp404/ui/components/page-heading";
import type { ReactNode } from "react";
import { getAboutCamp } from "@/lib/about";
import { programPage } from "@/lib/program-page";
import { AboutToc, type TocItem } from "./about-toc";

export const dynamic = "force-dynamic";

export const metadata = { title: "About Camp 404 — Camp 404" };

// About Camp 404 (#264): what the camp is, how it works, what a member puts
// in and gets out. It used to be a Notion page members were sent ("Intro to
// Camp 404"); now every member reads it here, word for word and in the same
// sections, highlights and colours (Caitlin, 2026-11-15). The words are the
// ones captains keep in the Join site program (one document for this page
// and join.camp-404.com, audited on save), so a captain gets a button to edit
// them and everyone else reads.
//
// Laid out as the approved redesign draws it (2026-10-01, Option A): in a
// wide window the List of contents on the left, the sections in the middle
// and a card on the right; in a narrower one the contents become a row of
// links over the sections.

const CONTENTS: TocItem[] = ABOUT_SECTIONS.map((s) => ({
  id: aboutAnchor(s.key),
  label: s.title,
}));

function ReadCard({
  id,
  title,
  emoji,
  children,
}: {
  id: string;
  title?: string;
  emoji?: string;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-label={title ? undefined : "Intro to Camp 404"}
      role="region"
      className="scroll-mt-4 p-4 page-sm:p-5"
    >
      {title ? (
        <h2
          id={`${id}-title`}
          className="mb-3 flex items-baseline gap-2 font-sans text-lg font-bold leading-6"
        >
          {emoji ? <span aria-hidden>{emoji}</span> : null}
          {title}
        </h2>
      ) : null}
      {children}
    </Card>
  );
}

const Words = ({ children }: { children: string }) => (
  <MarkdownBody marks className="text-sm leading-[22px]">
    {children}
  </MarkdownBody>
);

export default async function AboutPage() {
  const { rank } = await programPage("about");
  const { content } = await getAboutCamp();
  const about = content.about;
  const canEdit = hasClearance(rank, "captain");

  return (
    <div className="mx-auto flex w-full max-w-[70rem] flex-col">
      <PageHeading
        eyebrow="Camp / About"
        title={ABOUT_TITLE}
        description="What the camp is, how it works, and what you put in and get out."
        actions={
          canEdit ? (
            <div className="flex flex-col gap-1 page-sm:items-end">
              <Button asChild variant="outline" size="sm">
                <Link href="/captains/join-site">
                  <Pencil aria-hidden />
                  Edit in Join site
                </Link>
              </Button>
              <p className="text-xs leading-4 text-muted-foreground">
                Also changes join.camp-404.com
              </p>
            </div>
          ) : null
        }
      />

      <AboutToc items={CONTENTS} variant="row" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @min-[48rem]/page:grid-cols-[minmax(0,1fr)_15rem] @min-[60rem]/page:grid-cols-[12rem_minmax(0,44rem)_15rem]">
        <AboutToc items={CONTENTS} variant="column" />

        <div className="flex min-w-0 flex-col gap-4">
          <ReadCard id={aboutAnchor("intro")}>
            <Words>{about.intro}</Words>
          </ReadCard>
          {ABOUT_SECTIONS.map((s) => (
            <ReadCard
              key={s.key}
              id={aboutAnchor(s.key)}
              title={s.title}
              emoji={s.emoji}
            >
              <Words>{about.sections[s.key]}</Words>
            </ReadCard>
          ))}
        </div>

        <aside
          aria-label="Bringing someone?"
          className="flex min-w-0 flex-col gap-4 @min-[48rem]/page:sticky @min-[48rem]/page:top-0"
        >
          <Card className="flex flex-col gap-3 p-4 page-sm:p-5">
            <h2 className="flex items-center gap-2 font-pixel text-[11px] uppercase leading-4 tracking-[0.2em] [&_svg]:size-4 [&_svg]:text-accent">
              <Ticket aria-hidden />
              Bringing someone?
            </h2>
            <p className="text-sm text-muted-foreground">
              Send them an invite. They sign up, answer a few questions and pick
              their teams.
            </p>
            <Link
              href="/tools/invite"
              className="text-[13px] font-semibold text-accent underline-offset-4 hover:underline"
            >
              Open Invites
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

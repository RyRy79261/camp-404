import Link from "next/link";
import { notFound } from "next/navigation";
import { canEditGuideChapter } from "@camp404/core";
import { EMPTY_DUTY_CARD } from "@camp404/types";
import { DutyCardsSheet } from "@/components/print/duty-card";
import { printedOn } from "@/components/print/print-kit";
import { PrintRefusal } from "@/components/print/print-sheet";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { dutyCardFooter, toDutyCardPrint } from "@/lib/duty-card-print";
import { getGuideDraft, getPublishedChapter } from "@/lib/guide";
import {
  DUTY_CARDS_PRINT_PATH,
  guideChapterPath,
  guideDay,
  guideEditPath,
  WHOLE_CAMP_LABEL,
} from "@/lib/guide-copy";
import { getDutyCardShifts } from "@/lib/shifts";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Duty card to print — Camp 404" };

// One Survival Guide duty card on A4 (#250), to laminate and pin up on site,
// in the shared print shell with a real PDF (components/print/duty-card.tsx).
//
// The same readers as the card's page: every approved member reads a
// published card, and a card that is not on the guide is a 404, as there.
// `?draft=1` prints the saved working copy instead, for a writer checking it
// on paper before it goes up: only someone who may edit the card (a captain,
// or a lead of its team: canEditGuideChapter) may open it; anyone else is
// refused outside the shell, so it is never a PDF. The card names no member,
// and publishing refuses a phone number on it.

export default async function DutyCardPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const wantsDraft = query.draft === "1";
  const printed = printedOn(new Date());
  const config = await getTeamsConfig();
  const teamLabel = (team: string | null) =>
    team === null
      ? WHOLE_CAMP_LABEL
      : (config.teams.find((t) => t.key === team)?.label ?? team);

  if (wantsDraft) {
    const leadTeams =
      rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
    const draft = await getGuideDraft(slug);
    if (!draft || draft.kind !== "duty_card") notFound();
    if (!canEditGuideChapter(rank, leadTeams, draft.team)) {
      return (
        <PrintRefusal>
          <p data-testid="duty-card-refusal">
            Only captains and this team&apos;s leads can print a duty card that
            is not published.
          </p>
        </PrintRefusal>
      );
    }
    const usedBy = await getDutyCardShifts(draft.id);
    const card = toDutyCardPrint({
      key: draft.id,
      title: draft.title,
      team: draft.team,
      teamLabel: teamLabel(draft.team),
      card: draft.card ?? EMPTY_DUTY_CARD,
      markdown: draft.markdown,
      usedBy,
      footer: dutyCardFooter({ draftSaved: guideDay(draft.updatedAt) }),
      draft: true,
    });
    return (
      <DutyCardsSheet
        title={`${draft.title} draft duty card`}
        cards={[card]}
        printed={printed}
        options={
          <Link href={guideEditPath(draft.slug)} className="underline">
            Back to the editor
          </Link>
        }
      />
    );
  }

  const chapter = await getPublishedChapter(slug);
  if (!chapter || chapter.kind !== "duty_card" || !chapter.card) notFound();
  const usedBy = await getDutyCardShifts(chapter.id);
  const card = toDutyCardPrint({
    key: chapter.id,
    title: chapter.title,
    team: chapter.team,
    teamLabel: teamLabel(chapter.team),
    card: chapter.card,
    markdown: chapter.markdown,
    usedBy,
    footer: dutyCardFooter({
      version: chapter.version,
      published: guideDay(chapter.publishedAt),
    }),
  });
  return (
    <DutyCardsSheet
      title={`${chapter.title} duty card`}
      cards={[card]}
      printed={printed}
      options={
        <>
          <Link href={guideChapterPath(chapter.slug)} className="underline">
            Back to the card
          </Link>
          <span aria-hidden>·</span>
          <Link href={DUTY_CARDS_PRINT_PATH} className="underline">
            Every duty card
          </Link>
        </>
      }
    />
  );
}

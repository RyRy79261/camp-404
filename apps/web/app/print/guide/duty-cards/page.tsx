import Link from "next/link";
import { DutyCardsSheet } from "@/components/print/duty-card";
import { printedOn } from "@/components/print/print-kit";
import { PrintSheet } from "@/components/print/print-sheet";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { dutyCardFooter, toDutyCardPrint } from "@/lib/duty-card-print";
import { listPublishedDutyCardsInFull } from "@/lib/guide";
import { GUIDE_PATH, groupByTeam, guideDay } from "@/lib/guide-copy";
import { getShiftsForDutyCards } from "@/lib/shifts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Duty cards to print — Camp 404" };

// Every published duty card in the Survival Guide on A4 (#250), one card per
// page (a long card takes more), in one PDF: the camp's whole set to laminate
// before the Burn. Grouped as the guide's By team tab is: the whole camp's
// cards first, then each team's in the camp's order, by title. Only what
// members read is in it: a draft, an unpublished change, or a card taken off
// the guide never is. Every approved member may print it, as they read every
// card; it names no member.

export default async function DutyCardsPrintPage() {
  await captainPageGate("camp_member");
  const [cards, config] = await Promise.all([
    listPublishedDutyCardsInFull(),
    getTeamsConfig(),
  ]);
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const groups = groupByTeam(
    cards.flatMap((c) => (c.card ? [{ ...c, card: c.card }] : [])),
    teams,
  );
  const options = (
    <Link href={GUIDE_PATH} className="underline">
      Back to the guide
    </Link>
  );

  if (groups.length === 0) {
    return (
      <PrintSheet area="Survival Guide" title="Duty cards" options={options}>
        <p>No duty cards are published yet.</p>
      </PrintSheet>
    );
  }

  const ordered = groups.flatMap((g) =>
    g.chapters.map((c) => ({ chapter: c, teamLabel: g.label })),
  );
  const shifts = await getShiftsForDutyCards(ordered.map((o) => o.chapter.id));
  const prints = ordered.map(({ chapter, teamLabel }) =>
    toDutyCardPrint({
      key: chapter.id,
      title: chapter.title,
      team: chapter.team,
      teamLabel,
      card: chapter.card,
      markdown: chapter.markdown,
      usedBy: shifts.get(chapter.id) ?? [],
      footer: dutyCardFooter({
        version: chapter.version,
        published: guideDay(chapter.publishedAt),
      }),
    }),
  );
  return (
    <DutyCardsSheet
      title="Duty cards"
      cards={prints}
      printed={printedOn(new Date())}
      options={options}
    />
  );
}

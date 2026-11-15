import {
  canRunLounge,
  clockText,
  durationText,
  OFFER_DECIDED,
} from "@camp404/core";
import type { LoungeOfferStatus } from "@camp404/types";
import { getLoungeProgramme, getLoungeSettings } from "../lounge";
import { KIND_LABELS, BAND_NAMES } from "../lounge-copy";
import { scopeActor } from "../mcp/scope";
import {
  dayName,
  loungeDayList,
  myOffer,
  runnerOffer,
} from "../mcp/tools/lounge";
import {
  blocked,
  listed,
  quote,
  shown,
  str,
  type PreviewFn,
} from "./preview-kit";

// The lounge's voice previews (#269): each reads the real offer or note on
// the server and fills in the compare-and-set values from what it read.

const PATH = "/lounge";

const STATUS_WORDS: Record<LoungeOfferStatus, string> = {
  offered: "waiting for a decision",
  accepted: "accepted",
  declined: "declined",
  needs_changes: "sent back for changes",
};

const DECISION_VERB = {
  accepted: "Accept",
  declined: "Decline",
  needs_changes: "Send back",
} as const;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The change lines for an offer's fields that the arguments set. */
async function offerChanges(args: Record<string, unknown>): Promise<string[]> {
  const days = await loungeDayList();
  const out: string[] = [];
  if (args.title !== undefined) out.push(`Name: ${shown(args.title)}`);
  if (args.kind !== undefined) {
    out.push(
      `Kind: ${KIND_LABELS[str(args.kind) as keyof typeof KIND_LABELS] ?? str(args.kind)}`,
    );
  }
  if (num(args.durationMinutes) !== null) {
    out.push(`Length: ${durationText(num(args.durationMinutes)!)}`);
  }
  if (args.description !== undefined) {
    out.push(`Description: ${shown(args.description)}`);
  }
  if (args.needs !== undefined) out.push(`Needs: ${shown(args.needs)}`);
  if (args.needsNote !== undefined) {
    out.push(`Needs note: ${shown(args.needsNote)}`);
  }
  if (Array.isArray(args.preferredDays)) {
    out.push(
      `Days: ${listed(args.preferredDays.map((d) => dayName(days, Number(d))))}`,
    );
  }
  if (Array.isArray(args.preferredBands)) {
    out.push(
      `Times: ${listed(
        args.preferredBands.map(
          (b) => BAND_NAMES[str(b) as keyof typeof BAND_NAMES] ?? str(b),
        ),
      )}`,
    );
  }
  if (args.recurring !== undefined) {
    out.push(`Every day: ${shown(args.recurring)}`);
  }
  if (args.publicGuide !== undefined) {
    out.push(`In the event guide: ${shown(args.publicGuide)}`);
  }
  return out;
}

export const LOUNGE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async offer_lounge_activity(args) {
    const length = num(args.durationMinutes);
    return {
      sentence: `Offer ${quote(str(args.title))} for the lounge, in your name`,
      facts: [
        "Lounge",
        KIND_LABELS[str(args.kind) as keyof typeof KIND_LABELS] ??
          str(args.kind),
        length !== null ? durationText(length) : "no length",
        "a captain or Ministry of Vibes lead decides",
      ].join(" · "),
      change: await offerChanges({
        ...args,
        title: undefined,
        kind: undefined,
      }),
      path: PATH,
      args,
      keys: [],
    };
  },

  async update_my_lounge_offer(args, ctx) {
    const offer = await myOffer(ctx.scope, str(args.offerId));
    if (!offer) {
      return blocked(
        "Change your lounge offer",
        "That offer isn't one of yours.",
        args,
        PATH,
      );
    }
    const base = {
      sentence: `Change your lounge offer ${quote(offer.title)}`,
      facts: `Lounge · now ${STATUS_WORDS[offer.status]} · it waits for a decision again`,
      change: await offerChanges(args),
      path: PATH,
      args: { ...args, offerId: offer.id, expectedVersion: offer.version },
      keys: [`lounge-offer:${offer.id}`],
    };
    if (offer.status === "accepted" || offer.status === "declined") {
      return { ...base, blocked: OFFER_DECIDED };
    }
    return base;
  },

  async withdraw_my_lounge_offer(args, ctx) {
    const offer = await myOffer(ctx.scope, str(args.offerId));
    if (!offer) {
      return blocked(
        "Withdraw your lounge offer",
        "That offer isn't one of yours.",
        args,
        PATH,
      );
    }
    const programme = await getLoungeProgramme();
    const placed = programme.slots.filter((s) => s.offerId === offer.id).length;
    return {
      sentence: `Withdraw your lounge offer ${quote(offer.title)}`,
      facts: `Lounge · ${STATUS_WORDS[offer.status]}${placed > 0 ? ` · comes off the programme (${placed} time${placed === 1 ? "" : "s"})` : ""}`,
      path: PATH,
      args: { offerId: offer.id },
      keys: [`lounge-offer:${offer.id}`],
    };
  },

  async decide_lounge_offer(args, ctx) {
    const decision = str(args.decision) as keyof typeof DECISION_VERB;
    const actor = scopeActor(ctx.scope);
    if (!canRunLounge(actor.rank, actor.ledTeams)) {
      return blocked(
        "Decide a lounge offer",
        "Only captains and Ministry of Vibes leads decide offers.",
        args,
        PATH,
      );
    }
    const offer = await runnerOffer(str(args.offerId));
    if (!offer) {
      return blocked(
        "Decide a lounge offer",
        "That offer isn't there this year.",
        args,
        PATH,
      );
    }
    const base = {
      sentence: `${DECISION_VERB[decision] ?? decision} ${quote(offer.title)} by ${offer.hostName}`,
      facts: `Lounge · ${KIND_LABELS[offer.kind]} · now ${STATUS_WORDS[offer.status]}${decision !== "accepted" && offer.status === "accepted" ? " · comes off the programme" : ""}`,
      ...(args.reason ? { change: [`Reason: ${shown(args.reason)}`] } : {}),
      path: PATH,
      args: {
        ...args,
        offerId: offer.id,
        expectedStatus: offer.status,
        expectedVersion: offer.version,
      },
      keys: [`lounge-offer:${offer.id}`],
    };
    if (offer.status === decision) {
      return { ...base, blocked: "It already has that answer." };
    }
    if (decision !== "accepted" && !str(args.reason).trim()) {
      return { ...base, blocked: "Say why, so the host knows what to do." };
    }
    return base;
  },

  async place_lounge_offer(args, ctx) {
    const actor = scopeActor(ctx.scope);
    if (!canRunLounge(actor.rank, actor.ledTeams)) {
      return blocked(
        "Place a lounge offer",
        "Only captains and Ministry of Vibes leads place offers.",
        args,
        PATH,
      );
    }
    const offer = await runnerOffer(str(args.offerId));
    if (!offer) {
      return blocked(
        "Place a lounge offer",
        "That offer isn't there this year.",
        args,
        PATH,
      );
    }
    const days = await loungeDayList();
    const day = num(args.day) ?? 0;
    const start = num(args.startMinute) ?? 0;
    const base = {
      sentence: `Put ${quote(offer.title)} on the programme, ${dayName(days, day)} ${clockText(start)}–${clockText(start + offer.durationMinutes)}`,
      facts: `Lounge · ${KIND_LABELS[offer.kind]} · ${offer.hostName}`,
      path: PATH,
      args: { offerId: offer.id, day, startMinute: start },
      keys: [`lounge-slot:${offer.id}:${day}:${start}`],
      needs: [`lounge-offer:${offer.id}`],
    };
    if (offer.status !== "accepted") {
      return {
        ...base,
        blocked: "Only an accepted offer can go on the programme.",
      };
    }
    return base;
  },

  async set_lounge_music_note(args) {
    const settings = await getLoungeSettings();
    return {
      sentence: args.musicPolicy
        ? "Replace the lounge's music note for DJs"
        : "Clear the lounge's music note for DJs",
      facts: `Lounge · ${settings.musicPolicy ? `now ${shown(settings.musicPolicy)}` : "no note yet"}`,
      change: [`Music note: ${shown(args.musicPolicy)}`],
      path: PATH,
      args: {
        musicPolicy: args.musicPolicy ?? null,
        expectedVersion: settings.version,
      },
      keys: ["lounge-music-note"],
    };
  },
};

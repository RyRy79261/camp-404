import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  canRunLounge,
  clockText,
  durationText,
  loungeDays,
  OFFER_CHANGED,
  NOT_YOUR_OFFER,
  type LoungeDay,
} from "@camp404/core";
import {
  DecideLoungeOfferInput,
  EditLoungeOfferInput,
  LOUNGE_BANDS,
  LOUNGE_DECISIONS,
  LOUNGE_NEEDS,
  LOUNGE_OFFER_KINDS,
  LOUNGE_OFFER_STATUSES,
  LoungeMusicPolicyInput,
  LoungeOfferInput,
  PlaceLoungeOfferInput,
  WithdrawLoungeOfferInput,
} from "@camp404/types";
import { getCampSettings } from "../../camp-config";
import {
  addLoungeOffer,
  decideLoungeOffer,
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
  placeLoungeOffer,
  setLoungeMusicPolicy,
  updateLoungeOffer,
  withdrawLoungeOffer,
  type LoungeOfferRow,
} from "../../lounge";
import { CHECK_NOTE, CHECK_OFFER, CHECK_PLACE } from "../../lounge-copy";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The Ministry of Vibes' lounge (#269) over MCP, through the Lounge page's
// own facade (lib/lounge.ts → @camp404/db/lounge, or the E2E store).
//
//  - get_lounge reads what the page reads for this person: the programme
//    (accepted offers and where they are placed, by host name), their own
//    offers, the music note, and every offer only for someone who runs the
//    lounge (canRunLounge), as the page asks for it.
//  - Offering, changing and withdrawing are the member's own: the caller's
//    id, never one passed in; the write keeps them to their own offer and
//    refuses a decided one in the page's words. update_my_lounge_offer takes
//    only what changes and fills the rest from the offer AT the version the
//    caller read; the write checks the version again.
//  - Deciding, placing and the music note are LOUNGE_RUNNER's (the gate) and
//    the write re-reads the actor under lock, with the same compare-and-set
//    on the status and version read and the same audit rows
//    (lounge.offer_decided, lounge.offer_placed, lounge.music_policy_changed).
//  - Taking an item off the programme stays on the page.

const LOUNGE_PATH = "/lounge";

/** The year's programme days, labelled as the page labels them. */
export async function loungeDayList(): Promise<LoungeDay[]> {
  const camp = await getCampSettings();
  const burn =
    camp.current?.burnStart && camp.current.burnEnd
      ? { start: camp.current.burnStart, end: camp.current.burnEnd }
      : null;
  return loungeDays(burn);
}

export function dayName(days: readonly LoungeDay[], day: number): string {
  return days.find((d) => d.day === day)?.label ?? `Day ${day}`;
}

function parsed<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
  fallback: string,
): T {
  if (!result.success) {
    throw new ToolError(result.error.issues[0]?.message ?? fallback);
  }
  return result.data;
}

/** The caller's own offer, as their My offers reads it. */
export async function myOffer(
  scope: McpScope,
  offerId: string,
): Promise<LoungeOfferRow | undefined> {
  const mine = await listMyLoungeOffers(scope.campUserId);
  return mine.find((o) => o.id === offerId);
}

/** Every offer this year, for someone who runs the lounge. */
export async function runnerOffer(
  offerId: string,
): Promise<LoungeOfferRow | undefined> {
  const all = await listLoungeOffers();
  return all.find((o) => o.id === offerId);
}

function offerOut(o: LoungeOfferRow, days: readonly LoungeDay[]) {
  return {
    id: o.id,
    title: o.title,
    kind: o.kind,
    host: o.hostName,
    description: o.description,
    durationMinutes: o.durationMinutes,
    length: durationText(o.durationMinutes),
    needs: o.needs,
    needsNote: o.needsNote,
    preferredDays: o.preferredDays,
    preferredDayLabels: o.preferredDays.map((d) => dayName(days, d)),
    preferredBands: o.preferredBands,
    recurring: o.recurring,
    publicGuide: o.publicGuide,
    status: o.status,
    decisionNote: o.decisionNote,
    version: o.version,
  };
}

const offerFields = {
  title: z.string().max(80),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(LOUNGE_OFFER_KINDS),
  durationMinutes: z.number().int().describe("15 to 480, in steps of 15."),
  needs: z.array(z.enum(LOUNGE_NEEDS)).optional(),
  needsNote: z.string().max(300).nullable().optional(),
  preferredDays: z
    .array(z.number().int().min(1).max(14))
    .optional()
    .describe("Programme day numbers (Day 1 is the Burn's first day)."),
  preferredBands: z.array(z.enum(LOUNGE_BANDS)).optional(),
  recurring: z.boolean().optional(),
  publicGuide: z
    .boolean()
    .optional()
    .describe("List it in the event guide given out to other camps."),
};

const OFFER_KEYS = [
  "title",
  "description",
  "kind",
  "durationMinutes",
  "needs",
  "needsNote",
  "preferredDays",
  "preferredBands",
  "recurring",
  "publicGuide",
] as const;

export function registerLoungeTools(server: McpServer): void {
  server.registerTool(
    "get_lounge",
    {
      title: "Read the lounge",
      description:
        "The lounge as its page shows you: the programme (each placed item's day, start, length, title and host), the accepted offers, your own offers with their `version` and status, and the music note with its `version`. For captains and Ministry of Vibes leads, every offer this year with its status and `version` too. Days are numbered from the Burn's first day.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_lounge",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const actor = scopeActor(scope);
          const runs = canRunLounge(actor.rank, actor.ledTeams);
          const [days, programme, mine, all, settings] = await Promise.all([
            loungeDayList(),
            getLoungeProgramme(),
            listMyLoungeOffers(scope.campUserId),
            runs ? listLoungeOffers() : Promise.resolve(null),
            getLoungeSettings(),
          ]);
          const byId = new Map(programme.offers.map((o) => [o.id, o]));
          return {
            days: days.map((d) => ({ day: d.day, label: d.label })),
            programme: programme.slots.map((s) => {
              const offer = byId.get(s.offerId);
              return {
                slotId: s.id,
                offerId: s.offerId,
                day: s.day,
                dayLabel: dayName(days, s.day),
                startMinute: s.startMinute,
                start: clockText(s.startMinute),
                end: offer
                  ? clockText(s.startMinute + offer.durationMinutes)
                  : null,
                title: offer?.title ?? null,
                kind: offer?.kind ?? null,
                host: offer?.hostName ?? null,
              };
            }),
            accepted: programme.offers.map((o) => ({
              id: o.id,
              title: o.title,
              kind: o.kind,
              host: o.hostName,
              description: o.description,
              length: durationText(o.durationMinutes),
              recurring: o.recurring,
            })),
            myOffers: mine.map((o) => offerOut(o, days)),
            musicNote: {
              text: settings.musicPolicy,
              version: settings.version,
            },
            youRunTheLounge: runs,
            ...(all ? { allOffers: all.map((o) => offerOut(o, days)) } : {}),
            url: siteUrl(LOUNGE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "offer_lounge_activity",
    {
      title: "Offer something for the lounge",
      description:
        "Offers an activity, workshop or DJ set for this year's lounge in your name, as the Lounge page's Offer does. A captain or Ministry of Vibes lead then accepts it and places it. `durationMinutes` is 15 to 480 in steps of 15; `preferredBands` are times of day (morning … late_night).",
      inputSchema: z.object(offerFields),
    },
    async (args, extra) =>
      runTool({
        toolName: "offer_lounge_activity",
        extra,
        argsForAudit: { kind: args.kind, title: args.title },
        handler: async ({ scope }) => {
          const input = parsed(LoungeOfferInput.safeParse(args), CHECK_OFFER);
          const result = await addLoungeOffer({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            title: input.title,
            status: "offered",
            version: 1,
            url: siteUrl(LOUNGE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "update_my_lounge_offer",
    {
      title: "Change my lounge offer",
      description:
        "Changes your own lounge offer while it waits or was sent back for changes; it then waits for a decision again. Give its `offerId`, the `expectedVersion` you read (get_lounge's myOffers) and only what changes; null clears the description or note. Refused when it was decided, or changed since you read it.",
      inputSchema: z.object({
        offerId: z.string().min(1).max(64),
        expectedVersion: z.number().int().min(1),
        title: offerFields.title.optional(),
        description: offerFields.description,
        kind: offerFields.kind.optional(),
        durationMinutes: offerFields.durationMinutes.optional(),
        needs: offerFields.needs,
        needsNote: offerFields.needsNote,
        preferredDays: offerFields.preferredDays,
        preferredBands: offerFields.preferredBands,
        recurring: offerFields.recurring,
        publicGuide: offerFields.publicGuide,
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_lounge_offer",
        extra,
        argsForAudit: {
          offerId: args.offerId,
          expectedVersion: args.expectedVersion,
          fields: OFFER_KEYS.filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          // Only the caller's own offers are read: anyone else's is refused
          // as the write refuses it.
          const current = await myOffer(scope, args.offerId);
          if (!current) throw new ToolError(NOT_YOUR_OFFER);
          // The fields left out are filled from this read, so it must be the
          // version the caller read; the write checks the version again.
          if (current.version !== args.expectedVersion) {
            throw new ToolError(OFFER_CHANGED);
          }
          const whole: Record<string, unknown> = {
            offerId: args.offerId,
            expectedVersion: args.expectedVersion,
          };
          for (const key of OFFER_KEYS) {
            whole[key] = args[key] !== undefined ? args[key] : current[key];
          }
          const input = parsed(
            EditLoungeOfferInput.safeParse(whole),
            CHECK_OFFER,
          );
          const result = await updateLoungeOffer({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: args.offerId,
            title: input.title,
            status: "offered",
            version: args.expectedVersion + 1,
            url: siteUrl(LOUNGE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "withdraw_my_lounge_offer",
    {
      title: "Withdraw my lounge offer",
      description:
        "Takes your own lounge offer back, whatever its answer, as My offers' Withdraw does; it comes off the programme too. You can offer it again later.",
      inputSchema: z.object({ offerId: z.string().min(1).max(64) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "withdraw_my_lounge_offer",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(
            WithdrawLoungeOfferInput.safeParse(args),
            CHECK_OFFER,
          );
          const result = await withdrawLoungeOffer({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { id: args.offerId, withdrawn: true };
        },
      }),
  );

  server.registerTool(
    "decide_lounge_offer",
    {
      title: "Decide a lounge offer",
      description:
        "Accepts, declines or sends back (needs_changes) a lounge offer, as the Offers tab does. Give the `expectedStatus` and `expectedVersion` you read (get_lounge's allOffers). Declining or sending back needs a `reason` the host reads. Moving it off accepted takes it off the programme. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        offerId: z.string().min(1).max(64),
        decision: z.enum(LOUNGE_DECISIONS),
        expectedStatus: z.enum(LOUNGE_OFFER_STATUSES),
        expectedVersion: z.number().int().min(1),
        reason: z.string().max(500).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "decide_lounge_offer",
        extra,
        // Never the reason's words.
        argsForAudit: {
          offerId: args.offerId,
          decision: args.decision,
          expectedStatus: args.expectedStatus,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const input = parsed(
            DecideLoungeOfferInput.safeParse(args),
            CHECK_OFFER,
          );
          const result = await decideLoungeOffer({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: args.offerId,
            status: input.decision,
            version: args.expectedVersion + 1,
          };
        },
      }),
  );

  server.registerTool(
    "place_lounge_offer",
    {
      title: "Place a lounge offer",
      description:
        "Puts an accepted lounge offer on the programme at a `day` (1 is the Burn's first day) and `startMinute` (minutes after midnight, steps of 15: 18:30 is 1110), as the Offers tab's Place does. A day runs 06:00 to 06:00, so 02:00 belongs to the night before. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        offerId: z.string().min(1).max(64),
        day: z.number().int().min(1).max(14),
        startMinute: z.number().int().min(0).max(1425),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "place_lounge_offer",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const input = parsed(
            PlaceLoungeOfferInput.safeParse(args),
            CHECK_PLACE,
          );
          const result = await placeLoungeOffer({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            slotId: result.id,
            offerId: input.offerId,
            day: input.day,
            start: clockText(input.startMinute),
          };
        },
      }),
  );

  server.registerTool(
    "set_lounge_music_note",
    {
      title: "Write the lounge's music note",
      description:
        "Replaces the music note DJs read on the DJ set form, this year. Give the whole note (null or empty clears it) and the `expectedVersion` you read (get_lounge's musicNote; 0 when none is saved). Refused if someone changed it since. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        musicPolicy: z.string().max(2000).nullable(),
        expectedVersion: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_lounge_music_note",
        extra,
        argsForAudit: { expectedVersion: args.expectedVersion },
        handler: async ({ scope }) => {
          const input = parsed(
            LoungeMusicPolicyInput.safeParse(args),
            CHECK_NOTE,
          );
          const result = await setLoungeMusicPolicy({
            ...input,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { musicNote: input.musicPolicy, version: result.version };
        },
      }),
  );
}

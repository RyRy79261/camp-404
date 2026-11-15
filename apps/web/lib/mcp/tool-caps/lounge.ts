import { LOUNGE_RUNNER } from "@camp404/core";
import { LOUNGE_REFUSAL } from "../../lounge-copy";
import { byRule, GATES, type Gate, type ToolCapability } from "../gates";

// The Ministry of Vibes' lounge (#269). Offering, changing and withdrawing
// your own offer is any approved member's (offerAction's camp_member gate;
// the write keeps a member to their own offer). Deciding, placing and the
// music note are LOUNGE_RUNNER's, the actions' ruleActionGate. Taking an item
// off the programme stays on the page.

export const LOUNGE_RUNNER_GATE: Gate = {
  who: "Captains and Ministry of Vibes leads",
  allows: byRule(LOUNGE_RUNNER),
  refusal: LOUNGE_REFUSAL,
};

const PAGE = "/lounge";

export const LOUNGE_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  get_lounge: {
    kind: "read",
    area: "Lounge",
    gate: GATES.member,
    does: "The lounge programme, your own offers and the music note; every offer for those who run it.",
    page: PAGE,
  },
  offer_lounge_activity: {
    kind: "write",
    area: "Lounge",
    gate: GATES.member,
    does: "Offer an activity, a workshop or a DJ set for the lounge.",
    page: PAGE,
  },
  update_my_lounge_offer: {
    kind: "write",
    area: "Lounge",
    gate: GATES.member,
    does: "Change your own lounge offer while it waits or was sent back.",
    page: PAGE,
  },
  withdraw_my_lounge_offer: {
    kind: "write",
    area: "Lounge",
    gate: GATES.member,
    does: "Take your own lounge offer back; it comes off the programme too.",
    page: PAGE,
  },
  decide_lounge_offer: {
    kind: "write",
    area: "Lounge",
    gate: LOUNGE_RUNNER_GATE,
    does: "Accept, decline or send back a lounge offer.",
    page: PAGE,
  },
  place_lounge_offer: {
    kind: "write",
    area: "Lounge",
    gate: LOUNGE_RUNNER_GATE,
    does: "Put an accepted offer on the lounge programme at a day and time.",
    page: PAGE,
  },
  set_lounge_music_note: {
    kind: "write",
    area: "Lounge",
    gate: LOUNGE_RUNNER_GATE,
    does: "Write the music note DJs read on the DJ set form.",
    page: PAGE,
  },
};

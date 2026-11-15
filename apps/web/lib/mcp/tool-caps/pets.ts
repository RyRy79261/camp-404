import { PET_NOT_A_REVIEWER } from "@camp404/db/pets";
import { atLeast, GATES, type Gate, type ToolCapability } from "../gates";

// Camp pets (owner, 2026-10-09). Every approved member reads the pets the
// page shows them and changes the one stupid thing on their own pet; the
// review (marking in, the hint, whose it is) is a captain's, the actions'
// captainActionGate("captain"), read again inside each write. Sending a pet
// in needs its photos, an upload, so it stays on the page.

export const PET_REVIEWER_GATE: Gate = {
  who: "Captains only",
  allows: atLeast("captain"),
  refusal: PET_NOT_A_REVIEWER,
};

const PAGE = "/pets";

export const PETS_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  list_pets: {
    kind: "read",
    area: "Pets",
    gate: GATES.member,
    does: "The camp's pets as Camp pets shows them to you.",
    page: PAGE,
  },
  set_pet_stupid_thing: {
    kind: "write",
    area: "Pets",
    gate: GATES.member,
    does: "Change the one stupid thing on your own pet (captains: any pet).",
    page: PAGE,
  },
  mark_pet_in: {
    kind: "write",
    area: "Pets",
    gate: PET_REVIEWER_GATE,
    does: "Mark a waiting pet in, with its picture and a hint.",
    page: PAGE,
  },
  set_pet_hint: {
    kind: "write",
    area: "Pets",
    gate: PET_REVIEWER_GATE,
    does: "Change the hint on a pet that is in.",
    page: PAGE,
  },
  set_pet_owner: {
    kind: "write",
    area: "Pets",
    gate: PET_REVIEWER_GATE,
    does: "Say whose pet a pet with no photos is, or nobody's.",
    page: PAGE,
  },
};

import type { Audience } from "@camp404/db/broadcasts";

// The words the announcements screen uses for each audience, in one place so
// the composer, the cards and the publish confirmation agree. Plain module:
// the client manager and its tests import it.

/** "Jess", "Jess and Sipho", "Jess, Sipho and Rae". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The first word of a name, for a short button: "Publish to Jess". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * The line under the picker for chosen people (#313, owner 2026-10-02): "Goes
 * to Jess Naidoo only." / "Goes to Jess Naidoo and Sipho Ndlovu." / "Goes to 3
 * people."
 */
export function peopleSummary(names: readonly string[]): string {
  if (names.length === 0) return "Pick at least one person.";
  if (names.length === 1) return `Goes to ${names[0]} only.`;
  if (names.length === 2) return `Goes to ${joinNames(names)}.`;
  return `Goes to ${names.length} people.`;
}

/** The line under the picker for the drivers. */
export function driversSummary(names: readonly string[]): string {
  if (names.length === 0)
    return "Nobody has said they are driving this year yet.";
  return `Goes to ${names.length} ${names.length === 1 ? "person" : "people"} driving this year: ${joinNames(names)}.`;
}

/** Names for an audience's chosen people; someone no longer listed is "someone who left". */
export function chosenNames(
  audience: Audience,
  nameOf: (id: string) => string | undefined,
): string[] {
  if (audience.scope !== "individual") return [];
  return audience.userIds.map((id) => nameOf(id) ?? "someone who left");
}

/** The draft card's publish button. */
export function publishLabel(
  audience: Audience,
  audienceName: string,
  options: { driverCount: number; names: readonly string[] },
): string {
  switch (audience.scope) {
    case "team":
      return `Publish to ${audienceName}`;
    case "team_leads":
      return "Publish to team leads";
    case "drivers":
      return `Publish to ${options.driverCount} ${options.driverCount === 1 ? "driver" : "drivers"}`;
    case "individual":
      return options.names.length === 1
        ? `Publish to ${firstName(options.names[0]!)}`
        : `Publish to ${options.names.length} people`;
    default:
      return "Publish to camp";
  }
}

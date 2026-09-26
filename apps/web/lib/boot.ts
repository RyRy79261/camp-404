// The 404 OS boot screen plays once per browser session (decision 6 A, the
// owner's approval of the prototype 2026-09-26). The console layout asks for
// this cookie; the boot screen sets it when it ends. A session cookie (no
// expiry), so a closed browser starts with the boot again. It holds "1" and
// nothing else, and decides nothing but a picture.
export const BOOT_COOKIE = "camp404_os_booted";

/** One line of the boot log: what is being checked, and what came back. */
export interface BootLine {
  text: string;
  ok?: string;
}

/**
 * The boot log for one member (the prototype's lines, with their own facts):
 * the BIOS line, the teams, the cats, who is signing in, their inbox, and the
 * days to the Burn when the dates are set. Plain text, their own.
 */
export function bootLog(facts: {
  name: string;
  rank: string;
  teams: number;
  inbox: number;
  year: number | null;
  daysTo: number | null;
}): { lines: BootLine[]; welcome: string } {
  const lines: BootLine[] = [
    { text: "404 OS BIOS v4.04  (c) Camp 404, Tankwa Karoo" },
    { text: "Checking memory", ok: "OK" },
    { text: "Loading teams", ok: `${facts.teams} teams` },
    { text: "Loading the kitchen", ok: "OK" },
    { text: "Counting cats", ok: "2 (Jinn awake, Prince asleep)" },
    { text: `Signing in: ${facts.name}`, ok: facts.rank },
    { text: "Inbox", ok: `${facts.inbox} new` },
  ];
  if (facts.year !== null && facts.daysTo !== null) {
    lines.push({
      text: `AfrikaBurn ${facts.year}`,
      ok: `${facts.daysTo} ${facts.daysTo === 1 ? "day" : "days"}`,
    });
  }
  const first = facts.name.trim().split(/\s+/)[0] || facts.name;
  return { lines, welcome: `Welcome back, ${first}` };
}

// The Transport page's words and path (#270), in a plain module so the page,
// its client islands and its "use server" actions can share them (a "use
// server" file may export only async functions).

export const TRANSPORT_PATH = "/transport";

export const CHECK_FORM = "Check the form and try again.";

/** Seats as people say them: "2 of 3 seats taken", or who rides. */
export function seatsText(seatsOffered: number | null, riders: number): string {
  if (seatsOffered === null) {
    return riders === 1 ? "1 rider" : `${riders} riders`;
  }
  return `${riders} of ${seatsOffered} seat${seatsOffered === 1 ? "" : "s"} taken`;
}

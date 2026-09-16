// The camp's one clock. Every date a person reads (a deadline, a "completed
// at", a "you can nudge again from") is formatted in this zone, never the
// host's. Intl.DateTimeFormat without a `timeZone` uses whatever zone the
// process runs in: Vercel runs in UTC, so a deadline a captain in Cape Town set
// for 00:30 on 11 Mar (stored as 22:30Z on the 10th) would reach members as
// "due 10 Mar". Pinning the zone also makes a server render and a browser
// render of the same instant produce the same string.
//
// Pass it as the `timeZone` option: `new Intl.DateTimeFormat("en-GB",
// { day: "numeric", month: "short", timeZone: CAMP_TIME_ZONE })`.
export const CAMP_TIME_ZONE = "Africa/Johannesburg";

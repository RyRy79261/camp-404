// The background work, as the captain System status page lists it. Pure: no
// `server-only`, so the page and its tests can read it. What runs, and when,
// lives in lib/background-work.ts; __tests__/background-work.test.ts checks
// the numbers here against it.

export interface BackgroundJob {
  label: string;
  /** When it runs, in a few words for a badge. */
  when: string;
  /** One plain sentence of what a run does. */
  what: string;
}

export const BACKGROUND_JOBS = [
  {
    label: "Notice delivery",
    when: "When sent · on page load",
    what: "Puts each announcement in its recipients' inboxes when it is published, or when its scheduled time has come.",
  },
  {
    label: "Push notifications",
    when: "When sent · on page load",
    what: "Sends new notices to the phones and browsers that have push turned on. Anything left over is retried on the next page load.",
  },
  {
    label: "Email notices",
    when: "When sent · on page load",
    what: "Emails the notices that must not be missed, through Resend.",
  },
  {
    label: "Reminders",
    when: "On page load · 09:00–21:00",
    what: "Reminds members who still owe a questionnaire due within 48 hours, and the person responsible for a task the day before it is due and on the day. Camp time.",
  },
  {
    label: "Upkeep",
    when: "On page load · once a day",
    what: "Encrypts any ID number still stored as plain text, and on the live site deletes profile photos whose owner has no camp account.",
  },
] as const satisfies readonly BackgroundJob[];

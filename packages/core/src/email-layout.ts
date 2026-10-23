// The one look every Camp 404 email wears (owner's pick B, 2026-10-23): a
// light card under a dark "404 OS" header with a magenta-to-blue stripe, a
// small label that says what the email is, the title, the words, one big
// button and a quiet footer.
//
// PURE: no I/O. The notification email (./notification-email.ts) and the
// sign-in emails (@camp404/auth's email.ts) both build their HTML part here.
//
// Mail apps are not browsers: no stylesheet, no flexbox, no web fonts. So the
// layout is tables with inline styles, and every colour is also a `bgcolor`
// attribute, which is what keeps a light card light when a phone's dark mode
// rewrites the colours it can. Everything handed in is escaped here, so a
// caller cannot put markup in someone's inbox by mistake.

export interface EmailLayoutInput {
  /** What the email is, in a few words: "New questionnaire", "Sign-in". */
  label: string;
  title: string;
  /** The words, one paragraph each. Plain text; line breaks are kept. */
  paragraphs: readonly string[];
  /** The one thing to do. Left out when there is nothing to open. */
  button?: { text: string; url: string } | undefined;
  /** Words under the button ("If you didn't ask for this, ..."). */
  afterButton?: readonly string[] | undefined;
  /** Small print under the card. */
  footer: string;
}

/** Escape text for an HTML text node or a double-quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The 404 OS palette, as plain hex: mail apps do not read oklch.
const MIDNIGHT = "#14102a";
const MAGENTA = "#d62aa8";
const MAGENTA_SOFT = "#fde7f6";
const MAGENTA_INK = "#a1157f";
const BLUE = "#3d8bff";
const INK = "#222222";
const MUTED = "#77738a";
const PAGE = "#f1f0f5";
const FOOT = "#f7f6fa";
const LINE = "#e3e1ea";

const SANS =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'Courier New',Courier,monospace";

function paragraphsHtml(paragraphs: readonly string[]): string {
  return paragraphs
    .filter((p) => p.trim() !== "")
    .map(
      (p) =>
        `<p style="margin:0 0 14px;white-space:pre-wrap;font-family:${SANS};font-size:15px;line-height:1.55;color:${INK}">${escapeHtml(p)}</p>`,
    )
    .join("");
}

/** The HTML part of an email, in the camp's email look. */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const paragraphs = paragraphsHtml(input.paragraphs);
  const preview = input.paragraphs.find((p) => p.trim() !== "") ?? "";
  const after = input.afterButton?.length
    ? `<div style="padding-top:16px">${paragraphsHtml(input.afterButton)}</div>`
    : "";
  const button = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 4px"><tr>` +
      // Outlook on Windows ignores padding on a link: mso-padding-alt gives
      // its button the same size from the cell.
      `<td bgcolor="${MAGENTA}" style="background:${MAGENTA};border-radius:6px;mso-padding-alt:13px 22px">` +
      `<a href="${escapeHtml(input.button.url)}" style="display:inline-block;padding:13px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(input.button.text)}</a>` +
      `</td></tr></table>`
    : "";
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(input.title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PAGE}" bgcolor="${PAGE}">`,
    // The line an inbox shows after the subject. Without it, the inbox shows
    // the header's "404 OS CAMP 404" there. Hidden in the email itself.
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE}">${escapeHtml(preview)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}"><tr><td align="center" style="padding:24px 12px">`,
    // Outlook on Windows ignores max-width, so it gets a fixed-width table.
    '<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border:1px solid ${LINE};border-radius:8px;border-collapse:separate;overflow:hidden">`,
    // Header: the wordmark on midnight.
    `<tr><td bgcolor="${MIDNIGHT}" style="background:${MIDNIGHT};padding:16px 24px;border-radius:8px 8px 0 0">`,
    `<span style="font-family:${MONO};font-size:20px;font-weight:700;letter-spacing:3px;color:#ff3fbf">404&nbsp;OS</span>`,
    `<span style="font-family:${MONO};font-size:11px;letter-spacing:2px;color:#9b95c0;padding-left:10px">CAMP&nbsp;404</span>`,
    "</td></tr>",
    // The stripe: magenta into blue, with a solid magenta for mail apps that
    // drop gradients.
    `<tr><td height="4" bgcolor="${MAGENTA}" style="height:4px;line-height:4px;font-size:0;background:${MAGENTA};background-image:linear-gradient(90deg,#ff3fbf,${BLUE})">&nbsp;</td></tr>`,
    // Body.
    `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:24px 24px 26px">`,
    `<span style="display:inline-block;margin:0 0 12px;padding:3px 10px;border-radius:99px;background:${MAGENTA_SOFT};font-family:${SANS};font-size:12px;font-weight:600;color:${MAGENTA_INK}">${escapeHtml(input.label)}</span>`,
    `<h1 style="margin:0 0 12px;font-family:${SANS};font-size:21px;line-height:1.3;font-weight:700;color:${MIDNIGHT}">${escapeHtml(input.title)}</h1>`,
    paragraphs,
    button,
    after,
    "</td></tr>",
    // Footer.
    `<tr><td bgcolor="${FOOT}" style="background:${FOOT};padding:14px 24px;border-top:1px solid ${LINE};border-radius:0 0 8px 8px;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(input.footer)}</td></tr>`,
    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr></table>",
    "</body></html>",
  ].join("");
}

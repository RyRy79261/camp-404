// Append a dictated transcript onto existing text: trim the new chunk,
// newline-join it (unless the body already ends in a newline), and clamp to
// maxLength. Same behaviour as the questionnaire LongTextField; kept pure and
// standalone so it's unit-testable without importing the browser-coupled
// RecorderPanel. Truncation is silent by design — it matches the Textarea's own
// maxLength capping of typed input.
export function appendTranscript(
  existing: string,
  addition: string,
  maxLength: number,
): string {
  const cleaned = addition.trim();
  if (!cleaned) return existing;
  const joiner = existing && !/\n\s*$/.test(existing) ? "\n" : "";
  return `${existing}${joiner}${cleaned}`.slice(0, maxLength);
}

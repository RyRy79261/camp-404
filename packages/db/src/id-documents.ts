// Pure helpers for moving the sensitive government ID number out of the
// generic burner_profiles.responses JSONB and into the dedicated encrypted
// users columns. No crypto here — encryption happens in the caller's backend
// so this stays a pure, testable mapping. id.type is NOT sensitive and stays
// in responses (the render/validation paths want it).

export const ID_NUMBER_KEY = "id.number";
export const ID_TYPE_KEY = "id.type";

export interface SplitId {
  /** responses with id.number removed (id.type retained). */
  cleaned: Record<string, unknown>;
  /** "passport" | "sa_id" | null */
  idType: string | null;
  /** the document number, or null if absent/empty. */
  idNumber: string | null;
}

export function splitIdNumber(responses: Record<string, unknown>): SplitId {
  const { [ID_NUMBER_KEY]: rawNumber, ...cleaned } = responses;
  const idNumber =
    typeof rawNumber === "string" && rawNumber.trim() !== "" ? rawNumber : null;
  const rawType = responses[ID_TYPE_KEY];
  const idType = typeof rawType === "string" && rawType ? rawType : null;
  return { cleaned, idType, idNumber };
}

export function mergeIdNumber(
  responses: Record<string, unknown>,
  id: { idType: string | null; idNumber: string | null },
): Record<string, unknown> {
  if (!id.idNumber) return responses;
  return {
    ...responses,
    [ID_NUMBER_KEY]: id.idNumber,
    ...(id.idType ? { [ID_TYPE_KEY]: id.idType } : {}),
  };
}

/** Which encrypted column a given id.type writes to. Returns the patch with
 * the matching column set to `value` and the other ID column nulled, so
 * switching document type moves the value rather than orphaning ciphertext. */
export function idColumnsFor(
  idType: string | null,
  value: string | null,
): { passportEncrypted: string | null; saIdEncrypted: string | null } {
  if (idType === "sa_id") return { passportEncrypted: null, saIdEncrypted: value };
  // default / passport
  return { passportEncrypted: value, saIdEncrypted: null };
}

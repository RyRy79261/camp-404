// ID document number validation for the burner-profile questionnaire.
// Pure (framework-agnostic) so apps/web and other consumers share one
// implementation. The shape depends on the document type the user picked:
// South African ID (13 digits, YYMMDD prefix, SA Home Affairs Luhn variant)
// vs Passport (loose 6-12 alphanumeric — Camp 404 is international).

export type IdValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const PASSPORT_RE = /^[A-Z0-9]{6,12}$/i;
const SA_ID_RE = /^\d{13}$/;

export function validateIdNumber(
  type: string | null,
  raw: string,
): IdValidationResult {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Document number is required" };

  if (type === "passport") return validatePassport(value);
  if (type === "sa_id") return validateSaId(value);
  return { ok: false, error: "Pick the ID document type first" };
}

function validatePassport(value: string): IdValidationResult {
  if (!PASSPORT_RE.test(value)) {
    return {
      ok: false,
      error: "Letters and digits only — typically 6–12 characters.",
    };
  }
  return { ok: true };
}

function validateSaId(value: string): IdValidationResult {
  if (!SA_ID_RE.test(value)) {
    return { ok: false, error: "Must be exactly 13 digits." };
  }
  if (!hasValidDatePrefix(value)) {
    return {
      ok: false,
      error: "First six digits aren't a valid YYMMDD date.",
    };
  }
  if (!hasValidLuhnCheck(value)) {
    return {
      ok: false,
      error: "Check digit doesn't match — double-check the number.",
    };
  }
  return { ok: true };
}

function hasValidDatePrefix(idNumber: string): boolean {
  const month = Number.parseInt(idNumber.slice(2, 4), 10);
  const day = Number.parseInt(idNumber.slice(4, 6), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

/**
 * SA Home Affairs Luhn variant. Odd-indexed digits (positions 1, 3,
 * 5, 7, 9, 11 — i.e. the 1st, 3rd, … digit, 1-based) are summed
 * directly. Even-indexed digits (2nd, 4th, …, 12th) are concatenated
 * into a single number which is multiplied by 2; the digits of THAT
 * product are summed. The two sums are added, and the check digit
 * is (10 - (total mod 10)) mod 10.
 */
function hasValidLuhnCheck(idNumber: string): boolean {
  let oddSum = 0;
  let evenConcat = "";
  // 1-based positions 1..12, dropping the check digit at position 13.
  for (let i = 0; i < 12; i++) {
    const digit = idNumber[i]!;
    if (i % 2 === 0) {
      oddSum += Number.parseInt(digit, 10);
    } else {
      evenConcat += digit;
    }
  }
  const evenDoubled = (Number.parseInt(evenConcat, 10) * 2).toString();
  const evenSum = evenDoubled
    .split("")
    .reduce((sum, ch) => sum + Number.parseInt(ch, 10), 0);
  const total = oddSum + evenSum;
  const computed = (10 - (total % 10)) % 10;
  const provided = Number.parseInt(idNumber[12]!, 10);
  return computed === provided;
}

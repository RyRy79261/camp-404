// Word-based invite-code generator. The user explicitly wanted "silly
// words", not a Lorem-ipsum or character-soup string — codes should be
// memorable enough to read out over voice. Two banks, joined with a
// hyphen and capped at 3 segments so the result looks like
// "neon-toaster-mongoose".
//
// Word banks are intentionally short — the namespace is adjective ×
// noun (~50 × ~50 = ~2500), so collision-by-luck is plausible at scale.
// The caller MUST re-check availability against the DB before showing
// the code to the user and again on submit; we never trust generated
// uniqueness alone.

const ADJECTIVES = [
  "neon", "fizzy", "wonky", "cosmic", "spiky", "fluffy", "loopy",
  "sneaky", "bouncy", "groovy", "snazzy", "wibbly", "twirly", "jazzy",
  "kooky", "perky", "zesty", "moody", "glowing", "dazzle", "spry",
  "rusty", "minty", "salty", "smooth", "crinkly", "wobbly", "scruffy",
  "sleepy", "sparkly", "bouncing", "cheeky", "merry", "drowsy",
  "rowdy", "humming", "chirpy", "jolly", "tipsy", "wacky", "dizzy",
  "swirly", "bubbly", "snug", "frosty", "tangy", "spunky", "happy",
  "merry", "feisty",
];

const NOUNS = [
  "toaster", "mongoose", "kettle", "compass", "marmot", "lantern",
  "moose", "pelican", "tractor", "narwhal", "popsicle", "kraken",
  "biscuit", "satchel", "hedgehog", "wombat", "trombone", "quokka",
  "puffin", "scarecrow", "thimble", "platypus", "jellybean", "yak",
  "anvil", "shrimp", "bagpipe", "muffin", "tortoise", "spatula",
  "pickle", "donkey", "weasel", "cabbage", "armadillo", "ferret",
  "pancake", "snowflake", "raccoon", "lobster", "gnome", "axolotl",
  "manatee", "panda", "noodle", "puddle", "umbrella", "kazoo",
  "fiddle", "walrus",
];

function pick<T>(arr: readonly T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i]!;
}

/**
 * Generate a single fresh candidate code like "neon-toaster-mongoose".
 * Pure — caller decides if it's actually available.
 */
export function generateInviteCode(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}`;
}

/**
 * Loose syntactic validity for user-typed codes. We allow lowercase
 * letters, digits and single hyphens — no spaces, no leading/trailing
 * hyphen, length 3-48. Stricter than necessary; matches what the
 * generator produces and what reads cleanly aloud.
 */
const CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSyntacticallyValidCode(raw: string): boolean {
  if (raw.length < 3 || raw.length > 48) return false;
  return CODE_PATTERN.test(raw);
}

export const CODE_RULES_HINT =
  "3–48 chars, lowercase letters / digits / hyphens (no spaces).";

// Word-based invite-code generation + slug validation. Pure (framework-agnostic)
// so apps/web and apps/admin-cli can share one implementation. Codes are
// memorable "silly word" slugs like "neon-toaster-mongoose" — readable aloud
// over voice.
//
// The word banks are intentionally short (adjective × noun ≈ 2500), so
// collision-by-luck is plausible at scale: callers MUST re-check availability
// against the DB before showing a generated code and again on submit — never
// trust generated uniqueness alone.

const ADJECTIVES = [
  "neon", "fizzy", "wonky", "cosmic", "spiky", "fluffy", "loopy",
  "sneaky", "bouncy", "groovy", "snazzy", "wibbly", "twirly", "jazzy",
  "kooky", "perky", "zesty", "moody", "glowing", "dazzle", "spry",
  "rusty", "minty", "salty", "smooth", "crinkly", "wobbly", "scruffy",
  "sleepy", "sparkly", "bouncing", "cheeky", "merry", "drowsy",
  "rowdy", "humming", "chirpy", "jolly", "tipsy", "wacky", "dizzy",
  "swirly", "bubbly", "snug", "frosty", "tangy", "spunky", "happy",
  "feisty",
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
  const value = arr[Math.floor(Math.random() * arr.length)];
  if (value === undefined) throw new Error("pick() from an empty word bank");
  return value;
}

/**
 * Generate a single fresh candidate code like "neon-toaster-mongoose".
 * Pure — the caller decides whether it's actually available.
 */
export function generateInviteCode(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}`;
}

/**
 * Loose syntactic validity for user-typed codes: lowercase letters, digits and
 * single internal hyphens — no spaces, no leading/trailing hyphen, length 3-48.
 * Matches what the generator produces and what reads cleanly aloud.
 */
const CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSyntacticallyValidCode(raw: string): boolean {
  if (raw.length < 3 || raw.length > 48) return false;
  return CODE_PATTERN.test(raw);
}

export const CODE_RULES_HINT =
  "3–48 chars, lowercase letters / digits / hyphens (no spaces).";

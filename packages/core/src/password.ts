// The password rule, in one place. The sign-up form, the reset form and the
// auth server (@camp404/auth's `minPasswordLength`) all read these numbers, so
// the browser and the server cannot disagree about what a password may be.
//
// AfrikaBurn's numbers, and AfrikaBurn's reasoning: one long passphrase, no
// composition rules, paste allowed. Sign-in applies neither rule: an account
// made before the minimum existed must still get in.

/** The shortest password a new Camp 404 account, or a reset, may set. */
export const PASSWORD_MIN_LENGTH = 15;

/**
 * The longest. Better Auth's own default, stated so the server and the form
 * name the same ceiling; it exists to bound the hashing work, not to limit
 * anyone's passphrase.
 */
export const PASSWORD_MAX_LENGTH = 128;

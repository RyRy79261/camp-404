import { headers } from "next/headers";
import { AUTH_SESSION, auth, canDeliverAuthEmail } from "@camp404/auth";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { ProfileSections } from "@/components/profile/profile-sections";
import { getAddressToConfirm } from "@/lib/auth";
import { requireMemberPage } from "@/lib/member-gate";
import { isE2ETestMode } from "@/lib/test-mode";
import { sessionLabel } from "./session-label";
import { SecurityPanels, type SecurityData } from "./security-panels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign-in and security — Camp 404" };

// How you get into your account, in the AfrikaBurn contributors app's security
// page: your password, a second factor, passkeys, and the devices signed in
// now. It exists because Camp 404 now runs its own sign-in (owner's call,
// 2026-09-22: "I would like two-factor and passkeys"); under Neon Auth none of
// this was possible.
//
// Everything is read here, on the server, for the signed-in member only — each
// Better Auth call is scoped to the session in the request headers, so this
// page cannot show anyone else's devices. A read that fails renders as "could
// not read", never as an empty list that looks like "nothing there".

/**
 * The Email card's data, or null once the address is confirmed. Read from the
 * signed-in member's own session: `emailVerified` comes from the same
 * getAuthenticatedUser() every gate uses (the test cookie in the E2E store).
 */
async function readConfirmEmail(
  emailVerified: boolean,
): Promise<SecurityData["confirmEmail"]> {
  if (emailVerified) return null;
  const email = await getAddressToConfirm();
  if (!email) return null;
  return { email, deliverable: canDeliverAuthEmail(process.env) };
}

async function readSecurity(
  confirmEmail: SecurityData["confirmEmail"],
): Promise<SecurityData> {
  // The E2E store signs members in with a test cookie, not a Better Auth
  // session, so there is nothing to read.
  if (isE2ETestMode()) {
    return {
      twoFactorEnabled: false,
      hasPassword: true,
      passkeys: [],
      sessions: null,
      confirmEmail,
    };
  }
  const h = await headers();
  const [session, accounts, passkeys, sessions] = await Promise.all([
    auth.api.getSession({ headers: h }).catch(() => null),
    auth.api.listUserAccounts({ headers: h }).catch(() => null),
    auth.api.listPasskeys({ headers: h }).catch(() => null),
    auth.api.listSessions({ headers: h }).catch(() => null),
  ]);
  const currentToken = session?.session.token ?? null;
  return {
    confirmEmail,
    twoFactorEnabled: session?.user.twoFactorEnabled === true,
    // Unknown counts as having one: asking for a password that exists is a
    // retry, while hiding the field for one that exists is a dead end.
    hasPassword:
      accounts === null ||
      accounts.some((account) => account.providerId === "credential"),
    passkeys: (passkeys ?? []).map((pk) => ({
      id: pk.id,
      name: pk.name ?? null,
      deviceType: pk.deviceType ?? null,
      createdAt: pk.createdAt ? new Date(pk.createdAt).toISOString() : null,
    })),
    sessions:
      sessions === null
        ? null
        : sessions
            .map((s) => ({
              token: s.token,
              label: sessionLabel(s.userAgent),
              ipAddress: s.ipAddress ?? null,
              lastSeen: s.updatedAt
                ? new Date(s.updatedAt).toISOString()
                : null,
              current: s.token === currentToken,
            }))
            // This device first, then the most recently used.
            .sort(
              (a, b) =>
                Number(b.current) - Number(a.current) ||
                (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""),
            ),
  };
}

export default async function SecurityPage() {
  const { authUser } = await requireMemberPage();
  const data = await readSecurity(
    await readConfirmEmail(authUser.emailVerified),
  );

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Security"
        title="Sign-in and security"
        description="How you get into Camp 404: your password, a second step at sign-in, passkeys, and the devices signed in right now."
      />
      <div className="flex flex-col gap-6">
        <ProfileSections active="security" />
        <SecurityPanels data={data} />
        <Card>
          <CardHeader>
            <CardTitle>How long a sign-out takes</CardTitle>
            <CardDescription>
              Signing a device out ends its session at once, but a page it
              already has open can keep working for up to{" "}
              {Math.round(AUTH_SESSION.cookieCacheMaxAgeSeconds / 60)} minutes,
              until it next checks in.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@camp404/core";
import { AccountChangePassword } from "@camp404/ui/components/account-change-password";
import {
  AccountPasskeys,
  type PasskeyRow,
} from "@camp404/ui/components/account-passkeys";
import {
  AccountSessions,
  type SessionView,
} from "@camp404/ui/components/account-sessions";
import { AccountTwoFactor } from "@camp404/ui/components/account-two-factor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { authClient } from "@/lib/auth-client";
import { SetFirstPassword } from "./set-first-password";

export interface SecurityData {
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  passkeys: PasskeyRow[];
  /** Null when the list could not be read — not the same as "none". */
  sessions: SessionView[] | null;
}

/** The server enforces the same numbers; this only says so first. */
function assessPassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, error: null };
}

/**
 * The four panels, each AfrikaBurn's shared component driven by this app's
 * Better Auth client. Every change calls the auth server from the browser, so
 * the session cookie it rotates lands where it belongs, and then re-reads the
 * server-rendered page.
 */
export function SecurityPanels({ data }: { data: SecurityData }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            {data.hasPassword
              ? "Change the password you sign in with."
              : "You sign in with Google or a passkey. Add a password to sign in with your email as well."}
          </CardDescription>
        </CardHeader>
        {data.hasPassword ? (
          <CardContent>
            <AccountChangePassword
              minLength={PASSWORD_MIN_LENGTH}
              assess={assessPassword}
              onChanged={refresh}
              onSubmit={async (input) => {
                const result = await authClient.changePassword(input);
                return result.error
                  ? {
                      ok: false,
                      error:
                        result.error.message ??
                        "That didn't work. Check your current password.",
                    }
                  : { ok: true, message: "Password changed." };
              }}
            />
          </CardContent>
        ) : (
          <CardContent>
            <SetFirstPassword onSet={refresh} />
          </CardContent>
        )}
      </Card>

      <AccountTwoFactor
        client={authClient}
        enabled={data.twoFactorEnabled}
        requiresPassword={data.hasPassword}
        onChanged={refresh}
      />

      <AccountPasskeys
        client={authClient}
        passkeys={data.passkeys}
        onChanged={refresh}
      />

      <Card>
        <CardHeader>
          <CardTitle>Signed-in devices</CardTitle>
          <CardDescription>
            Every browser and phone signed in to your account. End any you
            don&rsquo;t recognise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSessions
            sessions={data.sessions ?? []}
            onChanged={refresh}
            onRevoke={async (token) => {
              const result = await authClient.revokeSession({ token });
              return result.error
                ? {
                    ok: false,
                    error: "Couldn't sign that device out. Try again.",
                  }
                : { ok: true, message: "That device is signed out." };
            }}
            onRevokeOthers={async () => {
              const result = await authClient.revokeOtherSessions();
              return result.error
                ? {
                    ok: false,
                    error: "Couldn't sign the other devices out. Try again.",
                  }
                : { ok: true };
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

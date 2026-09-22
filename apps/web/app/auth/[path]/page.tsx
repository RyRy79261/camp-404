import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isEmailProviderConfigured, isGoogleConfigured } from "@camp404/auth";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "../forgot-password-form";
import { ResetPasswordForm } from "../reset-password-form";
import { SignInForm } from "../sign-in-form";
import { SignOutView } from "../sign-out-view";
import { SignUpForm } from "../sign-up-form";

// Every sign-in screen, drawn by us. Under Neon Auth any path we had no form
// for fell through to Neon's hosted page; with self-hosted Better Auth there is
// no hosted page, so forgot-password, reset-password and sign-out are ours too,
// and any other path goes to sign-in instead of a blank.
export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  "sign-in": "Sign in",
  "sign-up": "Sign up",
  "forgot-password": "Forgot password",
  "reset-password": "Reset password",
  "sign-out": "Signing out",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return { title: `${TITLES[path] ?? "Account"} — Camp 404` };
}

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { path } = await params;
  // Offer Google only when this deployment has its keys; a button that can
  // only fail is worse than none.
  const googleEnabled = isGoogleConfigured(process.env);

  switch (path) {
    case "sign-up":
      // Sign-up is open — the invite check happens after auth at the
      // /signup/required gate, since Google can create an identity at
      // sign-in time too.
      return (
        <AuthShell>
          <SignUpForm googleEnabled={googleEnabled} />
        </AuthShell>
      );
    case "sign-in":
      return (
        <AuthShell>
          <Suspense fallback={null}>
            <SignInForm googleEnabled={googleEnabled} />
          </Suspense>
        </AuthShell>
      );
    case "forgot-password":
      return (
        <AuthShell>
          <ForgotPasswordForm
            emailEnabled={isEmailProviderConfigured(process.env)}
          />
        </AuthShell>
      );
    case "reset-password": {
      // Better Auth puts the token on the link, or `?error=` when it refused
      // the token before redirecting here. Both without a usable token get
      // the same honest dead end and a way to ask for a new link.
      const { token, error } = await searchParams;
      return (
        <AuthShell>
          <ResetPasswordForm token={error ? null : token?.trim() || null} />
        </AuthShell>
      );
    }
    case "sign-out":
      return (
        <AuthShell>
          <SignOutView />
        </AuthShell>
      );
    default:
      redirect("/auth/sign-in");
  }
}

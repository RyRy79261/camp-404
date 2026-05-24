import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthView } from "@neondatabase/auth/react/ui";
import { AuthShell } from "@/components/auth-shell";
import { INVITE_COOKIE } from "@/lib/access-control";
import { SignInForm } from "../sign-in-form";
import { SignUpForm } from "../sign-up-form";

// Reads the invite cookie for the sign-up guard — can't be statically
// prerendered. `dynamicParams` is left at the default (true) so any
// auth subpath Neon Auth ends up redirecting to (error states,
// provider-specific paths, …) renders via the AuthView fallback rather
// than 404ing.
export const dynamic = "force-dynamic";

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  if (path === "sign-up") {
    const cookieStore = await cookies();
    if (!cookieStore.get(INVITE_COOKIE)?.value) {
      redirect("/signup");
    }
    return (
      <AuthShell hideBack>
        <SignUpForm />
      </AuthShell>
    );
  }

  if (path === "sign-in") {
    return (
      <AuthShell hideBack>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </AuthShell>
    );
  }

  // Forgot/reset password, callback, sign-out, magic-link — fall back to
  // Neon Auth's hosted UI. Those flows are side trips we haven't (yet)
  // built bespoke screens for.
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12">
      <AuthView path={path} />
    </main>
  );
}

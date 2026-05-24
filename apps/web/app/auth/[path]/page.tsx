import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthView } from "@neondatabase/auth/react/ui";
import { authViewPaths } from "@neondatabase/auth/react/ui/server";
import { INVITE_COOKIE } from "@/lib/access-control";

// Statically known views: sign-in, sign-up, forgot-password, reset-password,
// callback, sign-out, magic-link, etc.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

// The sign-up view must always sit downstream of /signup's invite-code
// gate — we don't want anyone creating an account (password OR Google)
// without first redeeming a code. Reading the invite cookie here forces
// the page to render dynamically.
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
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12">
      <AuthView path={path} />
    </main>
  );
}

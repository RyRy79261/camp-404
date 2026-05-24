import { InviteCodeForm } from "./invite-form";

export const metadata = {
  title: "Sign up — Camp 404",
};

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">Camp 404</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Sign-up is invite-only. Drop your code below to continue.
        </p>
      </header>
      <InviteCodeForm />
      <p className="text-center text-xs text-[color:var(--color-muted-foreground)]">
        Already have an account?{" "}
        <a className="underline" href="/auth/sign-in">
          Sign in
        </a>
      </p>
    </main>
  );
}

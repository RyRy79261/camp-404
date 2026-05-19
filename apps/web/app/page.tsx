import { auth } from "@/lib/auth";
import { QuadrantNav } from "@camp404/ui/components/quadrant-nav";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Camp 404</h1>
          <p className="mt-2 max-w-sm text-sm text-[color:var(--color-muted-foreground)]">
            A calm command centre for a chaotic desert.
          </p>
        </div>
        <a
          href="/signin"
          className="rounded-md bg-[color:var(--color-primary)] px-6 py-3 text-sm font-medium text-[color:var(--color-primary-foreground)]"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <QuadrantNav
      topLeft={{ label: "Members", href: "/members" }}
      topRight={{ label: "Meals", href: "/meals" }}
      bottomLeft={{ label: "Reimbursements", href: "/reimbursements" }}
      bottomRight={{ label: "Manuals", href: "/manuals" }}
      centre={{ label: "Hold to talk" }}
    />
  );
}

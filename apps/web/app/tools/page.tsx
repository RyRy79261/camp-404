import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ClipboardList, type LucideIcon } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

interface ToolEntry {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

// The camp's grab-bag of member tools. Add entries here as features land —
// the page is just a registry of links.
const TOOLS: ToolEntry[] = [
  {
    href: "/tools/forms",
    title: "My forms",
    description:
      "Revisit a questionnaire you've already completed, update your answers, and see what changed.",
    icon: ClipboardList,
  },
];

export default async function ToolsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  // Tools sit behind the onboarding gate, same as the rest of the app.
  const profile = await getBurnerProfile(campUser.id);
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Home
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Meals, expenses and the bits of admin that keep the camp running.
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.href} href={tool.href} className="block">
              <Card className="transition-colors hover:border-[color:var(--color-primary)]">
                <CardHeader className="flex-row items-start gap-3 space-y-0">
                  <span className="mt-0.5 rounded-lg bg-[color:var(--color-muted)] p-2 text-[color:var(--color-foreground)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <CardTitle className="text-lg">{tool.title}</CardTitle>
                    <CardDescription>{tool.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

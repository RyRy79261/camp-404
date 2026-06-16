import { redirect } from "next/navigation";
import {
  ChevronLeft,
  ClipboardList,
  GitBranch,
  Mail,
} from "lucide-react";
import { DetailHeader } from "@camp404/ui/components/detail-header";
import { NavCard } from "@camp404/ui/components/nav-card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tools — Camp 404" };

// Uncategorised toolbox for camp members — everything that doesn't yet
// live under a more specific section goes here. Reachable from the
// "Tools" tile on the home control panel.

interface ToolEntry {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const TOOLS: ToolEntry[] = [
  {
    href: "/tools/invite",
    title: "Invite a member",
    description: "Mint a named invite link to bring someone onto Camp 404.",
    icon: <Mail className="text-primary" />,
  },
  {
    href: "/tools/forms",
    title: "My forms",
    description:
      "Revisit a questionnaire you've already completed, update your answers, and see what changed.",
    icon: <ClipboardList className="text-primary" />,
  },
  {
    href: "/family-tree",
    title: "Family tree",
    description: "See who brought who onto camp.",
    icon: <GitBranch className="text-primary" />,
  },
];

export default async function ToolsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  return (
    <main className="mx-auto w-full max-w-lg">
      {/* Back-nav bar labelled by its destination (matches /notifications), so
          the page's single h1 is the "Tools" hero below — no duplicate heading. */}
      <DetailHeader
        as="h2"
        title="Home"
        className="px-3 py-3.5"
        leading={
          <a
            href="/"
            aria-label="Back to home"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </a>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-sm text-muted-foreground">
            Uncategorised tooling for camp members. We&apos;ll move tools into
            dedicated sections as we group them.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {TOOLS.map((tool) => (
            <NavCard
              key={tool.href}
              href={tool.href}
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

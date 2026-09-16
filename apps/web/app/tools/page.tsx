import Link from "next/link";
import {
  ClipboardList,
  GitBranch,
  Mail,
} from "lucide-react";
import { BackButton } from "@camp404/ui/components/back-button";
import { DetailHeader } from "@camp404/ui/components/detail-header";
import { NavCard } from "@camp404/ui/components/nav-card";
import { requireMemberPage } from "@/lib/member-gate";

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
    description: "Mint a named invite code to bring someone onto Camp 404.",
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
  await requireMemberPage();

  return (
    <main className="mx-auto w-full max-w-lg">
      {/* Board S13: the bar reads "Tools", as does the hero below. The bar stays
          an h2, so the page keeps one h1. */}
      <DetailHeader
        as="h2"
        title="Tools"
        className="px-3 py-3.5"
        leading={
          <BackButton linkAs={Link} href="/" label="Back to home" />
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
              linkAs={Link}
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, GitBranch, Mail } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tools — Camp 404" };

// Uncategorised toolbox for camp members — everything that doesn't yet
// live under a more specific quadrant goes here. Reachable from the
// "Tools" quadrant on the home control panel.

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
    description: "Mint a single-use code to bring someone onto Camp 404.",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    href: "/family-tree",
    title: "Family tree",
    description: "See who brought who onto camp.",
    icon: <GitBranch className="h-5 w-5" />,
  },
];

export default async function ToolsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uncategorised tooling for camp members. We'll move tools into
          dedicated quadrants as we group them.
        </p>
      </header>

      <ul className="space-y-3">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link href={tool.href} className="block focus:outline-none">
              <Card className="transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring">
                <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">
                    {tool.icon}
                  </span>
                  <div className="flex-1">
                    <CardTitle className="text-base">{tool.title}</CardTitle>
                    <CardDescription className="mt-0.5">
                      {tool.description}
                    </CardDescription>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

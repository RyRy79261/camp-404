import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { GateScreen } from "@/components/auth-shell";

// Next composes this with the root layout's template so the tab reads sensibly
// instead of inheriting the previous route's title on a client-side miss.
export const metadata: Metadata = { title: "Page not found" };

// Rendered for any unmatched route and for `notFound()` calls. It sits inside
// the root layout, so the user stays within the app shell (theme, providers)
// rather than dropping to Next's bare default 404. Drawn as the AfrikaBurn
// organiser console's not-found gate.
export default function NotFound() {
  return (
    <GateScreen
      icon={<Compass aria-hidden />}
      eyebrow="Error 404"
      title="You’re properly lost."
      description="This page wandered off into the dust. There’s nothing here — but the camp’s still standing."
    >
      <div className="flex items-center justify-center">
        <Button asChild size="lg">
          <Link href="/">Back to camp</Link>
        </Button>
      </div>
    </GateScreen>
  );
}

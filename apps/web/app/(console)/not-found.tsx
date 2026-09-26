import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";

/**
 * A console page that called `notFound()` (a meeting that is gone, a recipe
 * nobody can find), shown inside its desktop window with the desktop still up.
 * It still answers 404: there is no Suspense boundary above the pages
 * (AGENTS.md). A URL that matches no page at all gets the root not-found
 * screen instead.
 */
export default function ConsoleNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <PageHeading
        eyebrow="Error 404"
        title="Page not found"
        description="This page isn't here any more, or it never was. Close the window, or head back to the desktop."
      />
      <Compass aria-hidden className="size-8 text-muted-foreground" />
      <Button asChild variant="outline">
        <Link href="/">Back to the desktop</Link>
      </Button>
    </div>
  );
}

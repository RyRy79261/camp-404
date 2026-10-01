import Link from "next/link";
import { History } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { guideDay, guideVersionPath } from "@/lib/guide-copy";

// Every published version of a chapter, newest first (#250). Each opens as it
// was; the one being read is marked.

export function VersionsCard({
  slug,
  versions,
  current,
  live,
}: {
  slug: string;
  versions: readonly {
    version: number;
    publishedAt: Date;
    publishedByName: string | null;
  }[];
  /** The version on screen. */
  current: number;
  /** The version members read now, or null when it is off the guide. */
  live: number | null;
}) {
  return (
    <Card role="region" aria-labelledby="chapter-versions">
      <CardHeader className="pb-1">
        <CardTitle
          id="chapter-versions"
          className="flex items-center gap-2 text-base"
        >
          <History className="h-4 w-4 text-accent" aria-hidden />
          Versions
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <ul className="divide-y divide-border">
          {versions.map((v) => (
            <li key={v.version} className="py-2 text-sm">
              {v.version === current ? (
                <span className="font-medium" aria-current="page">
                  Version {v.version}
                </span>
              ) : (
                <Link
                  href={guideVersionPath(slug, v.version)}
                  className="font-medium hover:text-accent"
                >
                  Version {v.version}
                </Link>
              )}
              {v.version === live ? (
                <span className="text-accent"> · on the guide</span>
              ) : null}
              <span className="block text-xs text-muted-foreground">
                {guideDay(v.publishedAt)}
                {v.publishedByName ? ` · ${v.publishedByName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

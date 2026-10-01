import { Suspense } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { isAuditCursor, listAuditLog } from "@camp404/db/audit";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { SkeletonTable } from "@camp404/ui/components/skeleton";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { auditEntry, type AuditEntry } from "@/lib/audit-format";
import { captainPageGate } from "@/lib/captain-gate";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { usesTestStore } from "@/lib/test-mode";

export const dynamic = "force-dynamic";

export const metadata = { title: "Audit log — Camp 404" };

// The audit trail: who changed or read someone else's data, newest first.
// Captain-only, preview-but-locked (D3): anyone else sees the heading and a
// lock, and no row is read.

const COLUMNS: ResponsiveColumn<AuditEntry>[] = [
  {
    id: "what",
    header: "What",
    role: "title",
    cellClassName: "font-medium",
    cell: (e) => e.what,
  },
  { id: "who", header: "Who", cell: (e) => e.who },
  { id: "about", header: "About", cell: (e) => e.about ?? "—" },
  {
    id: "detail",
    header: "Detail",
    cell: (e) => e.detail ?? "—",
  },
  {
    id: "when",
    header: "When",
    cellClassName: "whitespace-nowrap",
    cell: (e) => (
      <span className="flex flex-col">
        <span className="tabular-nums">{e.when}</span>
        {e.ago && (
          <span className="text-xs text-muted-foreground">{e.ago}</span>
        )}
      </span>
    ),
  },
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  // The gate first, before any boundary: the refusal and the page's status
  // are decided here, on the server.
  const { cleared } = await captainPageGate("captain");
  const { before } = await searchParams;
  const cursor = before && isAuditCursor(before) ? before : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Audit"
        title="Audit log"
        description="Every change to someone else's data, and every read of private data, newest first."
      />

      {!cleared ? (
        <CaptainLock message="The audit log is captain-only. Your rank doesn't have clearance for this." />
      ) : (
        // The rows stream in behind a skeleton: the heading shows as soon as
        // the gate has run. Nothing below decides access.
        <Suspense fallback={<SkeletonTable label="Loading the audit log…" />}>
          <AuditRows cursor={cursor} />
        </Suspense>
      )}
    </div>
  );
}

/** One page of the audit log, for a viewer the page has already cleared. */
export async function AuditRows({ cursor }: { cursor: string | null }) {
  const data = await (async () => {
    if (usesTestStore()) return { entries: [], nextCursor: null };
    const [page, teams] = await Promise.all([
      listAuditLog({ before: cursor }),
      getTeamsConfig(),
    ]);
    const labels = teamLabelMap(teams);
    const now = new Date();
    return {
      entries: page.rows.map((row) =>
        auditEntry(row, (key) => labels[key] ?? key, now),
      ),
      nextCursor: page.nextCursor,
    };
  })();

  return (
    <>
      {data.entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" aria-hidden />}
          title={cursor ? "No older entries" : "Nothing recorded yet"}
          description={
            cursor
              ? "You have reached the first entry."
              : "Approvals, rank and team changes, payments and reads of private data show up here."
          }
        />
      ) : (
        <ResponsiveDataTable
          columns={COLUMNS}
          data={data.entries}
          getRowKey={(e) => e.id}
          label="Audit log"
          framed
        />
      )}

      {(cursor || data.nextCursor) && (
        <nav
          aria-label="Audit log pages"
          className="mt-4 flex items-center justify-between gap-3"
        >
          {cursor ? (
            <Button asChild variant="ghost">
              <Link href="/captains/audit">Newest</Link>
            </Button>
          ) : (
            <span />
          )}
          {data.nextCursor && (
            <Button asChild variant="outline">
              <Link
                href={`/captains/audit?before=${encodeURIComponent(data.nextCursor)}`}
              >
                Older
              </Link>
            </Button>
          )}
        </nav>
      )}
    </>
  );
}

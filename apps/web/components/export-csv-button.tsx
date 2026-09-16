import { Download } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The Export CSV control. It is a plain link to an export route, which builds
// the file on download. No CSV logic lives here, and no data reaches the
// browser until someone asks for the file. Used by questionnaire responses and
// the member roster.
//
// A plain <a>, not next/link: the target is a file download, not a page, so
// there is nothing to prefetch or client-navigate to.

export function ExportCsvButton({
  href,
  disabled = false,
}: {
  href: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Download className="h-4 w-4" aria-hidden />
        Export CSV
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href}>
        <Download className="h-4 w-4" aria-hidden />
        Export CSV
      </a>
    </Button>
  );
}

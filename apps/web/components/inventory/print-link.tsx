import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";

// "Print … (A4)": opens the sheet in a tab of its own, where Download PDF
// makes the file (#249). There is no internet at the burn, so paper is how
// these lists get there.

export function PrintLink({
  href,
  children,
  primary = false,
  size,
  className,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  size?: "sm";
  className?: string;
}) {
  return (
    <Button
      asChild
      variant={primary ? "default" : "outline"}
      size={size}
      className={cn(className)}
    >
      <Link href={href} target="_blank" rel="noopener">
        <Printer aria-hidden />
        {children}
      </Link>
    </Button>
  );
}

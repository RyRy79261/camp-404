"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@camp404/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@camp404/ui/components/dropdown-menu";
import { cn } from "@camp404/ui/lib/utils";
import { activeNavHref, type NavNode } from "@/lib/console-nav";

/**
 * The label, plus the router's own pending state for THIS link.
 *
 * Every console page is a per-user server render, so a click is always followed
 * by a real round trip. `useLinkStatus` has to read it from inside the `<Link>`,
 * which is why this is its own component. There is no `loading.tsx` in the
 * console (AGENTS.md), so the nav item itself confirms the click landed. A menu
 * stays open until the new page arrives, so an item inside one pulses too.
 */
function NavLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "transition-opacity",
        pending && "animate-pulse opacity-70 motion-reduce:animate-none",
      )}
    >
      {label}
      {pending && <span className="sr-only"> — loading</span>}
    </span>
  );
}

const PILL = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
const PILL_ACTIVE = "bg-accent/15 text-accent";
const PILL_IDLE =
  "text-muted-foreground hover:bg-secondary hover:text-foreground";

const OPEN_KEYS = new Set(["Enter", " ", "ArrowDown"]);

/**
 * Open state that belongs to one page. It is the path the menu was opened on,
 * so the menu closes by itself when the page it led to arrives, and never
 * needs an effect to do it.
 */
function useOpenOnThisPage(pathname: string) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  return [
    openOn === pathname,
    (open: boolean) => setOpenOn(open ? pathname : null),
  ] as const;
}

function NavMenu({
  node,
  activeHref,
  pathname,
}: {
  node: Extract<NavNode, { kind: "group" }>;
  activeHref: string | null;
  pathname: string;
}) {
  const [open, setOpen] = useOpenOnThisPage(pathname);
  // How the menu was opened. From the keyboard, focus goes to the first item
  // (the menu button pattern); Radix does that only when it saw the key
  // itself, and it missed the first press on a freshly loaded page.
  const byKeyboard = useRef(false);
  const active = node.sections.some((s) =>
    s.some((i) => i.href === activeHref),
  );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        onKeyDown={(event) => {
          byKeyboard.current = OPEN_KEYS.has(event.key);
        }}
        onPointerDown={() => {
          byKeyboard.current = false;
        }}
        className={cn(
          PILL,
          "group inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary data-[state=open]:text-foreground",
          active ? PILL_ACTIVE : PILL_IDLE,
        )}
      >
        {node.label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // Radix focuses the menu itself on open; from the keyboard, move on
        // to the first item.
        onFocus={(event) => {
          if (!byKeyboard.current || event.target !== event.currentTarget) {
            return;
          }
          byKeyboard.current = false;
          event.currentTarget
            .querySelector<HTMLElement>('[role="menuitem"]')
            ?.focus({ preventScroll: true });
        }}
      >
        {node.sections.map((section, index) => (
          <Fragment key={index}>
            {index > 0 && <DropdownMenuSeparator />}
            {section.map((item) => (
              <DropdownMenuItem
                key={item.href}
                asChild
                // Stay open while the next page loads, so the pressed item
                // can pulse; the menu closes when that page arrives. The page
                // already open closes it at once, since nothing will load.
                onSelect={(event) => {
                  if (item.href !== pathname) event.preventDefault();
                }}
                className={cn(
                  item.href === activeHref && "text-accent focus:text-accent",
                )}
              >
                <Link
                  href={item.href}
                  aria-current={item.href === activeHref ? "page" : undefined}
                >
                  <NavLabel label={item.label} />
                </Link>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * On a phone the menus fold into one sheet: the links, then each menu's
 * entries under its name.
 */
function NavSheet({
  nodes,
  activeHref,
  pathname,
}: {
  nodes: NavNode[];
  activeHref: string | null;
  pathname: string;
}) {
  const [open, setOpen] = useOpenOnThisPage(pathname);
  const links = nodes.filter((n) => n.kind === "link");
  const groups = nodes.filter((n) => n.kind === "group");

  const item = (href: string, label: string) => (
    <li key={href}>
      <Link
        href={href}
        aria-current={href === activeHref ? "page" : undefined}
        // The page already open: nothing will load, so close now.
        onClick={() => {
          if (href === pathname) setOpen(false);
        }}
        className={cn(
          PILL,
          "block py-2",
          href === activeHref ? PILL_ACTIVE : PILL_IDLE,
        )}
      >
        <NavLabel label={label} />
      </Link>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Menu aria-hidden />
          Menu
        </Button>
      </DialogTrigger>
      <DialogContent
        // Start on the page open now, not the close button.
        onOpenAutoFocus={(event) => {
          const current = event.currentTarget as HTMLElement | null;
          const here = current?.querySelector<HTMLElement>(
            '[aria-current="page"]',
          );
          if (!here) return;
          event.preventDefault();
          here.focus();
        }}
        className="top-0 left-0 flex h-svh max-h-svh w-full max-w-[20rem] translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-y-0 border-l-0 p-4 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 motion-reduce:animate-none sm:max-w-[20rem]"
      >
        <div className="pr-8">
          <DialogTitle className="text-base">Menu</DialogTitle>
          <DialogDescription className="sr-only">
            Every page of the camp console you can open.
          </DialogDescription>
        </div>
        <ul className="flex flex-col gap-0.5">
          {links.map((l) => item(l.href, l.label))}
        </ul>
        {groups.map((group) => (
          <section
            key={group.label}
            aria-labelledby={`nav-sheet-${group.label}`}
            className="flex flex-col gap-1"
          >
            <h2
              id={`nav-sheet-${group.label}`}
              className="px-3 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-accent"
            >
              {group.label}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {group.sections.flat().map((i) => item(i.href, i.label))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Primary console nav with active-route highlighting (accent): a few links,
 * then a menu per group (issue #266). Below `md` the whole thing is one sheet.
 * The server has already dropped what the viewer's rank may not open.
 */
export function ConsoleNav({ nodes }: { nodes: NavNode[] }) {
  const pathname = usePathname();
  const activeHref = activeNavHref(
    pathname,
    nodes.flatMap((n) =>
      n.kind === "link" ? [n.href] : n.sections.flat().map((i) => i.href),
    ),
  );

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Console">
        {nodes.map((node) =>
          node.kind === "link" ? (
            <Link
              key={node.href}
              href={node.href}
              aria-current={node.href === activeHref ? "page" : undefined}
              className={cn(
                PILL,
                node.href === activeHref ? PILL_ACTIVE : PILL_IDLE,
              )}
            >
              <NavLabel label={node.label} />
            </Link>
          ) : (
            <NavMenu
              key={node.label}
              node={node}
              activeHref={activeHref}
              pathname={pathname}
            />
          ),
        )}
      </nav>
      <nav className="flex items-center md:hidden" aria-label="Console">
        <NavSheet nodes={nodes} activeHref={activeHref} pathname={pathname} />
      </nav>
    </>
  );
}

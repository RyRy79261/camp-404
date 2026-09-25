"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
import { activeNavHref, type NavItem, type NavNode } from "@/lib/console-nav";
import { navIcon } from "@/lib/nav-icons";

/**
 * The label, plus the router's own pending state for THIS link.
 *
 * Every console page is a per-user server render, so a click is always followed
 * by a real round trip. `useLinkStatus` has to read it from inside the `<Link>`,
 * which is why this is its own component. There is no `loading.tsx` in the
 * console (AGENTS.md), so the nav item itself confirms the click landed. A menu
 * stays open until the new page arrives, so an item inside one pulses too.
 */
function NavLabel({
  label,
  onSettled,
}: {
  label: string;
  /**
   * Called when this link's load ends. A menu closes on the new page's
   * arrival; this also closes it when the link lands back on the page already
   * open (a redirect), where the address never changes.
   */
  onSettled?: () => void;
}) {
  const { pending } = useLinkStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onSettled?.();
    wasPending.current = pending;
  }, [pending, onSettled]);
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
                  <NavLabel
                    label={item.label}
                    onSettled={() => setOpen(false)}
                  />
                </Link>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A small tile in the phone menu: the place's picture over its name. */
function NavTile({
  item,
  activeHref,
  onSamePage,
  onSettled,
}: {
  item: NavItem;
  activeHref: string | null;
  onSamePage: () => void;
  onSettled: () => void;
}) {
  const Icon = navIcon(item.href);
  const active = item.href === activeHref;
  return (
    <li className="min-w-0">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onSamePage}
        className={cn(
          "flex h-full flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[0.7rem] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? PILL_ACTIVE : PILL_IDLE,
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="line-clamp-2 break-words">
          <NavLabel label={item.label} onSettled={onSettled} />
        </span>
      </Link>
    </li>
  );
}

const TILE_GRID = "grid grid-cols-3 gap-1";

/**
 * On a phone the nav is one sheet from the right (the owner, 2026-09-25): the
 * plain links as small icon tiles, then each menu as a section that opens and
 * closes, its entries as tiles in a grid. The section holding the page open
 * now starts open; the rest start closed, so the sheet stays short.
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
  // A section the member opened or closed by hand; the rest follow the page.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const links = nodes.filter((n) => n.kind === "link");
  const groups = nodes.filter((n) => n.kind === "group");

  // The page already open: nothing will load, so close now.
  const closeIfHere = (href: string) => () => {
    if (href === pathname) setOpen(false);
  };
  const close = () => setOpen(false);

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
          // Only a tile on screen: one in a closed section cannot take focus.
          const here = Array.from(
            current?.querySelectorAll<HTMLElement>('[aria-current="page"]') ??
              [],
          ).find((el) => !el.closest("[hidden]"));
          if (!here) return;
          event.preventDefault();
          here.focus();
        }}
        className="top-0 right-0 left-auto flex h-svh max-h-svh w-full max-w-[18rem] translate-x-0 translate-y-0 flex-col gap-3 overflow-y-auto rounded-none border-y-0 border-r-0 p-3 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 motion-reduce:animate-none sm:max-w-[18rem]"
      >
        <div className="pr-8">
          <DialogTitle className="text-sm">Menu</DialogTitle>
          <DialogDescription className="sr-only">
            Every page of the camp console you can open.
          </DialogDescription>
        </div>
        <ul className={TILE_GRID}>
          {links.map((l) => (
            <NavTile
              key={l.href}
              item={l}
              activeHref={activeHref}
              onSamePage={closeIfHere(l.href)}
              onSettled={close}
            />
          ))}
        </ul>
        {groups.map((group) => {
          const items = group.sections.flat();
          const holdsPage = items.some((i) => i.href === activeHref);
          const expanded = toggled[group.label] ?? holdsPage;
          const id = `nav-sheet-${group.label}`;
          return (
            <section
              key={group.label}
              aria-labelledby={`${id}-heading`}
              className="flex flex-col gap-1 border-t border-border pt-2"
            >
              <h2 id={`${id}-heading`}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() =>
                    setToggled((t) => ({ ...t, [group.label]: !expanded }))
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-1 py-1 font-mono text-[0.65rem] uppercase tracking-[0.25em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    holdsPage ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform motion-reduce:transition-none",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              </h2>
              <ul id={id} hidden={!expanded} className={TILE_GRID}>
                {items.map((i) => (
                  <NavTile
                    key={i.href}
                    item={i}
                    activeHref={activeHref}
                    onSamePage={closeIfHere(i.href)}
                    onSettled={close}
                  />
                ))}
              </ul>
            </section>
          );
        })}
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
      <nav
        className="flex items-center justify-end md:hidden"
        aria-label="Console"
      >
        <NavSheet nodes={nodes} activeHref={activeHref} pathname={pathname} />
      </nav>
    </>
  );
}

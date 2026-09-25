import {
  Activity,
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  CarFront,
  ChefHat,
  ClipboardList,
  Droplets,
  FileText,
  Hammer,
  HeartPulse,
  House,
  KanbanSquare,
  Laugh,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  MessagesSquare,
  Music,
  Network,
  NotebookPen,
  Palette,
  Plug,
  Recycle,
  ScrollText,
  Settings,
  ShieldCheck,
  Speaker,
  Truck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Pictures for the console's places, shared by Home's team icons and the phone
// menu's tiles. The nav's entries come from the server as plain data, so the
// picture is looked up here by the entry's address.

/** A picture per team. Configurable labels, fixed keys: an unknown key gets a group. */
export const TEAM_ICONS: Record<string, LucideIcon> = {
  kitchen: ChefHat,
  structures: Hammer,
  power_and_lighting: Zap,
  // The key predates the split: this is Sanitation and MOOP, and Water has
  // its own entry below.
  sanitation_and_water: Recycle,
  health_and_safety: HeartPulse,
  art_and_activities: Palette,
  ministry_of_memes: Laugh,
  ministry_of_vibes: Music,
  finance: Wallet,
  transport_and_logistics: Truck,
  communications_and_hr: MessagesSquare,
  mutant_vehicle: CarFront,
  sound: Speaker,
  water: Droplets,
};

const PAGE_ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/tasks": KanbanSquare,
  "/calendar": CalendarDays,
  "/captains/camp-management": Users,
  "/family-tree": Network,
  "/power": Plug,
  "/kitchen/recipes": BookOpen,
  "/meetings": NotebookPen,
  "/profile": UserRound,
  "/notifications": Bell,
  "/tools/forms": FileText,
  "/tools/invite": UserPlus,
  "/profile/security": ShieldCheck,
  "/captains/overview": LayoutDashboard,
  "/captains/questionnaires": ClipboardList,
  "/captains/announcements": Megaphone,
  "/captains/payments": Banknote,
  "/captains/camp-settings": Settings,
  "/captains/audit": ScrollText,
  "/captains/system": Activity,
};

/** The picture for a nav entry: a team's own, a page's, or a plain grid. */
export function navIcon(href: string): LucideIcon {
  const key = /^\/teams\/([^/]+)$/.exec(href)?.[1];
  if (key) return TEAM_ICONS[decodeURIComponent(key)] ?? Users;
  return PAGE_ICONS[href] ?? LayoutGrid;
}

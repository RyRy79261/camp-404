import {
  Activity,
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CarFront,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Folder,
  Gamepad2,
  FolderHeart,
  Globe,
  KanbanSquare,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Network,
  NotebookPen,
  Plug,
  ScrollText,
  Settings,
  SquareTerminal,
  UserPlus,
  UserRound,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { TEAM_ICONS } from "@/lib/nav-icons";

// A picture for each program, by the icon key the manifest sends (never by
// anything that says who may open it). PR C draws them with the console's
// own lucide set on its current tokens; the 404 OS drawings are PR D.

const PROGRAM_ICONS: Record<string, LucideIcon> = {
  inbox: Bell,
  "my-forms": FileText,
  account: UserRound,
  invites: UserPlus,
  "my-lift": CarFront,
  tasks: KanbanSquare,
  calendar: CalendarDays,
  roster: Users,
  meetings: NotebookPen,
  "family-tree": Network,
  power: Plug,
  recipes: BookOpen,
  "meal-plan": UtensilsCrossed,
  "recipe-review": ClipboardCheck,
  questionnaires: ClipboardList,
  announcements: Megaphone,
  announcement: Megaphone,
  "new-event": CalendarPlus,
  overview: LayoutDashboard,
  payments: Banknote,
  "camp-settings": Settings,
  "join-site": Globe,
  audit: ScrollText,
  system: Activity,
  form: FileText,
  "form-answers": FileText,
  questionnaire: FileText,
  meeting: NotebookPen,
  "new-meeting": NotebookPen,
  "edit-meeting": NotebookPen,
  recipe: BookOpen,
  "new-recipe": BookOpen,
  "edit-recipe": BookOpen,
  "recipe-version": BookOpen,
  "recipe-source": BookOpen,
  "edit-questionnaire": ClipboardList,
  "preview-questionnaire": ClipboardList,
  "send-questionnaire": ClipboardList,
  results: ClipboardList,
  "respondent-answers": ClipboardList,
  team: Users,
  terminal: SquareTerminal,
  inkblot: Gamepad2,
  folder: Folder,
  "member-folder": FolderHeart,
  kitchen: ChefHat,
};

/** The picture for a manifest program: a team's own, else its icon key's. */
export function programIcon(program: { id: string; icon: string }): LucideIcon {
  if (program.id.startsWith("team:")) {
    return TEAM_ICONS[program.id.slice("team:".length)] ?? Users;
  }
  return PROGRAM_ICONS[program.icon] ?? LayoutGrid;
}

/** The picture for an icon key alone (a folder, or a child program by its id). */
export function iconFor(key: string): LucideIcon {
  return PROGRAM_ICONS[key] ?? LayoutGrid;
}

/** A team folder's picture: the team's own. */
export function teamIcon(team: string): LucideIcon {
  return TEAM_ICONS[team] ?? Users;
}

/** Draw a lucide picture the way the OS icon components ask: with classes. */
export function drawIcon(Icon: LucideIcon) {
  return function DrawnIcon(className: string) {
    return <Icon aria-hidden strokeWidth={1.5} className={className} />;
  };
}

import {
  Car,
  Coffee,
  Flame,
  Heart,
  Sofa,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { GiftIcon } from "@camp404/types";

// Each gift's icon and its plain name (the Join site editor's picker, and the
// gift list on About). A plain module, so the server page and the client
// editor read the same one.

export const GIFT_ICON: Record<GiftIcon, { icon: LucideIcon; name: string }> =
  {
    orphanage: { icon: Heart, name: "Orphanage" },
    breakfast: { icon: Coffee, name: "Breakfast" },
    lounge: { icon: Sofa, name: "Lounge" },
    meow: { icon: Car, name: "Mutant vehicle" },
    flames: { icon: Flame, name: "Fire" },
    art: { icon: Sparkles, name: "Art" },
  };

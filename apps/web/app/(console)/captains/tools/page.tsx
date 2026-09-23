import { permanentRedirect } from "next/navigation";

// The captains' tool hub is gone: the console nav and the camp overview's
// section cards reach every tool it listed, each behind the same rank bar. An
// old link or bookmark lands on Home instead of a 404. (Home, not the camp
// overview: this is a permanent redirect, which browsers remember.)
export default function CaptainToolsPage() {
  permanentRedirect("/");
}

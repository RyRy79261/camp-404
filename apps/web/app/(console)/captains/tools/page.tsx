import { permanentRedirect } from "next/navigation";

// The captains' tool hub is gone: the console nav and the Overview's quick-link
// cards reach every tool it listed, each behind the same rank bar. An old link
// or bookmark lands on the Overview instead of a 404.
export default function CaptainToolsPage() {
  permanentRedirect("/");
}

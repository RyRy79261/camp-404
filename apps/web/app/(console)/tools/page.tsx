import { redirect } from "next/navigation";

// The old tools hub. The console nav and Home's shortcuts now lead to each
// tool, so the hub sends everyone Home, which walks the member ladder (or shows
// the landing page to a signed-out visitor).
export default function ToolsPage(): never {
  redirect("/");
}

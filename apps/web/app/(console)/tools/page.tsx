import { redirect } from "next/navigation";

// The old tools hub. The console nav and the Overview's section cards now lead
// to each tool, so the hub sends everyone to the Overview, which walks the
// member ladder (or shows the landing page to a signed-out visitor).
export default function ToolsPage(): never {
  redirect("/");
}

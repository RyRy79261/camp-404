import { isGoogleConfigured } from "@camp404/auth";
import { MCPConnect } from "./connect-client";

// The Claude connector's sign-in bridge. A server page only so it can say
// whether Google is on for this deployment; the bridge itself is client-side.
export default function MCPConnectPage() {
  return <MCPConnect googleEnabled={isGoogleConfigured(process.env)} />;
}

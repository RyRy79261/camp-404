import { StackHandler } from "@stackframe/stack";
import { stackServerApp } from "@/stack";

/**
 * Catch-all route that Stack uses for its hosted UI: sign-in, sign-up,
 * email verification, password reset, OAuth callbacks.
 */
export default function Handler(props: unknown) {
  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}

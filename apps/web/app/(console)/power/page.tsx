import { redirect } from "next/navigation";
import { POWER_LOADS_PATH } from "@/lib/power-copy";

// The Power nav entry points here, so the entry reads as active on both power
// pages (the load list and the fuel estimate sit under /power). The load list
// is where the power plan starts, and it runs the page gate itself.
export default function PowerPage(): never {
  redirect(POWER_LOADS_PATH);
}

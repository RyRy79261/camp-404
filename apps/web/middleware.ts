import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Skip static assets and image optimisation
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

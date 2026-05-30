import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@camp404/ui/components/avatar";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { initialsFrom } from "@/lib/initials";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  const profile = await getBurnerProfile(campUser.id);
  // Until the burner profile is finished, the questionnaire owns the flow.
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const name = campUser.displayName ?? authUser.primaryEmail ?? "Burner";
  const initials = initialsFrom(campUser.displayName ?? authUser.primaryEmail);
  const rankLabel = campUser.rank === "captain" ? "Captain" : "Member";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-8">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Avatar className="h-32 w-32 text-3xl">
            {campUser.profileImageUrl ? (
              <AvatarImage src={campUser.profileImageUrl} alt={name} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex flex-col items-center gap-1">
            <h1 className="text-2xl font-bold">{name}</h1>
            <span className="rounded-full bg-[color:var(--color-secondary)] px-3 py-0.5 text-xs font-semibold text-[color:var(--color-secondary-foreground)]">
              {rankLabel}
            </span>
            {authUser.primaryEmail && (
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                {authUser.primaryEmail}
              </p>
            )}
          </div>

          <Button asChild className="mt-2 gap-2">
            <Link href="/profile/edit">
              <Pencil className="h-4 w-4" aria-hidden />
              Edit profile
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-[color:var(--color-muted-foreground)]">
        Want to update your burner questionnaire answers?{" "}
        <Link
          href="/onboarding/questionnaire"
          className="underline underline-offset-4"
        >
          Review them here
        </Link>
        .
      </p>
      <p className="mt-3 text-center text-sm">
        <a
          href="/auth/sign-out"
          className="text-[color:var(--color-muted-foreground)] underline underline-offset-4"
        >
          Sign out
        </a>
      </p>
    </main>
  );
}

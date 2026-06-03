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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-8">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-3.5 p-7 text-center">
          <Avatar className="h-24 w-24 text-3xl">
            {campUser.profileImageUrl ? (
              <AvatarImage src={campUser.profileImageUrl} alt={name} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <h1 className="text-2xl font-bold">{name}</h1>

          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            {rankLabel}
          </span>

          {authUser.primaryEmail && (
            <p className="text-sm text-muted-foreground">
              {authUser.primaryEmail}
            </p>
          )}

          <Button asChild className="w-full gap-2">
            <Link href="/profile/edit">
              <Pencil className="h-4 w-4" aria-hidden />
              Edit profile
            </Link>
          </Button>

          <p className="text-label text-muted-foreground">
            Want to update your burner questionnaire answers?
          </p>
          <Link
            href="/onboarding/questionnaire"
            className="text-label font-medium text-accent hover:underline"
          >
            Review them here
          </Link>

          <a
            href="/auth/sign-out"
            className="text-sm font-medium text-muted-foreground hover:underline"
          >
            Sign out
          </a>
        </CardContent>
      </Card>
    </main>
  );
}

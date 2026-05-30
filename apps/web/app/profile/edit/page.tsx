import { redirect } from "next/navigation";
import { Card, CardContent } from "@camp404/ui/components/card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { ProfileEditForm } from "./edit-form";
import { DeleteAccountForm } from "./delete-account";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  const profile = await getBurnerProfile(campUser.id);
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }

  const initialDisplayName =
    campUser.displayName ?? authUser.primaryEmail ?? "";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Edit profile</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Update your photo and how your name shows up around camp.
        </p>
      </header>
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <ProfileEditForm
            initialDisplayName={initialDisplayName}
            initialImageUrl={campUser.profileImageUrl}
          />
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardContent className="p-6">
          <h2 className="mb-3 text-lg font-semibold text-[color:var(--color-destructive)]">
            Danger zone
          </h2>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </main>
  );
}

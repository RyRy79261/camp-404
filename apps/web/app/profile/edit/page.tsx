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
    <main className="mx-auto w-full max-w-md">
      <header className="flex flex-col gap-1.5 px-4 pb-2 pt-5">
        <h1 className="text-2xl font-bold">Edit profile</h1>
        <p className="text-label text-muted-foreground">
          Update your photo and how your name shows up around camp.
        </p>
      </header>

      <div className="flex flex-col gap-4 px-4 pb-5 pt-1">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <ProfileEditForm
              initialDisplayName={initialDisplayName}
              initialImageUrl={campUser.profileImageUrl}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-destructive">
          <CardContent className="p-6">
            <h2 className="mb-3 text-lg font-semibold text-destructive">
              Danger zone
            </h2>
            <DeleteAccountForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

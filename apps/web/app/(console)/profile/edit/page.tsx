import { TriangleAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { ProfileSections } from "@/components/profile/profile-sections";
import { getCampBlurb } from "@/lib/join-site";
import { CampBlurbForm } from "./camp-blurb-form";
import { ProfileEditForm } from "./edit-form";
import { DeleteAccountForm } from "./delete-account";

// Reads the sign-in session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Edit profile — Camp 404" };

// Editing your own profile, laid out like the AfrikaBurn account pages: the
// heading and section pills, then the settings cards in a readable column, with
// deletion last in its own destructive-edged card.
export default async function ProfileEditPage() {
  const { authUser, campUser } = await requireMemberPage();

  const campBlurb = await getCampBlurb(campUser.id);
  const initialDisplayName =
    campUser.displayName ?? authUser.primaryEmail ?? "";

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Edit profile"
        title="Edit profile"
        description="Update your photo and how your name shows up around camp."
      />

      <div className="flex flex-col gap-6">
        <ProfileSections active="edit" />

        <div className="flex max-w-3xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Photo and name</CardTitle>
              <CardDescription>
                What other members see on the roster and in the family tree.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileEditForm
                initialDisplayName={initialDisplayName}
                initialImageUrl={campUser.profileImageUrl}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What I am in camp</CardTitle>
              <CardDescription>
                Optional. What you do in camp, in your own words. A
                captain&apos;s can also go on join.camp-404.com.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CampBlurbForm
                initial={campBlurb}
                isCaptain={campUser.rank === "captain"}
              />
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TriangleAlert
                  className="h-4 w-4 text-destructive"
                  aria-hidden
                />
                Delete your account
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DeleteAccountForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

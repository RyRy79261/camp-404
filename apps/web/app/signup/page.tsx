import { AuthShell } from "@/components/auth-shell";
import { InviteCodeForm } from "./invite-form";

export const metadata = {
  title: "Sign up — Camp 404",
};

export default function SignupPage() {
  return (
    <AuthShell
      hideBack
      footer="A calm command centre for a chaotic desert."
    >
      <InviteCodeForm />
    </AuthShell>
  );
}

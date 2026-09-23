import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

// The terms of use. Google's consent-screen branding asks for a terms link as
// well as a privacy link. These terms describe how the app actually works —
// invite codes, captain approval, erasure — and invent no camp rules: the
// camp's own rules are the captains' to set, and this page says so.

export const metadata = { title: "Terms — Camp 404" };

const UPDATED = "23 September 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated={UPDATED}
      intro={
        <>
          Camp 404 is a private tool a theme camp at AfrikaBurn uses to organise
          itself. By creating an account you agree to these terms. How we handle
          your information is on the{" "}
          <Link href="/privacy" className="text-foreground underline">
            privacy page
          </Link>
          .
        </>
      }
    >
      <LegalSection title="Who can use it">
        <p>
          Camp 404 is invite-only. Anyone can create an account, but it opens
          nothing until you enter an invite code from the camp, and some codes
          also need a captain to approve you. A captain may decline an
          application, or later withdraw a member&rsquo;s access.
        </p>
        <p>
          The camp&rsquo;s own rules — who belongs, what members contribute,
          dues — are set by its captains, not by this page.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your sign-in to yourself. You are responsible for what is done
          with your account, so use a long password, and turn on two-factor
          sign-in or a passkey on the security page if you can. Tell a captain
          straight away if you think someone else has used your account.
        </p>
        <p>
          Give accurate information, especially safety details such as allergies
          and emergency contacts: the camp relies on them in an emergency.
        </p>
      </LegalSection>

      <LegalSection title="Using it well">
        <p>
          Use Camp 404 for organising the camp. Do not use it to harass anyone,
          to share other members&rsquo; personal information outside the camp,
          or to try to reach information your role does not allow. Captains may
          withdraw access from anyone who does.
        </p>
      </LegalSection>

      <LegalSection title="Leaving">
        <p>
          You can delete your account at any time from your profile. What that
          removes, and the little that stays so the camp&rsquo;s records still
          add up, is set out on the{" "}
          <Link href="/privacy" className="text-foreground underline">
            privacy page
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="No guarantees">
        <p>
          Camp 404 is run by volunteers for a camp of friends. We take care with
          it, but it is provided as it is, without any promise that it will
          always be available or free of mistakes. Do not rely on it as your
          only copy of anything important, and for safety at the event, always
          follow AfrikaBurn&rsquo;s own guidance and the people on the ground.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If these terms change, the date at the top changes with them.
          Questions go to a captain in the app.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

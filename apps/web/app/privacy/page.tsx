import { LegalPage, LegalSection } from "@/components/legal-page";

// The privacy policy: what Camp 404 keeps about a member, who can see it,
// which services handle it, and how to have it erased. Public, because Google
// requires a privacy policy on the app's own domain before "Sign in with
// Google" may be offered to anyone, and because a member should be able to
// read it before they sign up.
//
// Every statement here is something the code does. If a feature changes what
// is stored or who sees it, this page changes in the same PR (AGENTS.md: a doc
// that disagrees with the code is fixed with it).

export const metadata = { title: "Privacy — Camp 404" };

const UPDATED = "23 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated={UPDATED}
      intro={
        <>
          Camp 404 is an invite-only tool that a theme camp at AfrikaBurn uses
          to organise itself. This page says what it keeps about you, who can
          see it, and how to have it removed. It is written to meet South
          Africa&rsquo;s Protection of Personal Information Act (POPIA).
        </>
      }
    >
      <LegalSection title="What we keep">
        <p>
          <strong className="text-foreground">Your account:</strong> your email
          address and, if you set one, a password. The password is stored only
          as a one-way hash, never as text anyone can read. If you turn on
          two-factor sign-in or add a passkey, the codes and keys that make them
          work are stored encrypted.
        </p>
        <p>
          <strong className="text-foreground">What you tell the camp:</strong>{" "}
          your name, handle, country, a photo if you add one, a short bio, what
          you are bringing, your answers to camp questionnaires, dietary needs,
          allergies, emergency contacts, and travel and driving plans.
        </p>
        <p>
          <strong className="text-foreground">Identity numbers:</strong> if you
          give an ID or passport number (the event needs it for tickets), it is
          encrypted before it is saved.
        </p>
        <p>
          <strong className="text-foreground">Camp records:</strong> dues and
          payments, which team you are on, and the notices the camp has sent
          you.
        </p>
        <p>
          We do not use advertising or analytics trackers, and we do not sell or
          share your information for marketing.
        </p>
      </LegalSection>

      <LegalSection title="Signing in with Google">
        <p>
          If you choose &ldquo;Continue with Google&rdquo;, Google tells us your
          name, email address and profile picture. We use them only to sign you
          in and to fill in your account. We do not ask for, and cannot reach,
          anything else in your Google account (not your mail, contacts, files
          or calendar), and we never share what Google sends us.
        </p>
      </LegalSection>

      <LegalSection title="Who can see what">
        <p>
          Other members see the camp roster: names, handles, country, role,
          teams, and the bio you choose to share. They do not see your email, ID
          number or payments.
        </p>
        <p>
          Captains, who run the camp, can see what they need to organise it,
          including your email. They can see an ID or passport number only
          through screens that record each time it is opened.
        </p>
        <p>
          Emergency contacts, allergies and anaphylaxis are visible to captains
          and team leads, because withholding them in an emergency would be the
          worse failure. The screens that ask for them say so.
        </p>
        <p>
          When someone opens your ID number, safety details or a captain&rsquo;s
          notes about you, that is recorded, so the question &ldquo;who looked
          at my information?&rdquo; has an answer.
        </p>
      </LegalSection>

      <LegalSection title="Services that handle it for us">
        <p>
          Camp 404 runs on Vercel (hosting and private storage for photos) with
          its database at Neon. Email goes out through Resend, and phone
          notifications through Google&rsquo;s Firebase. If you speak an answer
          instead of typing it, the recording is sent to Groq to be turned into
          text. If you report a problem, the report is filed as an issue in the
          app&rsquo;s public code repository on GitHub with personal details
          removed, and you can choose to have Anthropic&rsquo;s Claude tidy it
          up before it is filed. These services process the information only to
          do that job for us.
        </p>
        <p>
          If you connect Claude to your Camp 404 account, Claude can read camp
          information on your behalf, limited to what your role in the camp may
          see. You approve the connection first, and you can remove it in
          Claude&rsquo;s connector settings.
        </p>
      </LegalSection>

      <LegalSection title="Removing your account">
        <p>
          You can erase your account yourself: in{" "}
          <strong className="text-foreground">
            Your profile → Edit profile
          </strong>
          , press &ldquo;Delete my account&rdquo;. Erasure deletes your sign-in
          (email, password, devices and passkeys), your questionnaire answers,
          dietary, safety, travel and driving details, and your photos. What
          stays is a placeholder named &ldquo;Lost Cat&rdquo; with a number, so
          the camp&rsquo;s history (who was invited by whom, payments already
          made) still adds up without saying who you were.
        </p>
        <p>
          You may also ask what we hold about you, or ask for a correction, by
          contacting a captain in the app or using &ldquo;Report a bug&rdquo;.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

### 23. Enable-push opt-in
**Purpose:** Lets an authenticated, camp-access member opt in to web push so queued notifications can be delivered to their device.
**Layout & elements:** Mobile single column on the authenticated home control panel. A single centered button labeled "Enable notifications" (secondary, small). No other chrome — no title, spinner, error toast, or disabled control. The button is the only visible element, and only when the browser permission is undecided.
**Every action (preserve all):**
- Tap "Enable notifications" → requests browser permission (must run inside the click/user gesture). Granted → register/refresh FCM token, POST `{ token, platform: "web" }`, surface vanishes (granted). Denied → vanishes, never re-prompts (browser controls only). Dismissed → button stays.
- (Automatic) On mount when already granted → silently refresh + re-register token, no UI.
- (Automatic) Foreground message while granted → show native notification (icon `/icon.svg`) only if payload valid AND permission still granted.
- (Automatic) Background message → service worker shows notification (title fallback "Camp 404", icon `/icon.svg`).
- No disable/opt-out toggle exists in this surface; revoke via browser only.
**States to design:**
- loading → detection in flight → renders nothing.
- unavailable → unsupported / unconfigured / error → renders nothing.
- default (empty/undecided) → the only state showing the button.
- granted (populated/success) → token registered → renders nothing.
- denied (disabled) → renders nothing, no re-prompt.
- Gating: invite-gated / onboarding-incomplete / pending / rejected never reach this surface (page gating redirects first; token route also enforces auth + camp access). Role: rank-agnostic, every member sees it.
**Options & exact values:** platform sent: "web" (enum web/ios/android; ios/android unused). Channels drained: push, both. Delivery status: queued/sent/failed/skipped. Button label "Enable notifications". Icon "/icon.svg". Title fallback "Camp 404". Cron "25 9 * * *".
**Validation & rules:**
- Button shows only when permission undecided; deny is permanent here.
- Token POST is best-effort: failures swallowed silently, no UI error.
- Foreground notification gated on valid payload + still-granted permission.
**Do-not-drop:** The self-effacing single-button opt-in that requests permission on a user gesture and registers the FCM token — never re-prompting after deny. Carry forward: DELETE token route is orphaned (no in-repo caller); `topics` and ios/android platform are plumbed but dead/unused on web.

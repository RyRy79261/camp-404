# Offline mesh networking on-site at AfrikaBurn

> **Status:** Research only — no implementation decisions or code changes.
> **Question on the table:** Can Camp 404 update inventory, manage tasks,
> dispatch notifications, and surface the schedule **on-site at
> Quaggafontein with no internet or cellular**, using a Bitchat-style
> Bluetooth-Low-Energy mesh as the transport?
> **Author context:** Inspired by the Bitchat project
> ([permissionlesstech/bitchat](https://github.com/permissionlesstech/bitchat)),
> which flood-routes encrypted messages over BLE between iPhones.

---

## 1. Why this matters for Camp 404

AfrikaBurn 2026 runs **27 April – 3 May 2026** at Quaggafontein in the
Tankwa Karoo, ~200 km north of Cape Town. The site has **no cellular
coverage and no public Wi-Fi** — the Tankwa Padstal on the road in is
documented as "the last Wi-Fi you'll have for a while"
([Explore Travel Oasis survival guide](https://exploretraveloasis.com/afrikaburn-ultimate-survival-guide/)).
The app's brief already calls this out — a "fire-performance coordinator
in the desert in April with intermittent signal" is one of the three
canonical users (see `docs/brief.md` §1).

Today the app assumes connectivity end-to-end:

- **API surface.** `apps/web` is Next.js 16 with server actions and
  `/api/*` routes against Neon Postgres (`AGENTS.md` "Mobile builds").
  The Capacitor static export still _calls_ those endpoints; it just
  cannot host them. With no internet, every write fails.
- **Notifications.** `broadcasts` fan out into `notification_deliveries`,
  which today populate only the in-app inbox; the FCM push worker that
  would drain `pushStatus = 'queued'` deliveries is planned but not yet
  wired (`packages/db/src/schema.ts`). Once built, FCM would need a
  Google Play / APNs reachable network.
- **Inventory.** The propose-and-approve workflow
  (`inventory_updates` → `inventory_items`,
  `packages/db/src/schema.ts:786-913`) writes to Postgres on submit and
  on approval — both round-trips to Neon.
- **Tasks.** `tasks` is server-authoritative
  (`packages/db/src/schema.ts:703-726`); status flips and the daily
  reminder cron both assume the API is reachable.
- **Workshops / schedule.** `workshops` + `workshop_rsvps`
  (`packages/db/src/schema.ts:752-777`) are read on demand.

Practical reality at the burn: members lose access to all of this for
~7 days, exactly when operational decisions are most time-sensitive
(meal counts, fire-jam logistics, fridge-shelf assignments for
Orphanage adoptees, etc.).

A mesh layer would let a captain dispatch a "dinner at 19:00 in the
kitchen, all hands" broadcast to ~40 phones in the camp footprint, let a
team lead mark "two jerry cans leaking, do not refill" against an
inventory item, and let a member tick a task done — all with **zero
infrastructure**, propagating phone-to-phone, and reconciling with Neon
the next time anyone touches signal.

---

## 2. What Bitchat actually is (and isn't)

The project we'd be drawing inspiration from:
[`permissionlesstech/bitchat`](https://github.com/permissionlesstech/bitchat),
released July 2025, public-domain (Unlicense).

What we know from the
[whitepaper](https://github.com/permissionlesstech/bitchat/blob/main/WHITEPAPER.md):

- **Transport.** BLE is named as the reference transport, but the
  whitepaper is deliberately thin on the BLE specifics — it abstracts a
  Transport Layer. The published behaviour is **gossip flooding with an
  8-bit TTL** (commonly capped at 7 hops in implementations).
- **Packet format.** `BitchatPacket` — 13-byte header, 8-byte sender /
  recipient IDs, optional 64-byte Ed25519 signature, payload **padded to
  256 / 512 / 1024 / 2048 bytes** (PKCS#7-style, to hide message size).
- **Crypto.** Noise_XX_25519_ChaChaPoly_SHA256 — mutually authenticated,
  forward-secret pairwise sessions.
- **No peer discovery spec.** The whitepaper does not document how
  peers find each other; that lives in the platform code.
- **No store-and-forward semantics.** The protocol is "live mesh" —
  messages exist in device memory and propagate while devices are in
  range; long-offline catch-up is not in scope.

Critically, **Bitchat is a standalone iOS / macOS app written in Swift
(98.5 %)**. It is _not_ a library or SDK; there's no `pod`, no `npm`
package, no Capacitor plugin. Android support exists as a separate
fork / port but is not the canonical codebase. So "use Bitchat" really
means one of:

1. **Fork it** and rewrite the UI/data layer for our needs (iOS only,
   no shared code with the rest of Camp 404).
2. **Re-implement the protocol** in a Capacitor plugin so the same JS
   layer can talk to it on iOS and Android.
3. **Use the inspiration only** — design a similar gossip-flood
   protocol, but pick a transport stack that actually works in our
   Capacitor app.

---

## 3. The transport question (and where Capacitor hurts)

This is the single biggest feasibility risk. Camp 404 is a Capacitor
app wrapping a Next.js static export
([`README.md`](../../README.md) "Stack" + [`apps/mobile/`](../../apps/mobile/)).
Anything mesh-related has to be reachable from JS, on **both iOS and
Android**, and ideally with sane background behaviour.

### 3.1 Web Bluetooth — ruled out

Apple has [publicly declined](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
to implement Web Bluetooth or Web Bluetooth Scanning, citing privacy.
The position is unchanged in 2026. A pure PWA approach is dead on
arrival for iOS — and even on Android, Web Bluetooth is central-only
(no advertising), which is incompatible with mesh.

### 3.2 Capacitor BLE plugins — partial coverage

| Plugin | Roles | Status | Notes |
|---|---|---|---|
| [`capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) | **Central only** | Free, MIT | Explicitly: "the plugin only supports the central role of the Bluetooth Low Energy protocol". Unusable for mesh — every node has to also be a peripheral. |
| [Capawesome BLE plugin](https://capawesome.io/docs/plugins/bluetooth-low-energy/) | Central **and** peripheral, including advertising | **Insiders-only (paid sponsorship)** | Supports starting GATT server / advertising on iOS and Android. License terms and pricing not public. |
| [`@capgo/capacitor-bluetooth-low-energy`](https://www.npmjs.com/package/@capgo/capacitor-bluetooth-low-energy) | Web-Bluetooth-shim flavour, peripheral mode claimed | Commercial (Capgo) | Smaller community, similar pattern. |

A mesh transport **requires every device to act as both central and
peripheral simultaneously** — that's how flood routing works. So the
free community plugin is a non-starter; we'd need Capawesome's plugin,
a paid alternative, or **a bespoke Capacitor plugin** (Swift +
Kotlin) wrapping the platform BLE APIs ourselves. The latter is non-
trivial — a few weeks of native work minimum.

### 3.3 iOS background BLE — the real ceiling

Even with a peripheral-capable plugin, iOS imposes hard limits that
shape the entire UX:
([Apple Core Bluetooth background docs](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html),
[Punch Through guide](https://punchthrough.com/ios-ble-scanning-guide/),
[overflow-area writeup](https://davidgyoungtech.com/2020/05/07/hacking-the-overflow-area))

- Service UUIDs in background advertisements move to the "overflow
  area"; they're only discoverable by another iOS device that is
  **explicitly scanning for that exact UUID** and whose screen is on.
- Local name is stripped from background advertisements.
- Background advertising frequency drops dramatically when all
  participating apps are backgrounded.
- Background scanning ignores `allowDuplicates` and coalesces
  discoveries; you cannot maintain a tight gossip loop.

Translation: a phone in a pocket with the app backgrounded is **at
best a marginal mesh participant**. Practically, the user has to open
the Camp 404 app, see the "mesh active" indicator, and keep the screen
on for the device to relay reliably. That's a behavioural ask we'd
have to design around (e.g. "open the app when you walk through camp",
or kiosk-mode tablets in the kitchen and the captain's tent as
always-on relays).

### 3.4 Wi-Fi Aware (NAN) — promising but new

iOS 26 (shipped late 2025) added Wi-Fi Aware
([Apple Developer Forums](https://developer.apple.com/forums/thread/790195)),
which Android has had since 8.0
([Android docs](https://developer.android.com/develop/connectivity/wifi/wifi-aware)).
Pros: orders-of-magnitude higher throughput than BLE, real
peer-to-peer, no AP. Cons: brand-new on iOS so the Capacitor plugin
ecosystem doesn't exist yet, requires iOS 26 (cuts users on older
hardware), and AfrikaBurn-grade dust + battery profile is untested.
**Worth tracking but not buildable today** without writing the plugin
ourselves.

### 3.5 LoRa / Meshtastic — different shape entirely

[Meshtastic](https://meshtastic.org/) and
[MeshCore](https://meshcore.dev/) run on **dedicated ESP32 + LoRa
radios** and get km-range mesh
([MeshAmerica comparison](https://meshamerica.com/2026/04/26/meshtastic-vs-meshcore-which-firmware-fits-your-network/)).
This is the right tech for "captain at the far end of the
playa needs to reach the kitchen 1.5 km away" — which is a real
Camp 404 scenario. But:

- Every participant needs a $30–$80 LoRa node, which conflicts with
  "the app runs on phones members already own".
- Throughput is **bytes per second**, not kilobytes. Suitable for
  short alerts and tiny status pings; not for inventory rows with
  notes.
- A pragmatic role for LoRa is a **2-node backbone** between
  always-on relays (kitchen ↔ captain's tent ↔ fire-jam zone), with
  phones BLE-meshing within ~50 m of each relay. Hybrid.

### 3.6 Commercial SDKs — Bridgefy

[Bridgefy](https://bridgefy.me/) is a paid SDK that has been used at
festivals and protests for exactly this pattern (BLE mesh chat with
store-and-forward). It has Capacitor / Cordova wrappers in the wild.
Pros: a real product, real support, real iOS/Android coverage.
Cons: per-MAU pricing, vendor lock-in, opaque crypto compared to
Bitchat's published Noise protocol. Probably the **fastest path to a
shippable mesh** if budget allows.

### 3.7 Transport recommendation matrix

| Transport | iOS | Android | Range/hop | Range total | Throughput | Cost | Time-to-pilot |
|---|---|---|---|---|---|---|---|
| BLE mesh (Capawesome plugin) | ✅ (foreground / screen-on) | ✅ | ~10–30 m | ~7 hops → ~100 m practical | ~kB/s | Plugin sponsorship | weeks |
| BLE mesh (bespoke Capacitor plugin) | ✅ | ✅ | same | same | same | Eng time (Swift + Kotlin) | months |
| Bridgefy SDK | ✅ | ✅ | ~30–100 m | ~7 hops | ~kB/s | Per-MAU | days–weeks |
| Wi-Fi Aware (iOS 26 / Android 8+) | ✅ (iOS 26 only) | ✅ | ~30–100 m | hops experimental | ~MB/s | Build plugin ourselves | months |
| LoRa (Meshtastic) backbone | via BLE companion | via BLE companion | ~1–10 km | ~30 hops | bytes/s | hardware per relay | weeks once nodes bought |
| Fork Bitchat as-is | iOS only | ✗ | ~10–30 m | ~7 hops | ~kB/s | n/a | weeks (iOS), but standalone app |

---

## 4. What the app actually needs to sync (and how)

A mesh transport is half the problem. The other half is: **what
semantics do our domain tables need under intermittent connectivity?**
The current schema is written for a single authoritative Postgres,
so we'd be retrofitting offline-first behaviour onto it.

Map the four features the user asked about to the existing schema:

### 4.1 Inventory updates → already propose/approve, fits mesh well

`inventory_updates` is already a **propose-then-approve** flow with a
full snapshot per row (`packages/db/src/schema.ts:849-913`). This is
the easiest feature to mesh-enable:

- A member's "I counted 8 jerry cans, two are leaking" becomes a mesh
  packet carrying the would-be `inventory_updates` row, with
  `status = 'pending'` and a client-generated UUID.
- Any team lead / captain phone receiving the packet can approve it
  locally; the approval is a second packet referencing the proposal
  UUID.
- When _any_ participating phone next hits signal, it drains its mesh
  inbox to Neon. Server-side dedup on the client UUID is trivial.
- Conflicts (two approvals, late-arriving proposal) reduce to
  last-writer-wins on `reviewedAt` — which is what the current schema
  already implies.

This is genuinely viable as a first mesh feature.

### 4.2 Tasks → straightforward with one schema add

`tasks` currently flips `status` and `completedAt`
(`packages/db/src/schema.ts:703-726`). Mesh-friendly version:

- Add `clientUpdateId` (UUID) and `updatedAt` columns.
- A status change becomes a packet: `{ taskId, status, completedAt,
  actorId, clientUpdateId, updatedAt }`.
- Merge rule: keep the row with the latest `updatedAt`; tie-break on
  `clientUpdateId`.

Tasks are short, infrequent, and per-team — well within BLE mesh's
bandwidth budget.

### 4.3 Broadcasts / notifications → the killer use case

`broadcasts` + `notification_deliveries`
(`packages/db/src/schema.ts`) is a fanout queue: the in-app inbox works
online, the (still-unbuilt) FCM push channel would need signal, and
on-site FCM cannot reach Google Play / APNs at all. Replacing FCM with
mesh-flood for the duration of the burn is the most _impactful_ change:

- A captain composes a broadcast. The phone signs and floods a packet
  carrying `{ id, title, body, scope, team, refType, refId, senderId,
  createdAt }`.
- Every receiving phone records a local `notification_deliveries` row
  (with `pushStatus = 'mesh_delivered'`).
- When connectivity returns, the queued local rows reconcile with
  Neon; the broadcast itself is upserted by id.

There's a real **trust** question here that the design has to answer
explicitly: anyone in BLE range could in principle send a packet
claiming to be a captain. Bitchat's Noise sessions are pairwise — they
authenticate the link, not the identity. For Camp 404 we'd need
**signed broadcasts**, with captain public keys pre-distributed during
the pre-burn questionnaire (we already have `burner_profiles` and a
captive questionnaire flow — `packages/db/src/schema.ts:241-258`).
Then any phone can verify a broadcast's signature before showing it.

### 4.4 Schedule / workshops → mostly read-only, easiest of all

`workshops` is small (a few dozen rows for the week) and changes
rarely. Pre-load the whole table to every phone the last time they're
on signal (Tankwa Padstal); RSVPs are short writes that the mesh can
carry the same way as tasks. Days when the schedule changes (a
workshop cancelled, a fire-jam start time bumped), the captain
broadcasts the diff.

### 4.5 What this implies architecturally

| Need | Today | Mesh-enabled |
|---|---|---|
| Source of truth | Neon Postgres | Neon Postgres _eventually_; local SQLite in the meantime |
| Writes | Server actions / API routes | Local write + outbox; outbox drains to mesh and to Neon |
| Reads | API → server-rendered | Local SQLite + reactive query layer |
| Identity | Neon Auth (Stack) | Pre-shared captain public keys + member device keys |
| Conflict resolution | DB-side constraints | Domain-specific: LWW for tasks, propose/approve for inventory, signed-broadcast for notifications |
| Push delivery | FCM | Mesh-flood while offline; FCM on return-to-signal |

**The hardest piece is the outbox / reconciliation layer**, not the
mesh. Capacitor's
[`@capacitor/preferences`](https://capacitorjs.com/docs/apis/preferences)
is too small; we'd want SQLite (Capacitor SQLite plugin, or
[CR-SQLite](https://github.com/vlcn-io/cr-sqlite) for built-in CRDT
semantics) plus a small sync engine. Yjs / Automerge are overkill for
our shape (most rows are independent records, not collaborative
documents) — a **purpose-built outbox + per-table merge rules** is the
right answer here
([CRDT vs custom sync discussion](https://powersync.com/blog/why-cinapse-moved-away-from-crdts-for-sync)).

---

## 5. Threat model and POPIA

The codebase already takes POPIA seriously (column-level pgcrypto on
passport / ID / EFT details — `AGENTS.md` "Security / POPIA"). A mesh
layer broadens the attack surface:

- **Personal data over the air.** Inventory and tasks rarely contain
  PII. Broadcasts might ("Adoptee 3 has a peanut allergy"). Adoptee
  fridge assignments definitely do (`adoptees`,
  `packages/db/src/schema.ts:730-748`). Anything PII-bearing should be
  **encrypted end-to-end for the recipient set**, not just authenticated.
- **No passport / EFT data on the mesh, ever.** Trivial rule — these
  tables are not part of the mesh sync surface.
- **Replay / spoofing.** Signed broadcasts + monotonic broadcast IDs
  per captain. Reject signatures from unknown keys. Pre-distribute
  captain keys at sign-on (we have a captive flow already).
- **Mesh exhaustion.** ~40 members, ~50 m camp footprint, BLE-throughput
  budget realistic. Cap broadcasts to a sensible rate (e.g. 1/min per
  captain) to avoid mesh saturation.
- **Dust + battery.** Always-on mesh participation drains batteries.
  The "open the app to relay" UX doubles as power management.

---

## 6. Realistic delivery shapes, smallest to largest

If we ever wanted to pilot this, here are the cheapest cuts in
order. **None of this is a recommendation to build; it's a sizing
exercise.**

### Pilot A — Read-only mesh schedule (1–2 weeks, no native code)

Pre-load `workshops` + the next-7-days `broadcasts` to local storage
during the on-boarding flow. Show them offline. No mesh transport at
all; the app just degrades gracefully. **Closes the most common
"what's happening now?" question without any of the hard work.** A
good first step regardless of what we decide about mesh proper.

### Pilot B — LoRa backbone for captain announcements (2–4 weeks + hardware)

Two or three Meshtastic nodes (kitchen, captain's tent, fire zone).
A captain types a message into the app; the app pushes it over BLE
to the nearest LoRa node; node floods it across the camp; receiving
nodes push it via BLE to nearby phones, which raise a local
notification. **One-way captain → camp**, but covers the
highest-value flow. Off-the-shelf parts; the app code is mostly
serialisation.

### Pilot C — Bridgefy SDK pilot for tasks + broadcasts (4–6 weeks)

Wire Bridgefy into the Capacitor app, plumb signed broadcasts and
task-status packets. Punt inventory and schedule. Honest evaluation
of whether the mesh actually carries traffic at 40-person scale and
in the dust before sinking more time in.

### Pilot D — Full custom BLE Capacitor plugin (3–6 months)

Bespoke Swift + Kotlin Capacitor plugin implementing a Bitchat-style
flood-routed mesh, our own outbox, signed broadcasts, the lot. The
"right" long-term answer if mesh becomes core to the product, and
the only path that avoids a recurring SDK bill or a third-party
provider. Big bet.

### What I'd _not_ do

- **Fork Bitchat directly.** It's iOS-only Swift, standalone-app
  shaped, and the project's design centre is anonymous chat, not
  authenticated camp ops. We'd discard most of it and inherit none
  of the maintenance leverage.
- **Pure-PWA / Web Bluetooth.** Not possible on iOS, not mesh-capable
  on Android.
- **Skip the outbox / reconciliation work.** The mesh is the
  exciting bit; the boring bit (local SQLite + per-table merge rules
  + push-on-reconnect) is where the actual reliability lives.

---

## 7. Open questions / spikes worth doing before any build

1. **Does the Capawesome BLE peripheral plugin actually work in dust /
   crowd conditions on real iPhones for an hour?** A weekend test
   with 5 phones in a friend's back garden would answer this for the
   price of pizza.
2. **What's the realistic foreground-app discipline our members will
   accept?** If "you have to open the app once an hour to relay
   messages" is unacceptable, BLE mesh is the wrong tool and we
   should be talking LoRa-only.
3. **How big is a typical broadcast in bytes?** Quick spike: serialise
   a representative `broadcasts` row, measure padded sizes (256 /
   512 / 1024 / 2048 — Bitchat's buckets). Confirms throughput
   budget.
4. **What does Bridgefy charge for ~80 MAU once a year?** A
   procurement question that could short-circuit a lot of
   engineering.
5. **What's the captain key-distribution UX?** It belongs in the
   existing burner-profile questionnaire flow
   (`packages/db/src/schema.ts:241-258`), but it's a real design
   piece — captains need to publish a public key, every member needs
   to ingest it during onboarding.
6. **iOS 26 install base by April 2026?** Decides whether Wi-Fi Aware
   is a credible 2026 option or a 2027 conversation.

---

## 8. Bottom-line read

A Bitchat-style BLE mesh **could** carry the inventory / tasks /
notifications / schedule traffic Camp 404 needs at the burn — the
data volumes are tiny, the participant count is tiny (~40), and the
physical footprint is small enough that 7-hop flooding has plenty of
margin. The crypto and protocol shape Bitchat publishes is sound and
borrow-able.

**The cost is large and front-loaded**, and it is _not_ mostly in
the protocol:

- A meaningful **native plugin investment** (Capacitor BLE peripheral
  + advertising on both iOS and Android — either paying Capawesome
  or building our own).
- An **offline-first refactor** of writes across `inventory_updates`,
  `tasks`, `broadcasts`, `workshop_rsvps` (outbox, local SQLite,
  reconciliation, signed broadcasts).
- A **UX discipline** around foreground-mesh-participation that
  members have to adopt for it to work.
- An **identity / key-distribution piece** layered on top of Neon
  Auth.

If we wanted the smallest defensible win for AfrikaBurn 2026 with
this branch's effort budget, **Pilot A (offline-cached read-only
schedule + recent broadcasts)** is by far the highest ratio of
"value delivered" to "engineering risk", and it's a prerequisite for
any of the mesh pilots anyway. **Pilot B (LoRa backbone for captain
broadcasts)** is the next-best step and the one most aligned with
"calm command centre for a chaotic desert" — one-way mass announce
is the workflow that breaks hardest when signal vanishes.

Doing the full Bitchat-style mesh on Camp 404 is a real product bet,
not a feature branch. Worth a follow-up conversation about whether
the camp's appetite for that bet is there.

---

## Sources

- Bitchat: [WHITEPAPER.md](https://github.com/permissionlesstech/bitchat/blob/main/WHITEPAPER.md),
  [repo](https://github.com/permissionlesstech/bitchat)
- Capacitor BLE plugins:
  [`capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le),
  [Capawesome BLE plugin](https://capawesome.io/docs/plugins/bluetooth-low-energy/)
- iOS BLE background behaviour:
  [Apple Core Bluetooth background guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html),
  [Punch Through iOS BLE scanning guide](https://punchthrough.com/ios-ble-scanning-guide/),
  [Hacking the Overflow Area](https://davidgyoungtech.com/2020/05/07/hacking-the-overflow-area)
- Web Bluetooth on iOS:
  [MagicBell PWA iOS limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- Wi-Fi Aware: [Android](https://developer.android.com/develop/connectivity/wifi/wifi-aware),
  [Apple Developer Forums iOS 26 thread](https://developer.apple.com/forums/thread/790195)
- LoRa mesh comparisons:
  [Meshtastic vs MeshCore (MeshAmerica)](https://meshamerica.com/2026/04/26/meshtastic-vs-meshcore-which-firmware-fits-your-network/),
  [MeshCore vs Meshtastic (JR AT Tech Works)](https://jrattechworks.com/meshcore-vs-meshtastic/)
- Offline-first sync engineering:
  [CRDT vs custom sync (PowerSync / Cinapse)](https://powersync.com/blog/why-cinapse-moved-away-from-crdts-for-sync)
- AfrikaBurn 2026 context:
  [Explore Travel Oasis survival guide](https://exploretraveloasis.com/afrikaburn-ultimate-survival-guide/)

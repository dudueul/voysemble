# Google: Play Console, signing, Firebase push, internal testing

Covers steps 1, 7 and 8 of `README.md` for Android. The app id is `com.voysemble.app`
(`mobile/android-app/build.gradle.kts`).

## 1. Enroll as an organization (start this first)

Preconditions: the operating legal entity and its D-U-N-S number (the same one as for Apple).

1. Create a Google account for the business (`play@voysemble.com`), two-step verification on.
2. Play Console → create a developer account of type **Organization**, pay the one-time fee,
   complete identity verification for the entity.

Why the organization type matters beyond the seller name: new **personal** accounts must run a
closed test with a minimum number of testers for a minimum number of days before they may
publish to production; organization accounts are not held to that rule. Check the current
requirement in the Play Console help when you enroll.

Verify: the Play Console opens with the organization's name and the developer account id.

## 2. The app and its signing

1. Play Console → Create app: name Voysemble, default language English, app (not game), free.
2. Use **Play App Signing** (the default). Engineering generates the **upload key** in CI and
   gives you its certificate; Google holds the app signing key.
3. Play Console → the app → Setup → App signing: copy the **SHA-256 fingerprints** of both the
   app signing certificate and the upload certificate.
4. Set the API's variable `ANDROID_CERT_SHA256` to both, comma-separated (`cloudflare.md` §5).
   The API publishes them in `/.well-known/assetlinks.json`, which Android checks at install so
   sign-in links open the app (`AndroidManifest.xml`, `autoVerify`).

Verify (after a deploy): `curl https://app.voysemble.com/.well-known/assetlinks.json` lists both
fingerprints for `com.voysemble.app`.

## 3. Push (Firebase Cloud Messaging)

1. Firebase console → add a project `voysemble` (link it to the same Google account); add an
   Android app with package `com.voysemble.app`.
2. Download `google-services.json` and give it to engineering (it identifies the project; it
   is not a secret, but keep it out of public places).
3. Project settings → Service accounts → generate a new private key (JSON). This **is** a
   secret: it can send push to every install.

```sh
pnpm exec wrangler secret put FCM_SERVICE_ACCOUNT --env staging   # paste the JSON
```

The Android app already creates one notification channel per lane at launch (high, default,
low; D29, slice 053). The API sends with the HTTP v1 API using this service account (slice 088,
`docs/engineering/notifications.md`); the project id comes from the JSON. Without the secret the
API still runs and marks pushes to Android phones `unconfigured`. The app's registration lands
once `google-services.json` is in engineering's hands.

Rollback: delete the key in Service accounts (push stops) and generate a new one.

## 4. Internal testing for the pilot phones

1. Play Console → Testing → Internal testing → create a release; engineering's CI uploads the
   signed bundle (`.aab`) with a Play Developer API service account: Users and permissions →
   invite a service account with **Release manager** for this app; store its JSON as the GitHub
   secret `PLAY_SERVICE_ACCOUNT`.
2. Add testers by email list (up to 100 for internal testing; installs within minutes, no
   review).

## 5. Countries and policy forms

Countries for the production track: the United States and South Korea first (D43); add others
in their phase. Internal testing is not limited by country.

Before any test outside your team:

- **Data safety**: email address (account management), photos and messages (app
  functionality), precise and approximate location **processed on the device only** inside a
  meeting window, not shared with third parties, encrypted in transit. Deletion: today the
  organizer removes a person, a photo or a scan, and those are deleted at once; the automatic
  shred of a whole trip at the end of its retention window (D20) is not built yet
  (`retention.crypto-shred`), so either wait for that slice or describe the manual process you
  will run after the pilot.
- **Target audience and content**: the travelers include minors (school trips). If you select
  any age group under 13, the **Families** policy applies (Teacher Approved is optional). Answer
  this with counsel (`legal-and-pilot.md`), because it changes what the app may do (no
  advertising IDs, stricter data handling; the app has neither ads nor analytics SDKs today).
- **Permissions declaration**: location is foreground only, used inside a meeting window the
  traveler joins (D15); no background location.

## 6. What engineering needs from you

| Item | Where |
|---|---|
| SHA-256 fingerprints (app signing, upload) | `ANDROID_CERT_SHA256` |
| `google-services.json` | the Android app module (engineering adds it) |
| Firebase service account JSON | Wrangler secret `FCM_SERVICE_ACCOUNT` |
| Play service account JSON | GitHub secret `PLAY_SERVICE_ACCOUNT` |

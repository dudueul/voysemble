# Apple: developer account, identifiers, push key, TestFlight

Covers steps 1, 7 and 8 of `README.md` for iOS. The app is native SwiftUI over the shared
Kotlin core (ADR-0003); its bundle id is `com.voysemble.app` (`mobile/ios-app/project.yml`).

## 1. Enroll as an organization (start this first)

Preconditions: the operating legal entity exists; you can sign for it; a D-U-N-S number for it
(Apple checks the entity against it; requesting one can take days to weeks, so apply first).

1. Create (or use) an Apple Account for the business with two-factor authentication, under a
   role address such as `apple@voysemble.com`, not a personal one.
2. Enroll in the Apple Developer Program as an **Organization** (not an individual). The
   seller name on the App Store is the organization's legal name, which matters to schools and
   parents; an individual enrollment shows your personal name.
3. Pay the annual program fee. Apple calls to verify the entity; answer from the number you
   gave.

Verify: developer.apple.com → Membership shows the organization and the **Team ID** (10
characters).

Evidence to keep: the membership page, the D-U-N-S confirmation.

## 2. Identifiers and associated domains

1. Certificates, Identifiers & Profiles → Identifiers → App IDs → register `com.voysemble.app`
   (explicit). Enable the capabilities **Associated Domains** and **Push Notifications**.
2. Tell engineering the Team ID. It goes to:
   - `project.yml` (`DEVELOPMENT_TEAM`) for signing in CI;
   - the API's variable `APPLE_APP_IDS` = `TEAMID.com.voysemble.app` (`cloudflare.md` §5), which
     the API publishes in `/.well-known/apple-app-site-association` so sign-in links open the
     app.
3. The app declares `applinks:app.voysemble.com` and, for debug builds against staging,
   `applinks:staging.dev.voysemble.cfd` (slice 089).

Verify (after a deploy): `curl https://app.voysemble.com/.well-known/apple-app-site-association`
lists `TEAMID.com.voysemble.app`.

## 3. Push key (APNs)

1. Keys → create a key with **Apple Push Notifications service (APNs)** enabled. Download the
   `.p8` file; Apple lets you download it **once**. Note the **Key ID**.
2. Put them on the API for each environment that sends push:

```sh
pnpm exec wrangler secret put APNS_KEY --env staging      # paste the .p8 file's full contents
pnpm exec wrangler secret put APNS_KEY_ID --env staging   # the 10-character key id
pnpm exec wrangler secret put APNS_TEAM_ID --env staging  # the Team ID
```

One token-based key works for development and production APNs and for every app of the team.
Store the `.p8` in the password manager; if it leaks, revoke the key in the portal and create a
new one (push stops until the new one is set).

The API reads these three names (slice 088, `docs/engineering/notifications.md`), sends to the
sandbox APNs host for debug builds run from Xcode and the production host for TestFlight and App
Store builds (TestFlight uses production APNs), and maps the lanes of D29 to APNs priority
(priority lane: immediate, time-sensitive; normal: default; digest: email only). The topic is the
bundle id, `com.voysemble.app`; set `APNS_TOPIC` the same way only if the bundle id ever changes.
Without the three secrets the API still runs and marks pushes to iPhones `unconfigured`.

Verify (first staging send): with a TestFlight build signed in, open a head count on the console;
the phone shows "Head count: …" within a minute. If it does not, the API's log line for the push
run counts `failed`: tell engineering (APNs speaks HTTP/2 only; see `notifications.md`).

The priority lane's time-sensitive alerts need the **Time Sensitive Notifications** capability on
the App ID next to Push Notifications (Identifiers → `com.voysemble.app`); without it iOS delivers
them as ordinary alerts.

## 4. TestFlight for the pilot phones

1. App Store Connect → Apps → new app: platform iOS, name Voysemble, primary language English
   (Korean localization added), bundle id `com.voysemble.app`, SKU `voysemble-ios`.
2. Users and Access → Integrations → App Store Connect API → create a key with the **App
   Manager** role for CI uploads. Download the `.p8` (once), note the Key ID and the Issuer ID.
   Store them as GitHub secrets `ASC_KEY`, `ASC_KEY_ID`, `ASC_ISSUER_ID`; engineering adds the
   upload job.
3. TestFlight → internal testing group for the founder and the leaders; external testing (up to
   10,000 testers, after a short Beta App Review) for travelers and guardians on the pilot trip.
4. Fill **App Privacy** (the "nutrition label") before external testing. The honest answers for
   this app as built: contact info (email address, for sign-in), user content (photos, chat
   messages, care notes), coarse and precise location **used only on the device** inside a
   meeting window and never collected by the server, identifiers (the account id). Not used for
   tracking; no third-party advertising.
5. **Availability**: Pricing and Availability → countries: the United States and South Korea
   first (D43); add others in their phase.
6. Age rating: the questionnaire has no objectionable content; mark user-generated content
   (chat, photos) as present, with moderation (removal by leaders and organizers, slice 065).

The app uses email sign-in only, so Sign in with Apple is not required by the App Review
guidelines today; it becomes required if Google or another third-party sign-in is added
(`auth.oidc`, `mobile.auth.apple-google`, deferred).

## 5. What engineering needs from you

| Item | Where |
|---|---|
| Team ID | `project.yml`, `APPLE_APP_IDS` |
| APNs `.p8`, Key ID | Wrangler secrets `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` |
| App Store Connect API key, Key ID, Issuer ID | GitHub secrets `ASC_KEY`, `ASC_KEY_ID`, `ASC_ISSUER_ID` |
| The app record created | App Store Connect |

## Rollback

Expire a TestFlight build in App Store Connect (testers can no longer install it); revoke a
leaked key in the portal and replace the secret.

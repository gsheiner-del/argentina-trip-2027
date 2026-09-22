# Argentina Trip 2027 — Gmail review and map setup

This branch adds an interactive Leaflet/OpenStreetMap map and an editor-only Gmail
review screen. **Nothing in Gmail automatically changes your itinerary.**

## 1. What happens to Gmail messages

- Source mailbox: **gsheiner@gmail.com**, label: **Argentina2027** (exact spelling, no space).
- A time-driven, private Google Apps Script reads labelled threads and stages
  travel-related 2027 messages in `gmailImport/reviewQueue` in Firebase Realtime Database.
- It excludes likely verification/one-time-code messages and emails clearly unrelated
  to the 2027 trip. Not all travel emails contain a year or recognized city; verify
  the sync log and add a missing reservation manually if needed.
- The script stores **limited extracted metadata only** (email subject, inferred
  category/city, arrival timestamp and a Gmail link). It does **not** copy full
  email bodies, attachments, booking PINs, ticket numbers or confirmation codes.
- Each Gmail message ID becomes a stable database key. Running the script again
  does not re-import an already reviewed message or overwrite your decisions.
  Further messages in an existing thread are separate review items.
- The editor reviews/edits the summary in the **Gmail review** app tab. Approving
  writes only an allowlisted, sanitized summary into
  `trip/bookingSummaries/<message-id>`. Declining merely marks the staging item
  as rejected. **It never silently edits a hotel, flight, route or existing budget.**
- A cancellation email is flagged for manual handling and cannot be published
  as a confirmed booking.
- Approved safe summaries appear to authorized family members in the **Reviewed bookings** tab, separate from unapproved source-email metadata.

## 2. Secure Firebase rules (required before sync)

The current frontend shows an editor role based on Google email, but a frontend
role is **not** an authorization boundary. Review your deployed Realtime Database
rules first, including root-level grants. A permissive rule at a parent cannot
be restricted by a child rule. If `trip` or the root is world-readable, confidential
data placed there is also world-readable, regardless of hiding it in the UI.

Below is an **example** complete root-level rule set for this app. Adapt it to
any other database clients and test it using the Firebase Rules Playground
**before publishing**. It grants the known family accounts read access and only
the two editor accounts write access. The staged email metadata and sync status
are private to editors. Do not add a root `.read: true` or `.write: true` rule.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "trip": {
      ".read": "auth != null && auth.token.email_verified === true && (auth.token.email === 'gsheiner@gmail.com' || auth.token.email === 'msheiner@gmail.com' || auth.token.email === 'michsheiner@gmail.com' || auth.token.email === 'glivne21@gmail.com' || auth.token.email === 'ori.sheiner@gmail.com')",
      ".write": "auth != null && auth.token.email_verified === true && (auth.token.email === 'gsheiner@gmail.com' || auth.token.email === 'msheiner@gmail.com')"
    },
    "gmailImport": {
      ".read": "auth != null && auth.token.email_verified === true && (auth.token.email === 'gsheiner@gmail.com' || auth.token.email === 'msheiner@gmail.com')",
      ".write": "auth != null && auth.token.email_verified === true && (auth.token.email === 'gsheiner@gmail.com' || auth.token.email === 'msheiner@gmail.com')"
    }
  }
}
```

These example rules intentionally restrict direct reads even for someone with
your public application URL. Because service accounts with administrative IAM
access can bypass normal database client security rules, **the Gmail script
credentials must remain private**, and should be managed using the principle
of least privilege.

## 3. Create your private Google Apps Script

1. Sign in to **gsheiner@gmail.com**, open <https://script.google.com>, and create
   a new project, e.g. `Argentina2027 Gmail Sync`.
2. Copy **`scripts/gmail-to-firebase.gs`** from this repository into the Apps
   Script editor. Do NOT paste a private key into the script or commit it to GitHub.
3. In Firebase Console, select project `argentina-trip-2027`, and under Project
   settings → Service accounts, generate a *dedicated* service-account credential
   with the minimum required access for this importer. Restrict who can read
   the Apps Script project. Keep and protect the generated JSON file.
4. In Apps Script → Project Settings → Script Properties, create:
   `FIREBASE_SERVICE_ACCOUNT_JSON` = the **entire** JSON credentials object
   on one line (valid JSON, including escaped newlines in its private key).
   Keep access to the Apps Script project limited to yourself.
5. Check that the mailbox really contains the Gmail label
   `Argentina2027` (not `Argentina 2027`). The function also verifies the
   executing Gmail account is `gsheiner@gmail.com`.
6. Run `syncGmailToFirebase` once in the Apps Script editor and grant only the
   permissions you recognize (Gmail read, URL fetch, script properties, etc.).
   Check the execution log for the number of newly staged messages.
7. Log in to the app with an editor account and open **Gmail review**. Confirm
   that only travel-related pending items appear. Review each one against its
   original Gmail message; records with multiple city names will need manual
   location entry.
8. Apps Script → Triggers → Add Trigger:
   - function `syncGmailToFirebase`;
   - event source `Time-driven`;
   - frequency `Hour timer`, `Every hour`.
   Hourly runs are automatic *only after you add and authorize this trigger*.
9. On future emails, apply the label `Argentina2027`. The next scheduled
   run imports newly labelled messages. Removing the label does **not**
   delete previously staged records; dismiss them manually.

**Caution:** a service-account key is highly sensitive. Never email it,
upload it in this chat or copy it into GitHub/Vercel frontend environment variables.
Rotate/revoke it in Google Cloud if exposed. Apps Script project editors can
generally view its Script Properties and execution code, so do not share this
Apps Script project with trip participants.

## 4. Map

The Map tab now uses **React Leaflet + OpenStreetMap**. Its ordered stops
come from your existing `trip/destinations` array in Firebase. Existing
destination IDs/names such as Buenos Aires, Ushuaia, El Chaltén, El Calafate,
Bariloche, and Mendoza have approximate city-center fallback coordinates.

To place a destination at an exact, confirmed location, add:

```json
{
  "id": "calafate",
  "name": "El Calafate",
  "coordinates": { "lat": -50.3379, "lng": -72.2648 }
}
```

The fallback is only for the city, not for hotel addresses. A destination
with no recognized name or coordinates is listed as `Location needed`, not
placed at an invented coordinate. Dashed lines indicate stop order; they
are not real flight paths or driving routes. OpenStreetMap contributors'
attribution appears on the map.

## 5. Review before release

Run `npm install` and `npm run build`. Test Google login for an editor and
a view-only family member, responsive map behavior, editing an existing hotel
link, the review permissions, duplicate mail handling, and approvals/rejections
in a test database. Test failed/unauthorized database operations too.

**Do not merge or send the preview URL to family before verifying Firebase
rules**, because booking metadata is private. The published Vercel project's
production repository is `gsheiner-del/argentina-trip-2027`, and this feature
is built only on the `feature/map-gmail-review` branch until approved.

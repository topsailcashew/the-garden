# Going to Production — Security Hardening Checklist

**Status today (personal use — Nate & Kez only):** intentionally *not* hardened.
Firestore rules are wide open (`allow read, write: if true`) and the admin
dashboard is gated by a **client-side passcode only**. This is a deliberate,
accepted trade-off while the app is just for the two of us. **Do the steps below
before letting any other couple use it.**

---

## Why it needs to change before multi-tenant launch

- The Firebase **web API key ships in the client bundle** (that's normal — API
  keys aren't secrets). Security is supposed to come from **Firestore rules**.
- With `allow …: if true`, anyone who reads the deployed JS can use the API key
  to **list every room and read every couple's private notes, letters, and
  photos**. Fine for one trusting couple; unacceptable with real users.
- "Just require auth" (`if request.auth != null`) is **not enough** — anyone can
  grab an anonymous token by loading the app. The real fix is **per-room
  isolation**: you can only read a room if you're a verified member of it.

---

## The plan (in order)

### ✅ Stage 1 — Anonymous auth groundwork *(already done)*
- `src/firebase.ts` already signs in anonymously on load (best-effort) and
  exports `auth` + `authReady`. Currently it logs
  `auth/admin-restricted-operation` because the provider is disabled — harmless.

### ☐ Stage 2 — Enable the Anonymous provider *(your action, ~1 min)*
1. Firebase Console → **Build → Authentication → Get started**.
2. **Sign-in method** → **Add new provider → Anonymous → Enable → Save**.
3. If sign-in still errors with `admin-restricted-operation`:
   **Authentication → Settings → User actions** → make sure user creation /
   anonymous is **not blocked**.
4. Reload the live app; the `[auth]` console warning should disappear and each
   device should get a stable `uid`.

### ☐ Stage 3 — Secure "join by code" via a Cloud Function *(Blaze is on, ~$0)*
The room code can't be validated safely in rules without leaking it, so use a
callable function.
- `functions/` (Node) with a callable `joinRoom({ roomId, passcode })` that:
  - reads the room with the Admin SDK, checks `passcode` matches,
  - adds the caller's `request.auth.uid` to the room's `memberUids` array,
  - returns success. (Reject if the room is full and the caller isn't already a
    member.)
- App: in Onboarding, after the existing client-side code/passcode check, call
  `joinRoom` so the caller is enrolled as a member. Do this on **create** and
  **join**.
- Deploy: `firebase deploy --only functions`.

### ☐ Stage 4 — Lock the Firestore rules to members
Replace the open rules (`firestore.rules`) with something like:
```
match /rooms/{roomId} {
  // A member (uid in memberUids) can read/write the room + all subcollections.
  function isMember() {
    return request.auth != null
      && request.auth.uid in resource.data.memberUids;
  }
  allow get: if isMember() || isAdmin();
  allow list: if isAdmin();              // no enumerating all rooms
  allow write: if isMember() || isAdmin();

  match /{sub}/{docId} {
    allow read, write:
      if (request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.memberUids)
      || isAdmin();
  }
}
function isAdmin() { return request.auth != null && request.auth.token.admin == true; }
```
> ⚠️ **Deploy with a rollback ready.** Keep the current `if true` rules on hand;
> if the couple gets locked out, `firebase deploy --only firestore:rules` the old
> file back in seconds.

### ☐ Stage 5 — Backfill existing rooms so nobody is locked out
- The real room `not-your-homie` has **no `memberUids`** yet. Before cutover,
  add Nate's and Kez's `uid`s (get them once they've each loaded the app with
  anon auth on), or have the app auto-call `joinRoom` with the stored passcode
  for anyone holding a saved session.
- **Take a backup first** (Admin dashboard → Backup & Restore → Export all data).

### ☐ Stage 6 — Real admin auth *(replaces the client-side passcode)*
1. Create **one admin login** (Firebase Console → Authentication → Users → Add
   user, email + password). *(I can't create accounts for you.)*
2. Set an admin **custom claim** on that uid, e.g. a one-off Node script with the
   Admin SDK: `admin.auth().setCustomUserClaims(uid, { admin: true })`.
3. `src/components/AdminDashboard.tsx`: replace the `ADMIN_PASSCODE` gate with a
   real email/password sign-in; rely on the `isAdmin()` rule (token.admin) for
   cross-room reads. Remove the hardcoded passcode.

### ☐ Stage 7 — Extra prod hygiene
- **Firebase App Check** (reCAPTCHA v3): blocks non-app clients from using the
  API key at all — strong, low-effort defense-in-depth.
- **Budget alert** on the Blaze project (e.g. $5) — already recommended.
- **Delete the 14 throwaway test rooms** (Admin dashboard → Rooms → 🗑) — keep
  only `not-your-homie`.
- Rotate the admin passcode / any secrets before opening up.
- Consider a **custom domain** instead of `the-garden-rho.vercel.app`.
- Re-run a mobile/native QA pass (bottom sheets for the remaining modals were a
  deferred "phase 2" of the native rework).

---

## Quick reference
- **Firebase project:** `gen-lang-client-0795968464`
- **Firestore database:** `the-garden` (standard, uncapped, `europe-west2`)
- **Rules file:** `firestore.rules`  · deploy with `firebase deploy --only firestore:rules`
- **Admin dashboard:** `/#admin` (passcode `garden-admin-2026` — change/replace at Stage 6)
- **Backups:** Admin dashboard → Backup & Restore (full JSON export/restore)

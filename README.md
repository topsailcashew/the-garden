# Our Little Garden 🌸

A private, shared space for two. Our Little Garden is a couple's journal web app
where partners exchange love notes and photos, check in with a daily mood, answer
a get-to-know-you question every day, and plan dates together — all synced in
real time between both partners' devices.

**Live app:** https://the-garden-rho.vercel.app

## Features

- **Shared Love Notes** — a corkboard-style wall of notes and photos. Notes are
  "wax sealed": the recipient has to click to break the seal and read them. Pick
  a paper style and seal emoji, attach a photo (compressed client-side), react
  to your partner's notes, and search the archive.
- **Today's Mood** — both partners set a daily mood emoji. The composer even
  suggests what to write based on how your partner is feeling.
- **Daily Quest** — one get-to-know-you question per day. Your partner's answer
  stays hidden until you've submitted your own. React to the question, browse
  past quests, or (before anyone answers) swap in a custom question.
- **Date Planner** — propose dates with budget and prep details, RSVP to your
  partner's invitations, and watch a live countdown to your next confirmed date.

## How it works

There are no accounts or passwords. A couple creates a **room** with a shared
room code; both partners enter the same code and pick who they are. Everything
in the room (notes, moods, quests, dates) lives in Cloud Firestore and syncs
live. Only the session (who you are, which room) is kept in `localStorage`.

> ⚠️ Access control is the room code itself — anyone who knows it can enter the
> room. Use a code you'd both treat like a password.

## Tech stack

- [React 19](https://react.dev) + [Vite](https://vite.dev) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com) for styling
- [Motion](https://motion.dev) for animations
- [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore) for
  real-time data (photos are stored as compressed data URIs on the note
  documents — no Cloud Storage needed)
- [Lucide](https://lucide.dev) icons

## Run locally

Prerequisites: Node.js 20+

```bash
npm install
npm run dev        # dev server on http://localhost:3000
npm run lint       # typecheck (tsc --noEmit)
npm run build      # production build to dist/
```

The Firebase project configuration lives in [`src/firebase.ts`](src/firebase.ts).

## Deploying

- **Hosting:** the app deploys to Vercel (`npx vercel --prod`). Pushes to
  `main` also trigger deploys via the connected GitHub repo.
- **Firestore rules:** managed in [`firestore.rules`](firestore.rules) and
  deployed with:

  ```bash
  npx firebase-tools deploy --only firestore:rules --project gen-lang-client-0795968464
  ```

## Project structure

```
src/
  App.tsx                  # Shell: header, tabs, profile menu, footer
  firebase.ts              # Firebase app + Firestore init
  types.ts                 # Shared data models (Room, Note, Question, ...)
  components/
    Onboarding.tsx         # Create/join room + partner selection
    LoveNotes.tsx          # Notes wall, mood tracker, composer
    DailyQuest.tsx         # Daily question + history
    DatePlanner.tsx        # Date proposals, RSVPs, countdown
    ConfirmDialog.tsx      # Styled confirm dialogs (context provider)
    Toast.tsx              # Toast notifications (context provider)
  data/questions.ts        # Curated daily question pool
```

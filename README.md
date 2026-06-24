# Flashcards

A simple personal flashcard app (Expo / React Native, Android). Create decks, add cards
manually or via CSV import, and practice with lightweight spaced repetition. All data is
stored locally on the device in SQLite — no accounts, no internet required.

## Features

- Multiple named decks.
- Add cards manually (front / back) or bulk-import from a CSV file.
- Practice mode: up to 10 due cards per batch, flip to reveal, then pick a
  **familiarity level** — **Hard / Close / Fine / Easy**.
  - **Hard** → card stays due (unlearned).
  - **Close** → learned for 1 day.
  - **Fine** → learned for 4 days.
  - **Easy** → learned for 1 week.
  - When a learned card's timer passes, it automatically becomes due again.
- Session summary after each batch, with the option to practice the next 10.

## CSV import format

Semicolon-delimited `front;back`, **one card per line, no header row**:

```
hola;hello
gato;cat
buenos días;good morning
```

- Each line is split on the **first** `;`, so the back may itself contain semicolons.
- Blank lines and lines without a `;` are skipped.

## Run it during development

```bash
npm install            # first time only
npx expo start         # then scan the QR code with the Expo Go app on your Android phone
```

Press `a` to open in an Android emulator if you have Android Studio set up.

## Build a standalone APK (install permanently, no PC needed)

Uses [EAS Build](https://docs.expo.dev/build/introduction/) (free tier, builds in the cloud):

```bash
npm install -g eas-cli
eas login              # create / sign in to a free Expo account
eas build -p android --profile preview
```

When the build finishes, EAS gives you a download link for an `.apk`. Open that link on your
phone and install it. Data persists across restarts.

## Project layout

```
src/
  app/                         expo-router screens
    _layout.tsx                root Stack navigator
    index.tsx                  decks list (create deck, see due counts)
    deck/[id]/index.tsx        deck detail (stats, practice, add card, import CSV, rename/delete)
    deck/[id]/card.tsx         add / edit a single card (?cardId=... to edit)
    deck/[id]/practice.tsx     practice batch + session summary
  db/
    database.ts                opens SQLite, creates schema
    decks.ts                   deck queries
    cards.ts                   card queries + spaced-repetition rules (due_at)
  lib/csv.ts                   semicolon CSV parser
  components/Button.tsx        shared button
  theme.ts                     colors / spacing
```

### How "learned vs. due" works

Each card has a `due_at` timestamp (epoch ms). A card is **due / unlearned** when
`due_at <= now`. New and imported cards start at `due_at = 0` (immediately due). Choosing a
familiarity level updates `due_at` (now / +1 day / +4 days / +1 week). This single field
drives both the practice filter and the automatic return of expired cards — no background
job is needed.

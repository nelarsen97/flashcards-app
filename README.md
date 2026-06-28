# Flashcards

A simple personal flashcard app (Expo / React Native, Android). Create decks, add cards
manually or via CSV import, and practice with lightweight spaced repetition. All data is
stored locally on the device in SQLite — no accounts, no internet required.

## Features

- Multiple named decks.
- Add cards manually (front / back), or add many at once on the **Add cards in bulk**
  screen — paste a list (one card per line) or import a CSV file, with a configurable
  front/back separator.
- Practice mode: up to 10 due cards per batch, flip to reveal, then rate it —
  **Hard / Fine / Easy**. Each card carries a **Familiarity** level (a
  Leitner "box"); the rating moves that level, which sets how long the card is put away.
  - **Hard** → forgot: reset to level 0, stays due now.
  - **Fine** → recalled: climb one level (longer interval).
  - **Easy** → easy: climb two levels.
  - Intervals grow along the ladder **1 → 3 → 7 → 14 → 30 → 60 days** (capped at 60),
    so a card you keep getting right returns less and less often.
  - When a card's timer passes, it automatically becomes due again.
  - **Swipe** (or arrow keys on web) to move between cards without rating them —
    Familiarity is left untouched, so a skipped card stays in the set for later.
    Swiping forward past the last card skips it and ends the session.
- Session summary after each batch, with the option to practice the next 10.

## Bulk add / CSV import format

On the **Add cards in bulk** screen (deck "⋯" menu) you set a front/back
**separator** (defaults to `-`), then either paste lines or import a CSV/text file.
**One card per line, no header row**:

```
hola - hello
gato - cat
buenos días - good morning
```

- Each line is split on the **first** occurrence of the separator, so the back may
  itself contain the separator (e.g. set it to `;` for `hola;hello` files).
- Surrounding whitespace (around the separator and at line ends) is stripped.
- Blank lines and lines without the separator are skipped.

## Run it during development

```bash
bun install            # first time only (Bun is the package manager)
npx expo start         # then scan the QR code with the Expo Go app on your Android phone
```

Press `a` to open in an Android emulator if you have Android Studio set up.

## Build a standalone APK (install permanently, no PC needed)

Uses [EAS Build](https://docs.expo.dev/build/introduction/) (free tier, builds in the cloud):

```bash
bun add -g eas-cli
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
    deck/[id]/index.tsx        deck detail (stats, practice, add card, bulk add, rename/delete)
    deck/[id]/card.tsx         add / edit a single card (?cardId=... to edit)
    deck/[id]/bulk.tsx         add many cards at once (paste or CSV file, custom separator)
    deck/[id]/practice.tsx     practice batch + session summary
  db/
    database.ts                opens SQLite, creates schema
    decks.ts                   deck queries
    cards.ts                   card queries + spaced-repetition rules (due_at)
  lib/csv.ts                   delimited line parser (custom separator)
  components/Button.tsx        shared button
  theme.ts                     colors / spacing
```

### How "learned vs. due" works

Each card has a `due_at` timestamp (epoch ms) and a `familiarity` level (a Leitner box,
0 = new/lapsed). A card is **due / unlearned** when `due_at <= now`. New and imported cards
start at `familiarity = 0`, `due_at = 0` (immediately due). Rating a card runs `nextReview`
(`src/db/cards.ts`): the rating moves its familiarity level, and the new level indexes the
interval ladder `INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]` (days) to set the next `due_at`.
Hard keeps the card due now (it stays in the practice set); Fine and Easy push it
out along the ladder. These two fields drive both the practice filter and the automatic
return of expired cards — no background job is needed.

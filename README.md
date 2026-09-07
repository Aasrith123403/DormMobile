# RoomLedger

Shared expenses, chores and plans for the people you live with.

One codebase, three targets: an **Android app** for Google Play, an
**installable web app** that iPhone users add to their home screen, and the
usual Expo dev builds for iOS and Android.

Built with Expo SDK 57, React Native 0.86, TypeScript, Expo Router and
Supabase. ~17,800 lines, 348 unit tests.

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [The pure core](#the-pure-core)
- [The data layer](#the-data-layer)
- [The database](#the-database)
- [The interface](#the-interface)
- [Design system](#design-system)
- [Auth and password reset](#auth-and-password-reset)
- [Shipping](#shipping)
- [Gotchas](#gotchas-things-that-will-bite-you)
- [Commands](#commands)

---

## What it does

You live with people. Money gets spent, chores get skipped, plans get made in
a group chat and forgotten. RoomLedger is the shared record.

| Feature | What it means |
| --- | --- |
| **Expenses & splits** | Log what was spent, split evenly or custom, or record that everyone paid separately |
| **Multiple payers** | Two people can each have covered part of one bill |
| **Balances** | Who owes whom, netted down to the fewest possible payments |
| **Settle up** | Deep-links into Venmo, then records the payment |
| **Chores** | Create them, then assign them; unassigned ones rotate automatically |
| **Supplies** | "We're out" flags a staple and names whose turn it is to buy |
| **Calendar** | Shared events, plus chore due dates and upcoming charges |
| **Presence** | A self-declared status and coarse place ("at the library") |
| **Pings** | "Come here" nudges with one-tap replies |
| **Subscriptions** | Recurring charges that post themselves |
| **Insights** | Where the money goes, by category and by person |

**It is not a fintech app.** No bank linking, no card details, no payment
processing. It tracks who owes what and hands off to Venmo. That distinction
matters when you fill in Google Play's financial-features declaration — the
answer is no.

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and anon key
npx expo start
```

You need a free [Supabase](https://supabase.com) project. Create one, then:

1. **Run the migrations.** Open the SQL editor and paste
   `supabase/migrations/0001_init.sql`, run it, then paste
   `supabase/apply_all.sql` (which is 0002–0008 concatenated) and run that.
2. **Copy your keys** from Project Settings → Data API into `.env`.
   Use the **Project URL** — the bare origin. The dashboard shows a REST
   endpoint (`…/rest/v1`) next to it; pasting that one makes every request
   fail, because supabase-js appends its own paths.
3. **Add redirect URLs** under Authentication → URL Configuration, or password
   reset links dead-end: `http://localhost:8081/reset-password` for local web,
   your deployed origin for production, and `roomledger://reset-password` for
   native.

The anon key is safe to ship — it is designed to be public, and row-level
security is what actually protects the data. **Never put a `service_role` key
in `.env`**: it bypasses RLS entirely.

---

## Architecture

Three layers, and the rule that keeps them apart is strict:

```
app/            Expo Router screens. JSX, navigation, local UI state.
  ├── (auth)/   Sign in, sign up, forgot/reset password
  └── (app)/    Everything behind a login
      └── groups/[id]/   The three tabs + the screens they link to

src/core/       PURE LOGIC. No React, no I/O, no imports from src/data.
                All the money maths lives here. 348 tests cover it.

src/data/       Supabase. Fetching, caching, realtime, mutations.

src/components/ The shared UI vocabulary.
src/lib/        Supabase client, generated-ish DB types, env parsing.
```

**Why the pure core matters.** Every calculation that could produce a wrong
number — splitting a bill, netting balances, minimising transfers, deciding
whose turn it is — is a pure function taking plain data and returning plain
data. That means it can be tested exhaustively without a database, a device
or a network, and it means those tests run in under a second.

It also means the app is not especially tied to Supabase. Swapping the backend
would mean rewriting `src/data/` and the SQL; `src/core/` would not change.

---

## The pure core

`src/core/` — 18 modules, no I/O anywhere.

| Module | Responsibility |
| --- | --- |
| `money.ts` | Integer cents. Parsing, formatting, rounding |
| `splits.ts` | Even and custom splits, remainder distribution |
| `balances.ts` | Net position per person, then `minimizeTransfers` |
| `rotation.ts` | Whose turn for a chore or a supply run |
| `chores.ts` | Assignment, the per-person board, even distribution |
| `calendar.ts` | Month grids, agendas, wall-clock time handling |
| `feed.ts` | Turns everything that happened into one ordered list |
| `presence.ts` | Statuses, places, ping inbox rules |
| `subscriptions.ts` | Due dates, catch-up generation |
| `insights.ts`, `spendSummary.ts` | Category and per-person breakdowns |
| `settlePrompt.ts` | When to suggest settling up |
| `recoveryLink.ts` | Parsing password-reset links |
| `categories.ts` | The fixed category list and its colours |
| `amountInput.ts` | Keypad digit-string handling |

### Two decisions worth knowing

**Everything is integer cents.** Floats cannot represent 0.10 exactly, and a
bill split three ways will drift. `money.ts` converts at the edges and nothing
in between ever sees a float. When a split does not divide evenly the
remainder goes to the earliest members by join order — deterministically, so
every device agrees, and the SQL function `insert_even_splits` mirrors the
same rule.

**Balances are derived, never stored.** There is no `balance` column. Every
balance is computed from expenses, splits and settlements on read. A stored
balance is a cache that can disagree with reality; a derived one cannot.
`minimizeTransfers` then reduces the debt graph greedily to at most n−1
payments, so three people settle with two payments, not six.

---

## The data layer

`src/data/`

- **`groupStore.ts`** — a module-level, ref-counted cache. One entry per
  group, shared by every mounted `GroupProvider`. The first subscriber starts
  the fetch and opens the realtime socket; the last to leave tears both down
  after a 15-second grace period (tab switches and modals both briefly drop to
  zero subscribers, and re-fetching each time would defeat the cache).
- **`groupContext.tsx`** — a thin `useSyncExternalStore` view over that cache.
  Derives balances, transfers and whose-turn maps.
- **`useHouseFeed.ts`** — builds the feed once for the screens that need it.
- **`mutations.ts`** — every write. Most go through Postgres functions so that
  multi-step operations cannot half-apply.
- **`auth.tsx`** — session, profile, and the password-recovery latch.

### Graceful degradation

Migrations 0002–0008 are optional in the sense that the app must not white-
screen without them. This is not theoretical: PostgREST fails the **entire**
query when an embedded relationship is missing, so one absent table used to
blank the whole group screen, members and all.

`groupStore.ts` detects "relation does not exist" errors once, remembers it in
a `degraded` flag, falls back to a query without that embed, and logs a single
warning naming the migration to run.

---

## The database

Supabase Postgres. Eight migrations in `supabase/migrations/`, plus
`supabase/apply_all.sql` which is 0002–0008 concatenated for one-paste setup.
Every statement is idempotent.

| Migration | Adds |
| --- | --- |
| `0001_init` | Core schema, RLS, RPCs, storage bucket, realtime |
| `0002_categories` | Expense and subscription categories |
| `0003_multiple_payers` | `expense_payers` |
| `0004_group_summaries` | One-query home screen |
| `0005_household` | Supplies, chores, presence, repeating expenses |
| `0006_presence_ping` | Self-declared place, "come here" pings |
| `0007_chore_assignments_and_events` | Chore owners, the calendar |
| `0008_keepalive` | Heartbeat so a free project is never paused |

### Security model

**Every table has row-level security, and the rule is the same everywhere: you
can only see rows for groups you belong to.** Membership checks go through
`SECURITY DEFINER` helpers (`is_group_member`, `is_group_owner`,
`shares_group_with`) because a policy that queries `memberships` directly
recurses into that table's own policy.

Verified by querying all 13 tables as an anonymous caller: every one returns
zero rows.

Some operations are Postgres functions rather than client writes, because they
have to be atomic or need a check RLS cannot express:

- `create_group`, `join_group_by_code` — create the group and the owner
  membership together
- `buy_supply_item` — logs the expense, splits it, clears the flag, records
  the buyer
- `assign_chore` — validates the assignee is in *that* group, which the chores
  policy cannot (it checks the chore's group, not the assignee's)
- `record_heartbeat` — see below

### Wall-clock dates

Events store `event_date DATE` and `start_time TIME`, not `timestamptz`.
"Dinner at 7" means seven o'clock where the house is. A timestamp would become
6 or 8 for anyone whose phone reports a different zone — the classic shared-
calendar bug.

### Keeping a free project awake

Supabase pauses free projects after **7 days of low database activity**, and a
paused project is unreachable until someone restores it by hand. Any database
activity resets that timer, so `.github/workflows/keepalive.yml` writes one
timestamp every Monday and Thursday.

The `heartbeat` table has RLS on with **no policies at all**, so nothing can
reach it through the API. The only way in is `record_heartbeat()`, which takes
no arguments, returns nothing, and can only set one timestamp on one row —
which is why granting it to `anon` adds no attack surface.

Set two repository secrets to turn it on (Settings → Secrets and variables →
Actions): `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

> GitHub disables scheduled workflows in a repo with no commits for 60 days.
> If this goes quiet for two months, re-enable it from the Actions tab.

---

## The interface

Three tabs, and one way to create anything.

| Tab | Answers |
| --- | --- |
| **Today** (`groups/[id]/index.tsx`) | What do I need to do right now? |
| **Explore** (`groups/[id]/explore.tsx`) | How is the house doing, and where is everything else? |
| **You** (`groups/[id]/you.tsx`) | My money, my chores, my status |

**Today** is one number, one button, one list. The number is what you owe or
are owed as large gradient type. The button opens the one creation flow. The
list is whatever is waiting on you. History sits underneath, quiet.

**Explore** is split in two on purpose: the top half is information you read
and leave (a spend line, a stat grid); the bottom half is navigation. Most
visits should end at the top without opening anything.

**`add.tsx` — "What's on your mind?"** is the single entry point for creating
an expense, event, chore, supply flag, ping or settle-up. It asks in words and
routes you there, so nobody has to learn which tab owns which action.

Ledger, balances, calendar, insights, subscriptions and the house screens all
still exist; they hang off Explore rather than each taking a fifth of the tab
bar.

---

## Design system

Two files restyle every screen: `src/theme.ts` and `src/components/ui.tsx`.

Near-black violet ground, one accent family (violet → pink), Poppins, full-pill
buttons, and **no borders anywhere**. Depth is carried by brightness: cards sit
lighter than the page, selected rows lighter than cards.

Two rules stop a dark UI becoming a light show:

1. **Only the primary action glows.** `glow()` is applied to exactly one
   button per screen.
2. **Colour is reserved.** Violet→pink for the accent, green and red for
   money, nothing else.

`src/components/shapes.tsx` holds the dark-mode toolkit:

- `GlowOrb` — the ambient haze behind a header
- `GradientNumber` — amounts as large gradient type. Drawn in **SVG** because
  React Native has no gradient text and a masked view would be iOS-only
- `Squiggle` — the smooth spend line
- `Smiley` — the mascot, for empty states

---

## Auth and password reset

Email and password via Supabase Auth. The app never sees or stores a password.

**Forgot password** is on the sign-in screen. It emails a one-time link that
opens `(auth)/reset-password.tsx`. Two things about that flow:

1. **A recovery link is a real login.** Supabase signs the user in to prove
   they own the address, so `RootNavigator` keeps a `recovering` latch that
   holds them on the reset screen. Without it the router sees a session and
   sends them into the app, and they never change their password.
2. **The confirmation is deliberately vague.** "If that address has an account,
   a link is on its way" is the same answer either way — a precise one would
   let anyone test whether an email is a user here.

Link parsing is in `src/core/recoveryLink.ts` with 17 tests, because it is the
one step where a bug locks somebody out of their account.

---

## Shipping

See **[docs/DEPLOYING.md](docs/DEPLOYING.md)** for the full walkthrough. Short
version:

**Web (PWA).** `npx expo export --platform web --output-dir dist` produces a
static site. `public/` holds the manifest, service worker and icons. Must be
served over HTTPS, and the host must rewrite every path to `index.html`
(`web.output` is `"single"`). **This is how iPhone users get the app** — added
to the home screen from Safari's Share menu. No App Store build exists and none
is needed.

**Android.** `eas build --platform android --profile production` produces the
`.aab` Google Play wants. Supabase values come from EAS environment variables,
not `.env`, which is not uploaded.

The service worker deliberately **never caches Supabase traffic** — a stale
balance is worse than a spinner. It caches the shell and build output only, so
the app opens on a bad connection. There is no offline mode.

---

## Gotchas (things that will bite you)

Each of these was a real bug. They are the reason the few remaining code
comments exist.

**Row types must be `type`, not `interface`.** postgrest-js requires each Row
to satisfy `Record<string, unknown>`. Interfaces get no implicit index
signature, so an interface silently degrades **every query result in the app**
to `never`.

**Never use `fontWeight`.** When a style names a font family like
`Poppins_600SemiBold`, React Native **ignores `fontWeight` on Android**. Bold
silently disappears on the platform you ship to Play while the web build fakes
it. Use `fonts.semibold` / `fonts.bold` from the theme.

**Import fonts and icons per path, not from the package root.**
`@expo-google-fonts/poppins/400Regular`, not `@expo-google-fonts/poppins`.
`@expo/vector-icons/Ionicons`, not `@expo/vector-icons`. The barrel imports
ship all 18 Poppins weights and every icon font — 6.8 MB of the web bundle for
4 weights and one icon set. Per-path brings it to 1.0 MB.

**`react-native-svg` is a native module.** Glows, gradient numerals and the
chart all use it, so Android needs a fresh `eas build` — an installed build
will not pick it up over the air.

**A modal with `headerShown: false` has no way out on web.** iOS has swipe-down
and Android has hardware back; the PWA has neither. Any such screen needs an
explicit back control.

**`supabase.channel(topic)` returns the *existing* channel** if one with that
topic is open, and a subscribed channel rejects new handlers. Topics get a
unique suffix per subscription, or a modal mounting a second provider for the
same group throws.

**`Alert.alert` is a no-op on react-native-web.** Every confirmation would be
silently dead in the browser. `src/components/dialog.tsx` is a Modal-based
replacement used everywhere instead.

**A pinned footer needs `KeyboardAvoidingView`.** Otherwise the keyboard
covers the save button and the form cannot be submitted.

---

## Commands

| Command | What it does |
| --- | --- |
| `npx expo start` | Run the app |
| `npx expo start --web` | Run in a browser |
| `npm test` | 348 unit tests over the pure core |
| `npm run typecheck` | TypeScript across app and tests |
| `npx expo export --platform ios` | Production bundle, useful as a build check |
| `npx expo export --platform web --output-dir dist` | Static web build (the PWA) |
| `eas build --platform android --profile production` | Play Store app bundle |

---

## A note on comments

The code is deliberately almost comment-free. The reasoning that would have
been in comments is in this README instead — that way it is in one place, it
stays readable, and it does not go stale in forty files at once.

The handful of comments that remain all mark the same thing: a change that
looks harmless and silently breaks something. They are listed under
[Gotchas](#gotchas-things-that-will-bite-you).

# RoomLedger

Shared expenses for small groups — dorms, apartments, ski trips — with the
life-logistics extras that actually come up: recurring subscriptions, whose
turn it is to buy toilet paper, and who is asleep right now.

Not a fintech app. There is no bank linking and no in-app payment processing.
Settling up hands off to Venmo via a deep link; RoomLedger only records that it
happened.

**Stack:** React Native + Expo (managed), TypeScript, Expo Router, Supabase
(Postgres, Auth, Realtime, Storage).

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` (see [Configure](#2-configure-env) below), apply the migration,
then:

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` / `a` for a simulator. Until `.env`
has real credentials the app opens on a setup checklist rather than a blank
screen.

---

## Setup

### 1. Apply the database migration

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**.

The migration is idempotent — re-running it is safe. It creates:

- every table, with row-level security enabled on all of them
- the `handle_new_user` trigger that mirrors `auth.users` into `public.users`
- the RPCs (`create_group`, `join_group_by_code`,
  `generate_due_subscription_charges`, `log_supply_purchase`)
- the private `receipts` storage bucket and its policies
- the realtime publication entries
- an optional nightly `pg_cron` job (skipped automatically if the extension is
  not enabled)

Using the Supabase CLI instead? `supabase db push` picks the file up from
`supabase/migrations/`.

**Email confirmation.** Supabase requires it by default, so a new account has
no session until the emailed link is clicked. To test solo, turn off *Confirm
email* under **Authentication → Sign In / Providers → Email**.

### 2. Configure `.env`

```bash
cp .env.example .env
```

| Variable | Where it comes from |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → Data API → anon public key |
| `EXPO_PUBLIC_OCR_PROVIDER` | `google`, `ocrspace`, or `none` |
| `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` | Google Cloud console (Vision API) |
| `EXPO_PUBLIC_OCRSPACE_API_KEY` | [ocr.space/ocrapi](https://ocr.space/ocrapi) |

Only `EXPO_PUBLIC_*` variables reach the bundle. Never put a `service_role` key
here — it bypasses row-level security. The anon key is designed to ship in
clients; RLS is what protects the data.

Restart with `npx expo start -c` after editing `.env` — the values are inlined
at build time.

### 3. Configure receipt OCR

OCR sits behind one function, [`parseReceipt(image)`](src/ocr/parseReceipt.ts).
Swapping providers means writing a new `OcrProvider` and adding a case; no
screen changes.

**Recommended: Google Cloud Vision.** It is a plain HTTPS call, so it works in
Expo Go with no native module and no custom dev client, and
`DOCUMENT_TEXT_DETECTION` handles creased thermal receipts far better than the
free alternatives. The first 1,000 requests a month are free.

1. Create a Google Cloud project and enable the **Cloud Vision API**.
2. Create an API key under **APIs & Services → Credentials**.
3. Restrict it to the Vision API (and to your bundle id once you build standalone).
4. Set `EXPO_PUBLIC_OCR_PROVIDER=google` and paste the key.

**Alternative: OCR.space** — free tier, no billing account, noticeably less
accurate. Set `EXPO_PUBLIC_OCR_PROVIDER=ocrspace` and add the key.

**On-device** is cheaper at scale and works offline, but every option (ML Kit,
Vision framework) needs a native module and therefore a custom dev client
instead of Expo Go. If you build one, implement `OcrProvider` over
`@react-native-ml-kit/text-recognition` and register it in `parseReceipt.ts`.

With `EXPO_PUBLIC_OCR_PROVIDER=none` the scan button disappears and amounts are
typed by hand — nothing is ever sent to a third party.

### 4. Configure Venmo

Nothing to install and no API key: RoomLedger builds a deep link and hands off.

- Each person adds their Venmo username in **Profile** (tap the avatar on the
  home screen). Without it, their roommates see "no Venmo username" and can
  only record payments manually.
- The link opens `venmo://paycharge?txn=pay&recipients=…&amount=…&audience=private`,
  falling back to `https://venmo.com/…` when the app is not installed.
- `LSApplicationQueriesSchemes` (iOS) and `queries` (Android) are already
  declared in `app.json`, which is what lets the app detect Venmo.
- On return, RoomLedger asks whether the payment went through and only then
  writes a `settlements` row. Payments are never assumed.

---

## Commands

| Command | What it does |
| --- | --- |
| `npx expo start` | Run the app |
| `npm test` | Unit tests for the pure logic |
| `npm run typecheck` | TypeScript across the app and the tests |
| `npx expo export --platform ios` | Production bundle, useful as a build check |

---

## How it works

### Balances are derived, never stored

```
balance(u) = what u paid − what u owes + what u has paid back − what u has been paid
```

[`computeBalances`](src/core/balances.ts) recomputes from expenses, splits and
settlements on every render, so a stale total is impossible. Balances always
sum to zero, which is what makes the netting terminate cleanly.

[`minimizeTransfers`](src/core/balances.ts) then settles the largest debtor
against the largest creditor until everyone is at zero — never more than n−1
payments, and circular debts collapse to nothing. (The exact minimum is
subset-sum hard; this is the standard approximation and is optimal for the
group sizes involved.)

### Money is integer cents

Dollars exist only at the edges — parsed on input, formatted on output. Split
remainders go one cent at a time to the earliest members, so shares always add
up to the total exactly. The SQL function `insert_even_splits` uses the same
rule, so a subscription charge generated server-side matches what the app would
have produced.

### Everything derived is pure and tested

`src/core/`, `src/venmo/deepLink.ts` and `src/ocr/extract.ts` contain no I/O and
no React. 104 unit tests cover them, including randomised ledgers checked for
exact settlement:

```bash
npm test
```

### Row-level security

Every table has RLS on, and the rule is the same everywhere: *you can only
touch rows belonging to a group you are a member of*. Membership checks run
through `SECURITY DEFINER` helpers (`is_group_member`, `is_group_owner`) so the
`memberships` policy does not recurse into itself.

Two operations legitimately cross a group boundary and are RPCs instead:

- `create_group` — creating the group and its owner membership must be atomic,
  or the creator could not read back the group they just made.
- `join_group_by_code` — a prospective member cannot `SELECT` the group yet, so
  the code lookup has to run as definer.

Receipts live in a **private** bucket at `<group_id>/<uuid>.jpg`; the storage
policy checks the leading folder against your memberships, and the app reads
them through short-lived signed URLs. A leaked URL grants nothing after it
expires, and there is no public object path at all.

### Realtime and the group cache

Group data lives in a module-level store ([`src/data/groupStore.ts`](src/data/groupStore.ts))
keyed by group id, not in the provider. The first subscriber starts the load
and opens the websocket channels; the last one to leave tears them down after
a short grace period. `GroupProvider` is a thin `useSyncExternalStore` view
over it, so mounting several providers for the same group — the tabs plus a
modal on top of them — costs one extra callback rather than another fetch and
another socket.

Two details that are easy to get wrong:

- **Channel topics must be unique per subscription.** `supabase.channel(topic)`
  returns the *existing* channel when the topic matches, and a channel that
  has already been subscribed rejects further `.on()` handlers. A stable
  per-group topic therefore throws as soon as a second subscriber appears.
- **A refresh requested mid-fetch has to run again.** An in-flight read
  reflects the database as of when it started, so a change arriving while it
  is running would otherwise stay invisible until the next event.

Refetching rather than patching keeps derived balances honest — a split
arriving before its expense would otherwise render a wrong total for a frame.
Bursts are coalesced, so one expense insert plus its splits is a single fetch.

Signing out clears the cache, so the next account cannot see the previous
one's ledger while its own data loads.

### Subscription charges

Two independent mechanisms, either of which is sufficient:

1. **On open** — `GroupProvider` calls `generate_due_subscription_charges` when
   a group mounts, generating every missed month and advancing the date.
2. **Nightly** — the `pg_cron` job at the end of the migration, if you enable
   the extension under **Database → Extensions**.

A partial unique index on `(subscription_id, charge_date)` makes both paths
idempotent: running the catch-up twice cannot double-charge anyone.

---

## Project layout

```
app/                              Expo Router routes
  _layout.tsx                     Providers + auth gate
  (auth)/                         Sign in, sign up
  (app)/
    groups/index.tsx              Group list with live per-group balances
    groups/new.tsx                Create (generates a join code)
    groups/join.tsx               Join by code
    groups/[id]/                  Group detail — tab bar lives here
      _layout.tsx                 GroupProvider + Tabs
      index.tsx                   Ledger
      balances.tsx                Balances
      subscriptions.tsx           Subscriptions
      supplies.tsx                Supply rotation (stretch)
      status.tsx                  Group status (stretch)
    expense/new.tsx               Add expense (modal)
    subscription/new.tsx          Add subscription (modal)
    settle.tsx                    Settle up + Venmo (modal)
    group-info.tsx                Join code, members, leave (modal)
    profile.tsx                   Name, Venmo username, sign out (modal)

src/
  core/                           Pure logic — unit tested, no I/O
    money.ts                      Cents conversion, parsing, formatting
    splits.ts                     Even and custom splits, validation
    balances.ts                   Netting and transfer minimisation
    subscriptions.ts              Month arithmetic, catch-up dates
    rotation.ts                   Supply turn order
    base64.ts                     Encoder (React Native has no btoa)
    __tests__/                    104 tests
  venmo/deepLink.ts               Deep link construction (pure)
  ocr/
    parseReceipt.ts               The one swappable OCR seam
    extract.ts                    OCR text -> amount + merchant (pure)
    providers/                    Google Vision, OCR.space
  data/
    groupStore.ts                 Refcounted per-group cache + realtime
    groupContext.tsx              useSyncExternalStore view over the store
    groups.ts, mutations.ts       Group list, writes
    auth.tsx, realtime.ts         Session, subscription helper
  components/                     Shared UI
  lib/                            Client, env, database types
  screens/SetupRequired.tsx       Shown when .env is unconfigured

supabase/migrations/0001_init.sql Schema, RLS, RPCs, storage, cron
```

---

## Design decisions worth knowing

**`users.venmo_username` is not in the original data model.** A Venmo deep link
needs a recipient handle, and there was nowhere to put it. It is nullable;
without it the Settle Up screen degrades to manual recording.

**`expenses.subscription_id` and `expenses.charge_date` are additions too.**
They exist so subscription catch-up can be idempotent — without them, two
people opening the app on the 1st would each generate the month's charge.

**Deleting an expense is a long-press on the ledger row**, not a swipe, because
a swipe next to a scrolling list is easy to trigger by accident and this
deletes data for everyone.

**No notifications, anywhere.** Balances are visible the moment the app opens —
on the home screen, in the group header, and on the Balances tab. Nobody gets
nagged.

---

## Troubleshooting

**"Add EXPO_PUBLIC_SUPABASE_URL…"** — `.env` is missing or still has
placeholders. Fill it in and restart with `npx expo start -c`.

**"Invalid path specified in request URL"** — `EXPO_PUBLIC_SUPABASE_URL` has a
path on it. The dashboard shows a REST endpoint (`…/rest/v1`) right beside the
Project URL, and supabase-js appends its own `/auth/v1` and `/rest/v1` paths to
whatever you configure. Use the bare origin:
`https://<project-ref>.supabase.co`. The app strips a stray path and warns in
development, but fix `.env` so production behaves the same.

**Sign-up succeeds but nothing happens** — email confirmation is on. Click the
link, or disable *Confirm email* in Supabase.

**"email rate limit exceeded"** — Supabase's built-in SMTP sends only a couple
of messages per hour per project, and every sign-up attempt spends one. Turn
off *Confirm email* under **Authentication → Sign In / Providers → Email**:
sign-up then returns a session immediately and sends nothing, so the limit
stops applying. Accounts created before you flipped it can sign in normally
once it is off — no need to register again. For a real deployment, configure
your own SMTP provider instead.

**"That join code doesn't match any group"** — codes are six characters and
exclude lookalikes (no O/0 or I/1). They are case-insensitive.

**Expenses do not appear for other members in real time** — check that
**Database → Replication** lists the `supabase_realtime` publication with the
app's tables. Section 8 of the migration adds them.

**Receipt scanning does nothing** — `EXPO_PUBLIC_OCR_PROVIDER` is `none`, or
the key is missing. The scan button falls back to attaching a plain photo.

**Venmo does not open** — the recipient has no `venmo_username`, or Venmo is
not installed (the app then opens the web flow). On a simulator without Venmo,
expect the web fallback.

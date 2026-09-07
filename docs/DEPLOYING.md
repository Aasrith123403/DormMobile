# Shipping RoomLedger

Two targets, two very different amounts of work:

| Target | How people get it | Cost | Review wait |
| --- | --- | --- | --- |
| **Web app (PWA)** | Open a link, add to home screen | Free | None |
| **Google Play** | Play Store | $25 once | Hours to days |

**iPhone users get the web app, not an App Store app.** Publishing to Apple's
store needs a $99/year Apple Developer account and a Mac build — the PWA route
below gives iPhone users a real home-screen icon, full-screen app, and no
Safari address bar, for free and with no review.

---

## 1. The web app

### Build it

```bash
npx expo export --platform web --output-dir dist
```

That produces a static site in `dist/`. Everything in `public/` is copied in
as-is: `manifest.json`, `sw.js`, `index.html` (the shell) and `icons/`.

### Host it

Any static host works. It **must** be served over HTTPS — service workers and
"Add to Home Screen" are both disabled on plain HTTP, so a link that works on
your laptop over `http://` will silently fail to install on a phone.

The one thing you have to configure is a **rewrite of every path to
`index.html`**. `app.json` sets `web.output` to `"single"`, so the whole app is
one HTML file and the router handles the URL in the browser. Without the
rewrite, a link straight to `/groups/abc/ledger` returns 404.

<details>
<summary>Netlify — <code>netlify.toml</code></summary>

```toml
[build]
  command = "npx expo export --platform web --output-dir dist"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
</details>

<details>
<summary>Vercel — <code>vercel.json</code></summary>

```json
{
  "buildCommand": "npx expo export --platform web --output-dir dist",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
</details>

<details>
<summary>Cloudflare Pages</summary>

Build command `npx expo export --platform web --output-dir dist`, output
directory `dist`, then add a `dist/_redirects` file containing:

```
/*  /index.html  200
```
</details>

### Two settings that will bite you

1. **Environment variables.** `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` are read at *build* time and baked into the
   bundle. Set them in your host's build environment or the deployed app shows
   the "setup required" screen. (Baking the anon key in is correct and
   intended — it is a public key, and RLS is what actually protects the data.)

2. **Supabase redirect URLs.** In the Supabase dashboard under
   *Authentication → URL Configuration*, add your site's origin (e.g.
   `https://roomledger.example.com`) to **Site URL** and **Redirect URLs**.
   Without it, confirmation and password-reset emails bounce users to
   `localhost`.

### Tell your users how to install it

The app shows these steps itself the first time someone opens it in a phone
browser (`src/components/InstallHint.tsx`), and dismisses forever once they
install. Here is the same thing in copy-paste form:

**iPhone / iPad — must be Safari.** Chrome on iOS cannot add to the home
screen.

1. Open the link in **Safari**.
2. Tap the **Share** button (the square with an arrow) at the bottom.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

It now sits with your other apps, opens full screen with no address bar, and
stays signed in.

**Android — Chrome.**

1. Open the link in **Chrome**.
2. Tap **Install** when the banner appears, or open the **⋮** menu and choose
   **Install app** / **Add to Home screen**.

### What it does and does not do offline

`public/sw.js` caches the app shell and the build's own static files so the app
opens on a bad connection. It deliberately **never caches Supabase traffic** —
a stale balance is worse than a spinner. There is no offline mode; without a
connection you get the app and an error banner.

---

## 2. Google Play

### Before you start

- A **Google Play Developer account** — $25, one time, at
  [play.google.com/console](https://play.google.com/console). Approval can
  take a couple of days, so start it first.
- An **Expo account** for EAS builds: `npx eas-cli login`.
- A **privacy policy at a public URL**. Play will not let you publish without
  one. What RoomLedger actually collects, so you can describe it accurately:
  - Email address and display name (for the account)
  - Expenses, chores, events, statuses and messages the user types in
  - Optional receipt photos, stored in Supabase Storage
  - Optional Venmo username
  - No location data of any kind, no advertising identifiers, no analytics SDK

### One-time setup

```bash
npm install --global eas-cli
eas login
eas build:configure
```

Set the Supabase values as EAS environment variables so they are compiled into
the store build — `.env` is not uploaded to EAS:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co"
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR-ANON-KEY"
```

`eas.json` already points the `production` profile at the `production`
environment and builds an **app bundle** (`.aab`), which is the format Play
requires.

### Build

```bash
eas build --platform android --profile production
```

The first run offers to generate an upload keystore — say yes and let EAS keep
it. **If you lose that keystore you cannot ever update the app**, so if you
generate your own instead, back it up somewhere you will still have in five
years.

Want to try the build on a real phone first? `--profile preview` produces an
installable `.apk` instead.

### Submit

Create the app in the Play Console once (name, default language, "App", free
or paid), then:

```bash
eas submit --platform android --profile production
```

That needs a Google service account JSON at `./play-service-account.json` —
follow [Expo's guide to creating
one](https://docs.expo.dev/submit/android/#creating-a-google-service-account).
It is a credential: keep it out of git. Alternatively skip `eas submit` and
upload the `.aab` by hand in the Play Console.

`eas.json` submits to the **internal testing** track. Promote to production in
the Play Console once you have tried it. Do not skip internal testing — a bad
production release takes days to replace.

### Play Console checklist

Play will block release until all of these are green:

- **Store listing** — short description (80 chars), full description, app icon
  (512×512), feature graphic (1024×500), and at least 2 phone screenshots
- **Privacy policy URL** — see above
- **Data safety form** — declare account info (email, name), user-generated
  content, and photos; declare that data is encrypted in transit and that
  users can request deletion
- **Content rating questionnaire**
- **Target audience** — if you say the app is aimed at anyone under 13 the
  requirements get much stricter; RoomLedger is aimed at adults
- **App access** — the app is entirely behind a login, so Play *requires* you
  to give reviewers working test credentials. Create a throwaway account with
  a group and some expenses in it and put those details here, or your review
  will be rejected without anyone seeing the app.
- **Financial features declaration** — answer **no**. RoomLedger tracks who
  owes what and deep-links to Venmo; it never moves money, links a bank, or
  processes a payment. Answering yes drags you into a much heavier review.

### Every update after the first

Bump `expo.android.versionCode` in `app.json` (Play rejects a reused one) and
`expo.version` for the number people see. The `production` profile has
`autoIncrement` on, so EAS handles `versionCode` for you — just remember
`version` for anything users should notice.

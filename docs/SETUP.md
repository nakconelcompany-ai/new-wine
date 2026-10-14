# Setup & deployment guide

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Never commit real values. `.env.example` lists names with placeholders only.

| Variable | Purpose | Production | Preview | Local dev |
|---|---|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string (use the **pooled** string) | Required | Required — use a **separate Neon branch**, never the production database | Required |
| `ADMIN_EMAIL` | Email used to sign in to `/admin` | Required | Required | Required |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the first admin password (can be changed later inside the dashboard) | Required | Required | Required |
| `ADMIN_SESSION_SECRET` | Signs admin session cookies, at least 32 random characters | Required | Required | Required |
| `VOTE_CODE_PEPPER` | Secret used to hash voting codes, at least 32 random characters. **Do not change after codes are issued** — all issued codes would stop working | Required | Required | Required |
| `RUN_MIGRATIONS` | Set to `true` to also run migrations during a non-production build | No | Optional | No |

None of these use the `NEXT_PUBLIC_` prefix, so none can reach the browser.

## 2. Database migrations (deliberate and documented)

* Migrations are plain SQL files in `migrations/`. Each runs once, in a transaction, and is recorded in a `_migrations` table. They only **add** structure — they never drop or reset data.
* `npm run build` runs `scripts/predeploy.mjs`, which applies migrations and the idempotent category seed **only on Vercel Production builds** (`VERCEL_ENV=production`). Preview and local builds skip it, so previews never touch production data.
* To run by hand (computer required): `DATABASE_URL=... npm run db:setup`.
* Running setup repeatedly is safe: the 17 categories are upserted by a stable key, never duplicated. Categories that are no longer in the list are switched off, never deleted, so any old votes are kept.
* Your nominee list is loaded **once** (tracked in `_migrations`). After that, renames, publishing and archiving done in the dashboard are never undone by a redeploy.

## 3. First-time deployment

1. Vercel → **Add New → Project** → import `nakconelcompany-ai/new-wine`. Framework is detected as Next.js; leave build settings alone.
2. Add the five variables above for **Production**.
3. Deploy. The build creates the tables and seeds the 17 categories and loads the nominees.
4. Open `/admin`, sign in, then **Account → Change password** straight away.
5. **Nominees** tab → the nominees are already loaded and published; check the spelling of each name, rename or add where needed.
6. **Codes** tab → generate one code per voter. Save/copy/download them immediately — they are shown once and stored only as hashes.
7. **Voting** tab → choose **Who can vote** (personal codes, or open link with one vote per device) → check readiness → optionally set start/end times → **Open voting**.
8. When finished: **Close voting** → review the **Results** tab → export CSV → **Publish results** when ready.

## 3b. Category posters

Each category can show a poster image instead of a text title. Put the image in `public/categories/<category-key>.jpg` and add it to `src/lib/banners.ts`. The poster is shown full width as a 16:9 slice, so keep the title in the vertical middle of a portrait image (the same layout as the Best Dressed Male poster). Categories without a poster show a normal text heading. Keys: `voice-of-the-year-male`, `voice-of-the-year-female`, `upcoming-voice-male`, `upcoming-voice-female`, `most-dedicated-punctual-member`, `upcoming-praise-leader-male`, `upcoming-praise-leader-female`, `most-compliant-uniform-male`, `most-compliant-uniform-female`, `most-energetic-female`, `most-energetic-male`, `power-house-personality-male`, `power-house-personality-female`, `most-funny`, `best-dancer-praise-male`, `best-dancer-praise-female`, `most-active-musician`.

## 4. How the rules are enforced

* Voting method is chosen in the dashboard. **Personal codes** (default) is the strongest. **Open link** needs no code and allows one vote per device (cookie), so a person can vote again from another phone or a private tab.
* One ballot per code: the code row is locked inside the submission transaction, `ballots.voter_code_id` is `UNIQUE`, and the code is marked used in the same transaction.
* A nominee can only be chosen in its own category: a composite foreign key on `ballot_selections(nominee_id, category_id)` enforces it in the database, besides the server checks.
* One selection per category per ballot: `UNIQUE (ballot_id, category_id)`.
* Voting status and dates are checked on the server inside the submission transaction.
* Results are never returned by any public endpoint until the admin publishes them; the public endpoint then returns winners only.
* Nominees are archived, never deleted, so historical votes stay attached. A nominee with votes cannot be moved to another category.

## 5. Privacy note

A ballot is linked to the voting-code row so that duplicate voting can be prevented. If you add a name label to a code, an administrator with database access could in principle connect a voter to their ballot. Leave labels blank (generate by number) if you want votes to be unlinkable to people.

## 6. Troubleshooting

* **"The server is not fully configured"** — one of the environment variables above is missing or too short.
* **Database connection errors mentioning `channel_binding`** — remove `&channel_binding=require` from the end of `DATABASE_URL` (the connection is still TLS-encrypted).
* **Locked out** — set a new `ADMIN_PASSWORD_HASH` in Vercel *and* clear the dashboard-set password: run `DELETE FROM admin_credentials;` in the Neon SQL editor, then redeploy. Generate a hash with `npm run hash-password -- "new password"`.
* **Local testing** — `npm run test:integration` runs the acceptance suite against a running server and a **disposable** database. Seed that database with `SEED_NOMINEES=false npm run db:seed` so the test can add its own nominees.

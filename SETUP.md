# Setup checklist (one-time, by JK)

Phase 0 scaffolding is in the repo. The remaining steps need a human with credentials to:

1. Push the repo to GitHub.
2. Create two Supabase projects.
3. Apply migrations + seed data.
4. Configure GitHub Pages and Actions secrets so deploys work.

When the checklist below is done, `npm run dev` shows a working local app and pushes to `main` deploy to GitHub Pages.

---

## 1. Install the Supabase CLI

```bash
brew install supabase/tap/supabase
supabase --version    # should be ≥ 1.150
```

(Other install options: <https://supabase.com/docs/guides/cli/getting-started>)

## 2. Create the GitHub repo

```bash
gh repo create forager --private --source=. --remote=origin --push
```

This pushes the existing commits to `github.com/<your-username>/forager`.

## 3. Create the Supabase projects

Sign in to <https://supabase.com> (free tier is fine), then create **two** projects:

- `forager-dev` — for local development
- `forager-prod` — for deployed app

For each project, from **Project Settings → API** note:
- The project URL (e.g. `https://abcd1234.supabase.co`)
- The `anon` public key
- The `service_role` key (only used briefly; we use the DB URL instead)

From **Project Settings → Database** note:
- The connection string (look for "URI" — it includes the password, of the form `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`)

## 4. Local environment

```bash
cp .env.example .env.local
# Edit .env.local: paste your forager-dev values:
#   PUBLIC_SUPABASE_URL=...
#   PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_DB_URL=...
```

Verify you can reach the dev DB:

```bash
psql "$(grep SUPABASE_DB_URL .env.local | cut -d= -f2-)" -c "select version();"
```

(Or skip — `npm run seed` will fail clearly if the URL is wrong.)

## 5. Apply migrations to dev

```bash
supabase link --project-ref <forager-dev-ref>     # ref is the 'abcd1234' part of the URL
supabase db push
```

This applies all migrations in `supabase/migrations/` in order. Repeat for prod when ready (`supabase link --project-ref <forager-prod-ref>` then `supabase db push`).

## 6. Seed species and Ithaca windows

```bash
npm run seed
```

This loads the 30 forageable species and their stage windows into the dev DB. Re-run it any time the seed JSON changes; it's insert-if-not-exists by default. `npm run seed -- --force` overwrites existing rows.

## 7. Run the app and sign up

```bash
npm run dev
```

Open <http://localhost:5173>. Sign up with your real email (Phase 1 will ship the registration UI; for Phase 0 you may need to create a user via the Supabase dashboard → Authentication → Users → Add user).

## 8. Make yourself a region admin and seed dev fixtures

In the Supabase dashboard, **Authentication → Users**, copy your `id` (a UUID).

```bash
echo "FORAGER_DEV_USER_ID=<your-uuid>" >> .env.local
npm run seed:dev
```

This adds your user as an admin of the Ithaca region and inserts ~10 fake pins around Cornell.

## 9. GitHub Pages + Actions secrets (for deploys)

In your GitHub repo settings:

- **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
- **Settings → Secrets and variables → Actions → New repository secret**, add:
  - `PUBLIC_SUPABASE_URL` — your **prod** project URL
  - `PUBLIC_SUPABASE_ANON_KEY` — your **prod** anon key

Now `git push origin main` triggers `.github/workflows/deploy.yml`, which builds with the prod Supabase keys and publishes `build/` to GitHub Pages. The site lives at `https://<username>.github.io/forager/`.

## 10. Smoke test

Once deployed:
- Visit the GitHub Pages URL on your laptop and on your iPhone.
- On the iPhone: Safari → Share → "Add to Home Screen" — verifies the PWA manifest works.
- Phase 1 work begins after this.

---

## What's next

When all 10 steps are done, mark Phase 0 complete. Phase 1 (Solo MVP) starts: real authentication UI, the map screen with Leaflet, pin CRUD, observations, photos, "ripe now" view. See PLAN.md §8.3.

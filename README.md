# Quest

Job fair and recruitment platform for the Provincial Government of Cagayan's
Public Employment Service Office (PESO). React 19 + Vite frontend against a
Supabase (Postgres + Auth + Storage) backend with row-level security.

## What this repo contains

Only what is needed to run the web app and provision its database:

| Path | Purpose |
| --- | --- |
| `src/` | React application (pages, components, services, hooks) |
| `public/` | Static assets (logos, favicon, icon sprite) |
| `supabase/migrations/` | Ordered, timestamped schema history — canonical |
| `supabase/seed.sql` | Development seed data |
| `supabase/functions/` | Edge function (`extract-employment`) |
| `supabase/config.toml` | Local Supabase config |

`supabase/migrations/` is the **only** supported way to build the schema. Older
one-off `migration_*.sql` files and `schema.sql` are not included because the
migrations supersede them.

## Requirements

- Node.js 20+ and npm
- A Supabase project

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. The app reads exactly two variables:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project publishable key (Settings → API) |

The publishable key is designed to ship in a browser bundle; RLS is what
protects your data. Never put a service-role key in `.env.local`.

### Database

Apply the migrations in filename order:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Optionally load the seed data:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then promote your first account to admin, since new signups start as
`applicants`:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Roles are `applicant`, `employer`, `staff`, `supervisor`, `medical`, `admin`.

### Auth

In the Supabase dashboard, set the Site URL to `http://localhost:5173` and add
it plus `http://localhost:5173/**` to the redirect URLs. Note that `vite.config.js`
enables `basicSsl`, so the dev server also answers over HTTPS.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Lint (`oxlint`) |

## Deploying

`npm run build` emits a static `dist/`. Serve it from any static host and set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build-time
environment variables, then add the deployed origin to the Supabase redirect
URLs.

# FlowCore

Production-style **workflow operating system** for teams, built with **Next.js (App Router)**, **Tailwind CSS + shadcn/ui**, and **Supabase** (Auth + Postgres).

## Features

- **Auth**: Email/password via Supabase Auth; middleware protects app routes.
- **Workspaces**: Organizations with slugs, membership, and **org roles** (`org_owner`, `org_admin`, `org_manager`, `org_worker`).
- **Invites**: Owners/admins invite by email; accept at `/invite/[token]` (must sign in with invited email).
- **Onboarding**: `/onboarding` creates a workspace after first login if the user has no orgs.
- **Workflow**: Items move `created` → `in_progress` → `under_review` → `completed` with **RPC-enforced** transitions.
- **Kanban**: Drag-and-drop (`@dnd-kit`) plus per-card status control (role-aware).
- **Audit**: `activity_logs` per organization; system events for role changes, etc.
- **Comments**: Per item, org-scoped.
- **Settings**: General (rename workspace), Team (members + invites), Billing (plan placeholder + upgrade CTA).
- **Marketing**: `/`, `/pricing`, `/help`.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## 1. Install

```bash
npm install
```

## 2. Supabase configuration

1. Create a project in the Supabase dashboard.
2. Under **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** key
3. In the repo root, copy env template and fill values:

```bash
copy .env.local.example .env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. In **Authentication → Providers**, ensure **Email** is enabled (password sign-in).

5. Open **SQL Editor** and run migrations **in order**:

   - `supabase/migrations/001_flowcore.sql` — base tables, triggers, baseline RLS.
   - `supabase/migrations/002_flowcore_production.sql` — strict RLS, `flowcore_*` RPCs (pre–multi-tenant signatures are replaced by `003`).
   - `supabase/migrations/003_flowcore_saas.sql` — **organizations**, **members**, **invitations**, **subscriptions**, `organization_id` on items/comments/activity_logs, org-scoped RLS, updated `flowcore_*` RPCs.

6. Sign up once, then open the app. After login you’ll hit **onboarding** if you have no workspace, or your first workspace dashboard at `/{slug}/dashboard`.

If your Postgres version rejects `EXECUTE FUNCTION` on triggers, replace it with `EXECUTE PROCEDURE` for the trigger definitions in `001_flowcore.sql`.

## Security model

- **RLS** scopes data by **organization membership**. Users only see peers in shared orgs (`users` SELECT policy).
- **Writes** to items, comments, activity logs, memberships, and orgs go through **`flowcore_*` SECURITY DEFINER RPCs** (Server Actions). Direct table mutations from the client are denied where migration `003` defines blocking policies.

## 3. Run locally

```bash
npm run dev
```

- Public: `/`, `/pricing`, `/help`
- Auth: `/login`, `/onboarding`, `/invite/[token]`, `/{orgSlug}/...`

## 4. Production build

```bash
npm run build
npm start
```

## Project layout (high level)

```
app/
  page.tsx                 # Marketing landing
  pricing/, help/
  login/
  onboarding/
  invite/[token]/
  (app)/[orgSlug]/         # Authenticated workspace routes
    dashboard/, items/, activity/, search/, settings/...
  actions/                   # Server Actions
components/
  app-shell.tsx, org-switcher.tsx, sidebar-nav.tsx, ...
lib/
  button-variants.ts       # Shared cva (safe on server + client)
  organizations.ts, usage.ts, billing.ts, db.ts, permissions.ts, ...
supabase/migrations/
  001_flowcore.sql
  002_flowcore_production.sql
  003_flowcore_saas.sql
middleware.ts
```

## Scripts

| Command         | Description        |
|----------------|--------------------|
| `npm run dev`  | Development server |
| `npm run build`| Production build   |
| `npm run start`| Production server  |
| `npm run lint` | ESLint             |

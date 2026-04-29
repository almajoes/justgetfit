# justgetfit.org

Evidence-based fitness blog. Next.js 14 (App Router) + Supabase + Anthropic Claude + Resend + Vercel.

**Brand:** Just Get Fit — *Stronger. Every day.*

---

## What this is

- A blog with 8 categories (Strength, Hypertrophy, Conditioning, Nutrition, Recovery, Mobility, Programming, Mindset)
- Weekly cron generates an AI draft article every Monday at 9 AM Eastern
- Drafts go through a manual review queue before publishing
- Optional newsletter blast on publish via Resend
- Full CMS at `/admin` for posts, drafts, topics, partners, navigation, page content, settings, subscribers

## Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, vanilla CSS variables (no framework styling — see `app/globals.css`)
- **Database:** Supabase (Postgres) — schema delivered as `database-schema.sql` (run once at setup)
- **AI drafts:** Anthropic Claude Sonnet 4.5 (`lib/anthropic.ts`)
- **Cover photos:** Unsplash search (`lib/unsplash.ts`)
- **Email:** Resend (`lib/resend.ts`) — confirmation, newsletter, contact notifications
- **Hosting:** Vercel + Vercel Cron

## Setup

### 1. Supabase
1. Create a new Supabase project at supabase.com
2. SQL Editor → paste contents of `database-schema.sql` (delivered separately) → Run
3. Project Settings → API → copy:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://xxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → public anon key
   - `SUPABASE_SERVICE_ROLE_KEY` → service role key (admin-only operations)

### 2. Anthropic
1. platform.claude.com → API Keys → create key
2. Set a monthly spend limit ($10 is plenty for one Monday draft per week)
3. Copy key → `ANTHROPIC_API_KEY`

### 3. Unsplash
1. unsplash.com/developers → register an app
2. Copy Access Key → `UNSPLASH_ACCESS_KEY`

### 4. Resend
1. resend.com → create account (free: 3,000 emails/month)
2. Verify your domain `justgetfit.org` (DNS records they provide)
3. Create API key → `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL` to e.g. `"Just Get Fit <hello@justgetfit.org>"`

### 5. Local dev

```bash
npm install
cp .env.local.example .env.local
# Fill in all values
npm run dev
```

Visit `http://localhost:3000`. The admin is at `/admin` (login with `ADMIN_PASSWORD`).

### 6. Deploy to Vercel

1. Push the repo to GitHub
2. Vercel → New Project → import the repo
3. Set the same env vars in Vercel project settings
4. Deploy

**Cron timing:** `vercel.json` is set to `0 13 * * 1` which is **9 AM EDT every Monday**. During EST (Nov–Mar) this fires at 8 AM Eastern. If you want exact 9 AM year-round, use a third-party cron service or add a server-side guard.

## Structure

```
app/
├── (public)/
│   ├── page.tsx                 - Home
│   ├── about/
│   ├── articles/
│   │   ├── page.tsx             - All articles
│   │   └── [slug]/page.tsx      - Single article
│   ├── categories/
│   │   └── page.tsx             - All categories index
│   ├── category/[slug]/         - Filtered category page
│   ├── contact/
│   ├── partners/                - Partners & Resources
│   └── subscribe/
├── admin/
│   ├── drafts/                  - Review AI-drafted articles
│   ├── posts/                   - Edit published articles
│   ├── topics/                  - Topic queue for cron
│   ├── pages/                   - Edit static page content (CMS)
│   ├── navigation/              - Edit nav menus
│   ├── partners/                - Edit partner cards
│   ├── subscribers/             - Newsletter subscriber list
│   ├── newsletter/              - Send log
│   └── settings/                - Site settings
└── api/
    ├── contact/                 - Contact form submission
    ├── subscribe/               - Subscribe + confirm + unsubscribe
    ├── cron/generate-draft/     - Weekly cron endpoint
    └── admin/                   - All admin write endpoints

lib/
├── supabase.ts        - DB client + types
├── supabase-admin.ts  - Service role client
├── cms.ts             - Unified content fetcher (pages, settings, nav, partners, categories)
├── anthropic.ts       - AI draft generation
├── unsplash.ts        - Cover photo search
├── resend.ts          - Email helpers (confirmation, newsletter, contact)
├── tokens.ts          - Token generation for confirmation/unsubscribe
└── auth.ts            - Admin auth helper

components/
├── SiteNav.tsx
├── SiteFooter.tsx
├── PostCard.tsx
├── ContactForm.tsx
├── SubscribeForm.tsx
└── admin/
    ├── DraftEditor.tsx      - Draft review UI
    ├── DraftsClient.tsx     - Drafts list
    ├── PostEditor.tsx       - Edit published post
    ├── TopicsClient.tsx     - Manage topic queue
    ├── PageEditor.tsx       - CMS page editor (4 page types)
    ├── NavigationClient.tsx - Drag/drop nav editor
    ├── PartnersClient.tsx   - Partner cards manager
    ├── SubscribersClient.tsx - Subscriber table
    └── SettingsClient.tsx   - Site settings
```

## First-time setup: backfilling articles

After deploying with an empty database, you'll have 51 seeded topic ideas but zero published posts. To backfill the site with a credible publishing history:

1. Visit `/admin/generate`
2. The "Backfill (auto-publish, backdated)" mode will be selected by default (since you have no posts yet)
3. Set the count (e.g. 51 to use the full topic queue, or fewer to start smaller)
4. Click **"Generate and publish"**
5. Wait — each article takes ~30–60 seconds. 51 articles = 25–50 minutes. Keep the tab open.

**What this does:** generates each article via Claude, fetches a cover image from Unsplash, and **immediately publishes** to the public site with a backdated `published_at` timestamp. Article 1 lands on the most recent past Monday at 9 AM ET; article 2 lands on the Monday before that; etc. So 51 articles = a publishing history spanning the past ~12 months.

**Cost:** ~$0.30–0.50 per article in Anthropic API costs ($15–25 total for 51 articles).

**Important:** backfill skips the manual review step — articles go live directly. Read a few of them after generation and clean up anything off. After the backfill is done, all future articles use the standard draft → review → publish flow (cron generates a draft every Monday, you review and publish).

## Ongoing flow

After backfill, the weekly cron (Mondays 9 AM EDT, defined in `vercel.json`) generates one new draft and drops it into `/admin/drafts`. You review it, edit if needed, and click **Publish**. If "Send to subscribers" is checked, the publish action also blasts the article to all confirmed subscribers via Resend.

You can also manually trigger draft generation any time via `/admin/generate` → "Draft batch" mode.



Every public-facing page reads its content from Supabase:
- **`pages` table** stores Home Hero / About / Subscribe / Contact content as JSONB
- **`nav_items` table** stores menu items (main nav + footer Quick Links + footer Categories)
- **`partners` table** stores partner cards
- **`categories` table** stores the 8 fitness categories
- **`settings` table** stores site name, tagline, footer copy

To edit any page content, go to `/admin/pages/[slug]`. To edit menus go to `/admin/navigation`. Changes go live on the public site within ~60 seconds (revalidation interval).

## Newsletter flow

1. Reader submits email at `/subscribe` (or any inline form)
2. POST `/api/subscribe` → saves with `status: 'pending'`, sends confirmation email via Resend
3. Reader clicks link → GET `/api/subscribe/confirm` → flips to `confirmed`
4. When you publish a draft with "Send to subscribers" checked, the publish handler queues an email blast to all confirmed subscribers
5. Each email includes a one-click unsubscribe link tokened to that subscriber

You can also manually trigger a blast for any published post via `POST /api/admin/newsletter/send` (UI button on the post editor coming if needed).

## Resend deliverability tips

- Verify your domain in Resend (SPF, DKIM, DMARC records)
- Keep your "From" name consistent
- The free tier is 3,000 emails/month — at 500 subscribers that's 6 sends. Upgrade to the $20/mo tier (50k emails) when you outgrow it.

## Admin password

Set `ADMIN_PASSWORD` in env. The `/admin` route checks for this via `lib/auth.ts`. If you want OAuth or magic-link auth instead, swap that file for Supabase Auth — only `checkAdminAuth()` callsites need updating.

## Disclaimer

Nothing on the site (or in this codebase) constitutes medical advice. The fitness disclaimer is shown at the bottom of every article.

---

Built with ♡ for people who actually train.

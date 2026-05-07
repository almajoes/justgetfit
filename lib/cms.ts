import { supabase } from './supabase';
import type {
  SiteSettings,
  FooterSettings,
  HomeHeroPage,
  AboutPage,
  SubscribePage,
  ContactPage,
  AppPage,
  NavItem,
  Partner,
  Category,
} from './supabase';

// -----------------------------------------------------
// SETTINGS (key-value)
// -----------------------------------------------------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}

const SITE_DEFAULTS: SiteSettings = {
  name: 'Just Get Fit',
  tagline: 'Stronger. Every day.',
  description: 'Evidence-based fitness writing.',
  contact_email: 'hello@justgetfit.org',
  newsletter_enabled: true,
  // SEO fields — all optional; empty strings mean "use computed defaults"
  seo_title: '',
  seo_title_template: '',
  seo_description: '',
  keywords: '',
  og_title: '',
  og_description: '',
};

const FOOTER_DEFAULTS: FooterSettings = {
  brand_tagline: 'Evidence-based fitness writing on training, nutrition, recovery, and the long game. New article every Monday — stronger, every day.',
  copyright: '© 2026 Just Get Fit. Stronger. Every day. Nothing here is medical advice.',
  version_label: 'v1.0',
};

// Site code injection — meta tags for verification + analytics scripts
// Stored under settings.site_code. All fields optional. No defaults beyond empty strings.
export type SiteCode = {
  meta_tags: string;        // Raw HTML to inject in <head> — typically <meta name="..." content="..." /> tags
  head_scripts: string;     // Raw HTML for <head> — analytics like Google Analytics gtag.js, Plausible, Fathom
  body_scripts: string;     // Raw HTML for end of <body> — chat widgets, late-loading scripts
};

const SITE_CODE_DEFAULTS: SiteCode = {
  meta_tags: '',
  head_scripts: '',
  body_scripts: '',
};

export const getSiteSettings = () => getSetting('site', SITE_DEFAULTS);
export const getFooterSettings = () => getSetting('footer', FOOTER_DEFAULTS);
export const getSiteCode = () => getSetting('site_code', SITE_CODE_DEFAULTS);

// -----------------------------------------------------
// PAGES (structured content)
// -----------------------------------------------------
/**
 * Fetch a CMS page. Returns stored content deep-merged over the fallback —
 * so missing fields in the DB row (e.g. fields added in later migrations
 * that didn't update existing rows) fall back to defaults automatically.
 *
 * Why deep-merge: when we add new fields to a page type (e.g. cta_eyebrow
 * on AppPage), existing DB rows don't have them. Without merge, `data.content`
 * has missing fields = `undefined`, and the page renders empty for those
 * fields. With merge, missing fields fall back to the default value —
 * defensive against schema additions over time.
 *
 * Arrays are NOT merged (replaced). Objects ARE merged recursively. This
 * matches CMS expectations: if the admin set `features: []`, that's an
 * intentional empty list, not a request to fall back to default features.
 * But if `features` is `undefined` (the field doesn't exist at all), we
 * fall back.
 */
export async function getPage<T>(slug: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('pages')
    .select('content')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return fallback;
  return deepMerge(fallback, data.content) as T;
}

/**
 * Deep-merge override into base. Arrays are replaced (not merged).
 * Plain objects are merged key-by-key. Primitive overrides win.
 *
 * `undefined` values in override are skipped (use base). `null` is treated
 * as an explicit value — admins may want to clear a field with null.
 */
function deepMerge<T>(base: T, override: any): T {
  if (override === undefined) return base;
  if (override === null) return override as T;
  if (Array.isArray(base) || Array.isArray(override)) {
    // Arrays are replaced wholesale — admin's edit is the source of truth
    return (override !== undefined ? override : base) as T;
  }
  if (
    base !== null &&
    typeof base === 'object' &&
    typeof override === 'object'
  ) {
    const result: any = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = deepMerge((base as any)[key], override[key]);
    }
    return result;
  }
  return override as T;
}

export const HOME_HERO_DEFAULT: HomeHeroPage = {
  pill_text: 'New article every Monday · Evidence-based',
  headline_part1: 'Stronger.',
  headline_accent: 'Every',
  headline_part2: 'day.',
  lede: 'Just Get Fit is evidence-based fitness writing.',
  cta_primary: { label: 'Read the latest', url: '/articles' },
  cta_secondary: { label: 'Browse categories', url: '/categories' },
  background_image_url: '',
  stats: [],
};

export const ABOUT_DEFAULT: AboutPage = {
  pill_text: 'About Just Get Fit',
  headline_part1: 'Stronger.',
  headline_accent: 'Every',
  headline_part2: "day. That's the whole thing.",
  tagline: '',
  body_markdown: '',
  pillars: [],
  cta_primary: { label: 'Subscribe', url: '/subscribe' },
  cta_secondary: { label: 'Read latest', url: '/articles' },
};

export const SUBSCRIBE_DEFAULT: SubscribePage = {
  pill_text: 'Free · One email per week',
  headline_part1: 'Get every article',
  headline_accent: 'in your inbox',
  headline_part2: '.',
  lede: '',
  form_placeholder: 'you@example.com',
  form_button: 'Subscribe →',
  promise_heading: "What you'll get",
  promises: [],
  faq_heading: 'Common questions',
  faqs: [],
};

export const CONTACT_DEFAULT: ContactPage = {
  pill_text: 'Contact',
  headline_part1: 'Get in',
  headline_accent: 'touch',
  headline_part2: '.',
  intro: '',
  labels: { name: 'Your name', email: 'Email', subject: 'Subject', message: 'Message', submit: 'Send →' },
  placeholders: { name: '', email: '', subject: '', message: '' },
  success_message: 'Got it.',
};

/**
 * Default content for the /app marketing landing page.
 *
 * Seeds the CMS with the same content that was originally hardcoded in
 * app/app/page.tsx (May 3 2026). On first load after the migration, /app will
 * render exactly as before — admin edits via /admin/pages/app override it.
 *
 * The hero/AppCTA at the top of /app stays hardcoded — it's a shared
 * component used on article pages too. Only the sections BELOW the hero are
 * managed here.
 */
export const APP_DEFAULT: AppPage = {
  // ─── Hero / CTA card defaults ───
  // Mirrors what was previously hardcoded in components/AppCTA.tsx.
  // "AI-generated meal plans" wording was removed per May 3 update —
  // now reads "Meal plans built around your preferences".
  cta_eyebrow: 'Coming soon · The Just Get Fit App',
  cta_headline: 'Personalized plans that adapt to you.',
  cta_subhead_inline:
    'Workout tracking, personalized routines, and meal plans built around your preferences. Launching soon — free for newsletter subscribers.',
  cta_subhead_hero:
    'A coaching system that evolves with you. Personalized training, adaptive nutrition, progress tracking, and long-term accountability — all in one place. Launching soon, free for Just Get Fit newsletter subscribers.',
  cta_features: [
    {
      icon: '💪',
      title: 'Personalized training',
      desc: 'Custom plans built around your goals, equipment, and schedule.',
    },
    {
      icon: '🥗',
      title: 'Adaptive nutrition',
      desc: 'Meal plans that flex with your training days and food preferences.',
    },
    {
      icon: '📊',
      title: 'Progress tracking',
      desc: 'Workouts, photos, check-ins, and history — all in one place.',
    },
  ],
  cta_primary_url: '',
  cta_primary_label_inline: 'Coming soon',
  cta_primary_label_hero: 'Coming soon',
  cta_secondary_label_inline: 'Learn more',
  cta_secondary_href_inline: '/app',
  cta_secondary_label_hero: 'Subscribe to reserve your spot',
  cta_secondary_href_hero: '/subscribe',

  // App-launch toggle. Default is `false` — while in private beta, the
  // article-end AppCTA renders a non-clickable "Coming soon" pill in place
  // of any CMS-stored app link. Flip to `true` from /admin/pages/app once
  // the app at app.justgetfit.org is publicly live.
  app_live: false,

  // Optional YouTube embed at the very top of /app. Empty = hidden.
  hero_video_url: '',

  // Single-source-of-truth Markdown for the /app page body. Heading levels
  // (#, ##, ###), paragraphs, bullet lists (- or *), bold/italic, and
  // links all work. Nested bullets are flattened to a single level by the
  // renderer — the page only displays single-level lists by design.
  // Verbatim copy from the "JustGetFit App Features Overview" brief
  // (May 2026).
  page_markdown: `# JustGetFit App Features

Built to simplify fitness without sacrificing personalization, JustGetFit.org combines intelligent training, adaptive nutrition, progress tracking, and long-term accountability into one unified fitness platform. The app is designed to feel less like a generic tracker — and more like a personalized coaching system that evolves with you over time.

## Personalized Training Programs

Every user receives a fully customized training plan based on their goals, experience level, available equipment, schedule, injuries, and preferred training duration. Plans are structured around real-world sustainability — not one-size-fits-all templates.

### Training plan customization includes:

- Weight loss
- Muscle building
- Strength development
- Endurance improvement
- General fitness
- Maintenance goals
- Beginner to advanced experience levels
- Home gym, commercial gym, or limited-equipment setups
- Flexible training frequency and session durations

### Smart workout structure

Each workout session includes:

- Warm-up movements
- Main working sets
- Cooldowns and mobility work
- Exercise substitutions
- Coaching notes and technique guidance
- RPE/intensity recommendations
- Rest timing guidance
- Progressive workout structure over time

Users can also:

- Log completed workouts
- Track sets, reps, weight, and effort
- Add workout notes
- Edit historical workout entries later
- View completed workout history inside the tracker system

## Adaptive Meal Planning

JustGetFit includes fully personalized meal planning built around the user’s goals, dietary preferences, allergens, and daily training intent.

### Meal plan features

- Daily calorie targets
- Protein, carbohydrate, and fat targets
- Training-day vs rest-day nutrition adjustments
- Ingredient-level meal breakdowns
- Grocery list generation
- Flexible food preferences
- Include/exclude foods when updating plans
- Allergen-aware meal generation
- Adjustable nutrition visibility for users who prefer less emphasis on macro tracking

### Smart daily adjustments

Users can switch between:

- “I’m Training”
- “I’m Resting”

The app intelligently adjusts meal routing and daily recommendations while preserving overall weekly training structure and progression integrity.

## Fitness Tracker & Progress Monitoring

The tracker section gives users a centralized overview of their program progress, activity history, and consistency over time.

### Tracker capabilities

- Workout completion history
- Weekly progress overview
- Session completion counts
- Recent activity timeline
- Editable workout logs
- Program duration tracking
- Past program archives
- Historical progress comparisons

The tracker remains fully accessible even when a program is paused.

## Progress Photos

Users can upload and organize:

- Front photos
- Side photos
- Back photos

for both:

- Program starting points
- Program completion milestones

Photos are securely stored and tied directly to individual fitness programs, creating long-term visual progress tracking across multiple transformation cycles.

## Baseline & Weekly Check-Ins

The Baseline section preserves the user’s original onboarding information as a permanent reference point throughout the program lifecycle.

### Baseline tracking includes

- Weight
- Height
- Goal selection
- Fitness experience
- Lifestyle preferences
- Initial body metrics
- Starting photos

Users can also complete recurring weekly check-ins to monitor:

- Weight changes
- Energy levels
- Recovery
- Soreness
- General program adherence

## Pause & Resume Programs Anytime

JustGetFit was built around long-term sustainability — not unrealistic streak pressure.

Users can pause their program at any time without losing progress or disrupting their long-term timeline.

### Pause mode includes

- Frozen daily progression
- Frozen check-in schedules
- Preserved training structure
- Preserved nutrition structure
- Continued access to trackers and historical data
- Seamless resume functionality

When resumed, the program continues exactly where the user left off.

## Regenerate & Update Plans

Training and meal plans can evolve over time based on:

- Injuries
- Schedule changes
- Food preference updates
- New goals
- Lifestyle adjustments

Users can regenerate plans while preserving their broader program continuity and history. Previous plans are archived automatically for future reference.

## Multiple Navigation Experiences

The app supports several viewing modes depending on user preference.

### Users can choose between:

- Splash view (visual tile-based experience)
- Focused single-section pages
- All-in-one dashboard layout

This allows users to interact with the platform in the way that feels most comfortable to them.

## Mobile-Friendly Experience

The platform is designed to work seamlessly across:

- Desktop
- Tablets
- Mobile devices

Features include:

- Slide-out navigation drawer
- Mobile workout tracking
- Quick-access daily summaries
- Session switching
- Responsive layouts
- Simplified day-to-day interactions

## Smart Program Lifecycle Management

Programs intelligently track:

- Active status
- Paused status
- Completed status
- Archived history
- Program timelines
- Effective training duration

Completed programs are preserved inside a Past Programs archive so users can revisit previous transformations, plans, and progress photos.

## Subscription & Account Management

Users can manage:

- Profile settings
- Units (imperial/metric)
- Timezone preferences
- Display preferences
- Subscription status
- Account details
- Avatar uploads

Authentication is handled through secure magic-link login functionality.

## Designed Around Sustainability

JustGetFit was intentionally designed to avoid:

- Overwhelming interfaces
- Fitness-industry hype
- Unrealistic expectations
- Generic cookie-cutter plans

Instead, the platform focuses on:

- Long-term consistency
- Personalized structure
- Sustainable progression
- Adaptability
- Real-world usability
- Coach-style guidance

The experience is built to support users whether they’re just getting started or already deeply invested in their fitness journey.
`,
};

export const getHomeHero = () => getPage('home-hero', HOME_HERO_DEFAULT);
export const getAboutPage = () => getPage('about', ABOUT_DEFAULT);
export const getSubscribePage = () => getPage('subscribe', SUBSCRIBE_DEFAULT);
export const getContactPage = () => getPage('contact', CONTACT_DEFAULT);
export const getAppPage = () => getPage('app', APP_DEFAULT);

// -----------------------------------------------------
// NAV ITEMS
// -----------------------------------------------------
export async function getNavItems(
  location: 'main_nav' | 'footer_quick_links' | 'footer_categories'
): Promise<NavItem[]> {
  const { data, error } = await supabase
    .from('nav_items')
    .select('*')
    .eq('location', location)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data as NavItem[];
}

export const getMainNav = () => getNavItems('main_nav');
export const getFooterQuickLinks = () => getNavItems('footer_quick_links');
export const getFooterCategories = () => getNavItems('footer_categories');

// -----------------------------------------------------
// PARTNERS
// -----------------------------------------------------
export async function getPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error || !data) return [];
  return data as Partner[];
}

// -----------------------------------------------------
// CATEGORIES
// -----------------------------------------------------
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error || !data) return [];
  return data as Category[];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  return data as Category;
}

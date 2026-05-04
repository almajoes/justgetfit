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
  cta_eyebrow: 'New · The Just Get Fit App',
  cta_headline: 'Get personalized plans that adapt to you.',
  cta_subhead_inline:
    'Track workouts, follow personalized routines, and get meal plans built around your preferences. Free for newsletter subscribers.',
  cta_subhead_hero:
    'Track workouts, follow personalized routines, and get meal plans built around your goals and preferences. Free for Just Get Fit newsletter subscribers — the app uses your existing email to grant access automatically.',
  cta_features: [
    {
      icon: '📊',
      title: 'Fitness tracker',
      desc: 'Log workouts, track progress, and see your trends over time.',
    },
    {
      icon: '💪',
      title: 'Workout routines',
      desc: 'Personalized routines based on your goals and experience.',
    },
    {
      icon: '🥗',
      title: 'Meal plans',
      desc: 'Meal plans built around your preferences.',
    },
  ],
  cta_primary_url: 'https://app.justgetfit.org',
  cta_primary_label_inline: 'Try the app →',
  cta_primary_label_hero: 'Open the app →',
  cta_secondary_label_inline: 'Learn more',
  cta_secondary_href_inline: '/app',
  cta_secondary_label_hero: 'Not a subscriber yet? Join free',
  cta_secondary_href_hero: '/subscribe',

  how_it_works_eyebrow: 'How it works',
  how_it_works_heading: 'Three steps from inbox to action.',
  steps: [
    {
      title: 'Subscribe to the newsletter',
      desc: "The app uses your subscriber email to grant access. If you're already a subscriber, you're set — just sign in with the same email.",
      cta_label: 'Subscribe free →',
      cta_href: '/subscribe',
    },
    {
      title: 'Open the app',
      desc: "Visit app.justgetfit.org and sign in with the email you subscribed with. You'll be in immediately.",
    },
    {
      title: 'Tell it about you',
      desc: 'A short onboarding asks about your goals, current activity, and food preferences. Then it builds your plan.',
    },
  ],

  features_eyebrow: 'What you get',
  features_heading: 'Three tools, one app, zero cost.',
  features: [
    {
      icon: '📊',
      title: 'Fitness tracker',
      desc: "Log workouts as you do them. See trends in volume, frequency, and progress over weeks and months. Spot when you're plateauing before it costs you.",
    },
    {
      icon: '💪',
      title: 'Personalized workout routines',
      desc: 'Built around your goals (strength, hypertrophy, conditioning, mobility) and adjusted to your current level. The app generates routines you can actually follow, not generic templates.',
    },
    {
      icon: '🥗',
      title: 'Meal plans',
      desc: 'Meal suggestions based on your dietary preferences, restrictions, and goals. Skip the meal-planning paralysis — get options that fit how you actually eat.',
    },
  ],

  faq_eyebrow: 'FAQ',
  faq_heading: 'Quick answers.',
  faqs: [
    {
      q: 'Is it really free?',
      a: "Yes. If you're a confirmed Just Get Fit newsletter subscriber, you have full access to the app at no cost. No payment info required, no hidden tiers.",
    },
    {
      q: "What if I'm not a subscriber yet?",
      a: "No problem — [subscribe free](/subscribe) with the email you'd use for the app. Once you confirm, you can sign in.",
    },
    {
      q: 'Do I need to install anything?',
      a: 'No. The app runs in your browser at app.justgetfit.org. Works on phone, tablet, or desktop.',
    },
    {
      q: 'Can I use it without sharing my data?',
      a: "We only collect what's needed to personalize your plan (goals, preferences, workout logs). Read our [privacy policy](/privacy) for the full breakdown.",
    },
    {
      q: 'What if I want to delete my account?',
      a: "Email us via the [contact form](/contact) and we'll remove your account and all associated data.",
    },
  ],

  bottom_cta_heading: 'Ready to get started?',
  bottom_cta_subhead: "Open the app with the email you used to subscribe to the newsletter, or join the list first if you haven't already.",
  bottom_cta_primary_label: 'Open the app →',
  bottom_cta_primary_href: 'https://app.justgetfit.org',
  bottom_cta_secondary_label: 'Subscribe to the newsletter',
  bottom_cta_secondary_href: '/subscribe',
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

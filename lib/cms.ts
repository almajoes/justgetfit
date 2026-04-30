import { supabase } from './supabase';
import type {
  SiteSettings,
  FooterSettings,
  HomeHeroPage,
  AboutPage,
  SubscribePage,
  ContactPage,
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
export async function getPage<T>(slug: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('pages')
    .select('content')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.content as T;
}

const HOME_HERO_DEFAULT: HomeHeroPage = {
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

const ABOUT_DEFAULT: AboutPage = {
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

const SUBSCRIBE_DEFAULT: SubscribePage = {
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

const CONTACT_DEFAULT: ContactPage = {
  pill_text: 'Contact',
  headline_part1: 'Get in',
  headline_accent: 'touch',
  headline_part2: '.',
  intro: '',
  labels: { name: 'Your name', email: 'Email', subject: 'Subject', message: 'Message', submit: 'Send →' },
  placeholders: { name: '', email: '', subject: '', message: '' },
  success_message: 'Got it.',
};

export const getHomeHero = () => getPage('home-hero', HOME_HERO_DEFAULT);
export const getAboutPage = () => getPage('about', ABOUT_DEFAULT);
export const getSubscribePage = () => getPage('subscribe', SUBSCRIBE_DEFAULT);
export const getContactPage = () => getPage('contact', CONTACT_DEFAULT);

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

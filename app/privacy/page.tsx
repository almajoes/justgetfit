import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const revalidate = 3600; // 1 hour — content changes rarely

export const metadata = {
  title: 'Privacy Policy',
  description: 'How JustGetFit collects, uses, and protects your information.',
};

const LAST_UPDATED = 'May 2, 2026';

/**
 * Privacy Policy page
 *
 * Static React content rather than CMS-managed. The existing pages table is
 * purpose-built for typed home/about/subscribe/contact templates. Legal pages
 * change rarely enough that editing the .tsx and pushing is fine.
 *
 * To update content: edit this file directly, push, redeploy.
 *
 * Sections cover what's actually collected by JustGetFit:
 *   - Pageview analytics (cookie or fingerprint, depending on consent)
 *   - Email if subscribed (Resend)
 *   - Contact form submissions
 *   - Third parties: Resend, Supabase, Google AdSense, Google reCAPTCHA
 */
export default async function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 40 }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div className="legal-prose" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text)' }}>
          <p>
            JustGetFit (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the website at justgetfit.org.
            This page explains what information we collect, how we use it, and the choices you have.
          </p>

          <h2>Information we collect</h2>

          <h3>Analytics data</h3>
          <p>
            When you visit our site, we record pageview information to understand which
            content is useful and how readers find us. This includes:
          </p>
          <ul>
            <li>The page or article you viewed</li>
            <li>The referring website (e.g. a search engine or social link that brought you here)</li>
            <li>Approximate location (country only, derived from your IP address)</li>
            <li>Device type, browser, and operating system</li>
          </ul>
          <p>
            We do <strong>not</strong> store your raw IP address. With your consent (via the cookie
            banner shown on first visit), we set a small cookie containing a randomly-generated ID
            so we can recognize return visits. If you decline consent, we use a daily-rotating
            fingerprint (a one-way hash of your IP and user agent that changes each day) which
            allows us to count unique visitors within a day but does not let us track you across
            multiple days.
          </p>

          <h3>Newsletter subscriptions</h3>
          <p>
            If you sign up for our newsletter, we collect your email address and the date you
            subscribed. We use this only to send you the newsletter and related fitness content
            you opted into. You can unsubscribe at any time using the link at the bottom of any
            email. Unsubscribing immediately stops future emails.
          </p>

          <h3>Contact form</h3>
          <p>
            If you submit a message via our contact form, we collect your name, email, subject,
            and the message itself. We use this only to read and respond to your message. We
            don&apos;t add contact form submitters to any mailing list.
          </p>

          <h2>How we use your information</h2>
          <ul>
            <li>To deliver content (articles, newsletters) you&apos;ve requested</li>
            <li>To improve site quality and understand which content readers find useful</li>
            <li>To respond to questions you send via the contact form</li>
            <li>To detect and prevent spam and abuse</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal information. We do <strong>not</strong>{' '}
            share your email or contact form submissions with third parties for marketing purposes.
          </p>

          <h2>Cookies</h2>
          <p>We use a small number of cookies:</p>
          <ul>
            <li>
              <strong>_jgf_consent</strong> — records your choice from the cookie banner. 1-year
              lifetime.
            </li>
            <li>
              <strong>_jgf_vid</strong> — random visitor ID, set only if you accepted the cookie
              banner. Used to recognize return visits for analytics. 1-year lifetime. No personal
              information is encoded in this ID.
            </li>
            <li>
              <strong>_jgf_sid</strong> — session identifier used to group pageviews into
              browsing sessions. Expires when you close your browser or after 30 minutes of
              inactivity.
            </li>
          </ul>
          <p>
            You can clear these cookies at any time via your browser settings. Doing so will
            cause the consent banner to appear again on your next visit.
          </p>

          <h2>Third-party services</h2>
          <p>We use a small set of third-party services to operate the site:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — database hosting for our content, subscriber list, and
              analytics data.
            </li>
            <li>
              <strong>Resend</strong> — email delivery for the newsletter and transactional
              messages (confirmations, replies). Resend processes the email addresses we send
              to but does not use them for any other purpose.
            </li>
            <li>
              <strong>Vercel</strong> — hosting for the website itself. Vercel may collect
              limited request logs as part of standard web hosting operations.
            </li>
            <li>
              <strong>Google AdSense</strong> — displays advertisements on our site. AdSense
              uses cookies and similar technologies to serve ads. You can{' '}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
                manage your Google ad preferences
              </a>{' '}
              at any time.
            </li>
            <li>
              <strong>Google reCAPTCHA</strong> — used on the contact form to prevent spam
              submissions. reCAPTCHA collects information about your interaction with the page
              to determine if you&apos;re human; this is governed by{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                Google&apos;s Privacy Policy
              </a>
              .
            </li>
          </ul>

          <h2>Data retention</h2>
          <p>
            Raw pageview records are kept for 90 days, then automatically purged. Aggregated
            daily statistics (anonymous counts) are kept indefinitely for trend analysis.
            Newsletter subscribers are kept until you unsubscribe. Contact form submissions are
            kept until we resolve your inquiry, then archived for reference.
          </p>

          <h2>Your rights</h2>
          <p>You can at any time:</p>
          <ul>
            <li>
              <strong>Unsubscribe from the newsletter</strong> — click the unsubscribe link at
              the bottom of any email.
            </li>
            <li>
              <strong>Withdraw cookie consent</strong> — clear your cookies in your browser, then
              decline when the consent banner reappears.
            </li>
            <li>
              <strong>Request data deletion</strong> — email us using the contact form and we&apos;ll
              remove any personal data we hold about you.
            </li>
            <li>
              <strong>Request a copy of your data</strong> — same channel, we&apos;ll send back
              whatever&apos;s in our systems associated with you.
            </li>
          </ul>

          <h2>Children</h2>
          <p>
            JustGetFit is not directed at children under 13. We do not knowingly collect
            information from children under 13. If you believe a child has submitted information
            to us, please contact us and we&apos;ll delete it promptly.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We&apos;ll update this page if our practices change. The &quot;Last updated&quot; date at the
            top of the page reflects the most recent change. Material changes will be reflected
            in the change log here.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy? Use our{' '}
            <a href="/contact">contact form</a> and we&apos;ll get back to you.
          </p>
        </div>
      </main>
      <SiteFooter />

      {/* Inline styles scoped to legal pages — keeps headings/lists readable
          without polluting global CSS for one-off use. */}
      <style>{`
        .legal-prose h2 { font-size: 24px; font-weight: 700; margin-top: 40px; margin-bottom: 12px; letter-spacing: -0.01em; }
        .legal-prose h3 { font-size: 18px; font-weight: 700; margin-top: 28px; margin-bottom: 8px; }
        .legal-prose p { margin: 0 0 16px; }
        .legal-prose ul { margin: 0 0 16px; padding-left: 24px; }
        .legal-prose li { margin-bottom: 6px; }
        .legal-prose a { color: var(--neon); text-decoration: underline; }
      `}</style>
    </>
  );
}

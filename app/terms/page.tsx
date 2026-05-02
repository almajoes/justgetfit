import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const revalidate = 3600;

export const metadata = {
  title: 'Terms of Use',
  description: 'Terms and conditions for using JustGetFit.',
};

const LAST_UPDATED = 'May 2, 2026';

/**
 * Terms of Service page
 *
 * Static React content. To update: edit this file directly, push, redeploy.
 *
 * This is a reasonable starting ToS for a content + newsletter site with
 * affiliate/partner links and Google AdSense. NOT legal advice — you should
 * have a real lawyer review before relying on this for any serious dispute.
 *
 * Sections cover:
 *   - Acceptance of terms
 *   - Use of the site (acceptable use)
 *   - User content (contact form, newsletter)
 *   - Intellectual property (your articles)
 *   - Affiliate disclosure (you have partner links)
 *   - Health disclaimer (fitness content — not medical advice)
 *   - Disclaimers + liability limitations
 *   - Modifications and termination
 *   - Governing law
 */
export default async function TermsPage() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Terms of Use
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 40 }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div className="legal-prose" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text)' }}>
          <p>
            Welcome to JustGetFit. These Terms of Use (&quot;Terms&quot;) govern your use of
            justgetfit.org (the &quot;Site&quot;). By accessing or using the Site, you agree to
            these Terms. If you don&apos;t agree, please don&apos;t use the Site.
          </p>

          <h2>1. Use of the Site</h2>
          <p>
            You may read articles, browse content, subscribe to our newsletter, and contact us via
            the forms provided. You agree not to:
          </p>
          <ul>
            <li>Attempt to break, hack, or otherwise compromise the Site&apos;s security</li>
            <li>Use automated tools to scrape or harvest content beyond reasonable use</li>
            <li>Submit spam, abusive, or malicious content via any forms</li>
            <li>Use the Site in any way that violates applicable laws</li>
            <li>Impersonate any person or entity, or misrepresent your affiliation</li>
          </ul>

          <h2>2. Health and fitness content</h2>
          <p>
            <strong>JustGetFit publishes fitness, nutrition, and wellness content for
            informational and educational purposes only. The content is not medical advice.</strong>
          </p>
          <p>
            We are not doctors, dietitians, or licensed medical professionals. Before starting
            any new exercise program, diet, or supplement, consult with a qualified healthcare
            provider — especially if you have any pre-existing condition, are pregnant, or are
            taking medication. The information on this Site should not be used to diagnose or
            treat any health problem.
          </p>
          <p>
            You take full responsibility for any actions you take based on the content you read
            here. Results vary from person to person; nothing on this Site guarantees specific
            outcomes.
          </p>

          <h2>3. Affiliate disclosure</h2>
          <p>
            Some links on JustGetFit are affiliate links. If you click one and make a purchase,
            we may receive a commission at no additional cost to you. This helps support the
            Site. We only recommend products we genuinely believe in — affiliate compensation
            does not influence our editorial choices.
          </p>
          <p>
            JustGetFit is also a participant in third-party advertising programs (including
            Google AdSense), which display ads on the Site. We don&apos;t control which specific
            ads are shown — that&apos;s determined by the ad network.
          </p>

          <h2>4. Newsletter</h2>
          <p>
            By subscribing to our newsletter, you agree to receive periodic emails about
            fitness content, articles, and related topics. You can unsubscribe at any time using
            the link at the bottom of any email. Unsubscribing immediately stops future emails;
            it may take up to 24 hours for already-queued emails to fully stop.
          </p>

          <h2>5. Intellectual property</h2>
          <p>
            All content on JustGetFit — articles, images (where original or licensed),
            illustrations, logos, and branding — is owned by JustGetFit or its licensors and is
            protected by copyright and trademark law. You may:
          </p>
          <ul>
            <li>Read, browse, and view content for personal use</li>
            <li>Share article links with others</li>
            <li>Quote brief excerpts with proper attribution and a link back to the original</li>
          </ul>
          <p>You may not:</p>
          <ul>
            <li>Republish full articles on your own site without permission</li>
            <li>Use our content commercially without a license</li>
            <li>Remove or alter copyright notices, attribution, or branding</li>
            <li>Train AI/ML models on our content without explicit written permission</li>
          </ul>
          <p>
            For licensing or republication requests, contact us via the contact form.
          </p>

          <h2>6. User-submitted content</h2>
          <p>
            When you submit a message via the contact form, you grant us permission to read,
            store, and respond to it. We won&apos;t publish your contact form submission publicly
            without your explicit permission.
          </p>
          <p>
            You agree not to submit content that&apos;s illegal, defamatory, infringing, harassing,
            or abusive. We reserve the right to ignore and delete any submission that violates
            these terms.
          </p>

          <h2>7. Disclaimers</h2>
          <p>
            The Site is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind,
            either express or implied. We don&apos;t guarantee that:
          </p>
          <ul>
            <li>The Site will be available without interruption</li>
            <li>The content will be error-free or always up to date</li>
            <li>Any specific result will be achieved by following our content</li>
            <li>External links will continue to work or remain accurate</li>
          </ul>

          <h2>8. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, JustGetFit and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages
            arising from your use of (or inability to use) the Site, including but not limited
            to loss of profits, data, or goodwill — even if we&apos;ve been advised of the
            possibility of such damages.
          </p>
          <p>
            Some jurisdictions don&apos;t allow these limitations, so they may not apply to you.
          </p>

          <h2>9. External links</h2>
          <p>
            The Site contains links to third-party websites. We&apos;re not responsible for the
            content, privacy practices, or accuracy of any external site. Linking does not
            constitute an endorsement.
          </p>

          <h2>10. Modifications</h2>
          <p>
            We may update these Terms from time to time. The &quot;Last updated&quot; date at the top of
            the page reflects the most recent change. Continued use of the Site after changes
            means you accept the updated Terms.
          </p>

          <h2>11. Termination</h2>
          <p>
            We may, at our sole discretion, suspend or terminate access to the Site for users
            who violate these Terms. You may stop using the Site at any time.
          </p>

          <h2>12. Governing law</h2>
          <p>
            These Terms are governed by the laws of the United States and the state in which
            JustGetFit is operated. Any disputes shall be resolved in the courts of that
            jurisdiction.
          </p>

          <h2>13. Contact</h2>
          <p>
            Questions about these Terms? Use our{' '}
            <a href="/contact">contact form</a>.
          </p>
        </div>
      </main>
      <SiteFooter />

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

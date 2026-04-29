import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getSubscribePage } from '@/lib/cms';
import { SubscribeForm } from '@/components/SubscribeForm';

export const revalidate = 60;

export const metadata = {
  title: 'Subscribe',
  description: 'Get every Just Get Fit article in your inbox, every Monday.',
};

export default async function SubscribePageRoute({
  searchParams,
}: {
  searchParams: { confirmed?: string; status?: string };
}) {
  const page = await getSubscribePage();

  const successBanner =
    searchParams.confirmed === '1' ? (
      <div
        style={{
          background: 'rgba(196,255,61,0.12)',
          border: '1px solid rgba(196,255,61,0.3)',
          color: 'var(--neon)',
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Subscription confirmed — you're in. See you Monday.
      </div>
    ) : null;

  const unsubBanner =
    searchParams.status === 'unsubscribed' ? (
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--line-2)',
          color: 'var(--text-2)',
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
          fontSize: 14,
        }}
      >
        You've been unsubscribed. Sorry to see you go.
      </div>
    ) : null;

  return (
    <>
      <SiteNav />

      <section className="subscribe-page">
        {successBanner}
        {unsubBanner}

        <div className="hero-pill" style={{ marginBottom: 24 }}>
          <span className="dot" />
          {page.pill_text}
        </div>
        <h1 className="about-h1" style={{ marginBottom: 20 }}>
          {page.headline_part1}
          <br />
          <span className="accent">{page.headline_accent}</span>
          {page.headline_part2}
        </h1>
        <p style={{ fontSize: 19, color: 'var(--text-2)', marginBottom: 40, maxWidth: 600, lineHeight: 1.55 }}>
          {page.lede}
        </p>

        <SubscribeForm placeholder={page.form_placeholder} buttonLabel={page.form_button} source="subscribe-page" />

        <div style={{ marginTop: 56 }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.01em' }}>
            {page.promise_heading}
          </h3>
          <div className="promise-grid">
            {page.promises.map((p, i) => (
              <div className="promise-item" key={i}>
                <div className="promise-icon">{p.icon}</div>
                <div className="promise-title">{p.title}</div>
                <div className="promise-desc">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="subscribe-faq">
          <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>
            {page.faq_heading}
          </h3>
          {page.faqs.map((f, i) => (
            <details className="faq-item" key={i}>
              <summary>{f.q}</summary>
              <div className="faq-answer">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.a}</ReactMarkdown>
              </div>
            </details>
          ))}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { ContactForm } from '@/components/ContactForm';
import { getContactPage } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Just Get Fit.',
};

export default async function ContactPageRoute() {
  const page = await getContactPage();
  return (
    <>
      <SiteNav />

      <section className="contact-page">
        <div className="hero-pill" style={{ marginBottom: 24 }}>
          <span className="dot" />
          {page.pill_text}
        </div>
        <h1 className="about-h1" style={{ marginBottom: 16 }}>
          {page.headline_part1} <span className="accent">{page.headline_accent}</span>
          {page.headline_part2}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 600 }}>{page.intro}</p>

        <ContactForm
          labels={page.labels}
          placeholders={page.placeholders}
          successMessage={page.success_message}
        />
      </section>

      <SiteFooter />
    </>
  );
}

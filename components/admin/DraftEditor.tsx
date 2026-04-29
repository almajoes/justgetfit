'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Draft, Category } from '@/lib/supabase';

type Mode = 'edit' | 'preview';

export function DraftEditor({ draft, categories }: { draft: Draft; categories: Category[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [sendNewsletter, setSendNewsletter] = useState(true);

  const [title, setTitle] = useState(draft.title);
  const [slug, setSlug] = useState(draft.slug);
  const [excerpt, setExcerpt] = useState(draft.excerpt ?? '');
  const [category, setCategory] = useState(draft.category ?? '');
  const [content, setContent] = useState(draft.content);
  const [coverUrl, setCoverUrl] = useState(draft.cover_image_url ?? '');
  const [coverCredit, setCoverCredit] = useState(draft.cover_image_credit ?? '');

  // Unsplash picker state
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoOptions, setPhotoOptions] = useState<{ url: string; credit: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const isReadOnly = draft.status !== 'pending';

  async function searchPhotos() {
    if (!photoQuery.trim()) return;
    setPhotoBusy(true);
    try {
      const res = await fetch(`/api/admin/unsplash?q=${encodeURIComponent(photoQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setPhotoOptions(data.photos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function call(action: 'save' | 'publish' | 'reject') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, title, slug, excerpt, category, content,
          cover_image_url: coverUrl || null,
          cover_image_credit: coverCredit || null,
          send_newsletter: action === 'publish' ? sendNewsletter : false,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      if (action === 'publish' && data.postSlug) {
        if (data.newsletter && data.newsletter.recipient_count > 0) {
          alert(`Published. Newsletter sent to ${data.newsletter.recipient_count} subscribers (${data.newsletter.failed_count} failed).`);
        }
        router.push(`/articles/${data.postSlug}`);
        return;
      }
      if (action === 'reject') {
        router.push('/admin/drafts');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
            Status: <span style={{ color: 'var(--neon)' }}>{draft.status}</span> · Generated{' '}
            {new Date(draft.created_at).toLocaleString()}
          </p>
          <h1 className="text-3xl font-bold">Review draft</h1>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ border: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="px-4 py-2 rounded text-xs uppercase tracking-wider font-semibold transition-colors"
            style={{
              background: mode === 'edit' ? 'var(--neon)' : 'transparent',
              color: mode === 'edit' ? '#000' : 'var(--text)',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className="px-4 py-2 rounded text-xs uppercase tracking-wider font-semibold transition-colors"
            style={{
              background: mode === 'preview' ? 'var(--neon)' : 'transparent',
              color: mode === 'preview' ? '#000' : 'var(--text)',
            }}
          >
            Preview
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'rgb(252,165,165)',
          }}
        >
          {error}
        </div>
      )}

      {mode === 'edit' ? (
        <div className="space-y-5">
          <div>
            <label className="label">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isReadOnly} className="input text-lg font-semibold" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Slug (URL)</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isReadOnly} className="input font-mono" />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={isReadOnly} className="input">
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Excerpt</label>
            <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} disabled={isReadOnly} rows={2} className="input resize-y" />
          </div>

          {/* COVER IMAGE */}
          <div
            className="p-5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}
          >
            <label className="label">Cover image</label>
            {coverUrl && (
              <div className="mb-3 relative rounded-lg overflow-hidden" style={{ aspectRatio: '21/9' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} disabled={isReadOnly} className="input mb-2 font-mono" placeholder="https://..." />
            <input value={coverCredit} onChange={(e) => setCoverCredit(e.target.value)} disabled={isReadOnly} className="input mb-3" placeholder="Photo credit (e.g. Photo by ... on Unsplash)" />
            {!isReadOnly && (
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>
                  Search Unsplash for a different photo:
                </p>
                <div className="flex gap-2 mb-3">
                  <input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} placeholder="e.g. barbell deadlift" className="input flex-1" />
                  <button type="button" onClick={searchPhotos} disabled={photoBusy} className="btn btn-ghost shrink-0">
                    {photoBusy ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {photoOptions.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {photoOptions.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => {
                          setCoverUrl(p.url);
                          setCoverCredit(p.credit);
                        }}
                        className="aspect-video rounded-lg overflow-hidden border-2 transition-colors hover:border-[var(--neon)]"
                        style={{ borderColor: coverUrl === p.url ? 'var(--neon)' : 'transparent' }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">Content (Markdown)</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} disabled={isReadOnly} rows={28} className="input font-mono resize-y" spellCheck />
          </div>
        </div>
      ) : (
        <div
          className="p-8 rounded-2xl"
          style={{ background: 'var(--bg-1)', border: '1px solid var(--line)' }}
        >
          {coverUrl && (
            <div className="mb-8 rounded-xl overflow-hidden" style={{ aspectRatio: '21/9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-3 mb-4 text-xs flex-wrap" style={{ color: 'var(--text-3)' }}>
            {category && <span style={{ color: 'var(--neon)' }}>{category}</span>}
            <span>Preview</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-5" style={{ letterSpacing: '-0.025em' }}>
            {title}
          </h1>
          {excerpt && <p className="text-xl mb-8" style={{ color: 'var(--text-2)' }}>{excerpt}</p>}
          <div className="prose-article max-w-2xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <div
          className="mt-10 flex flex-wrap gap-3 sticky bottom-4 p-4 rounded-xl backdrop-blur-md"
          style={{ background: 'rgba(10,10,13,0.85)', border: '1px solid var(--line-2)' }}
        >
          <button type="button" onClick={() => call('publish')} disabled={busy !== null} className="btn btn-primary">
            {busy === 'publish' ? 'Publishing…' : 'Publish post →'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', padding: '0 12px' }}>
            <input type="checkbox" checked={sendNewsletter} onChange={(e) => setSendNewsletter(e.target.checked)} />
            Send to subscribers on publish
          </label>
          <button type="button" onClick={() => call('save')} disabled={busy !== null} className="btn btn-ghost">
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={() => call('reject')} disabled={busy !== null} className="btn btn-danger">
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

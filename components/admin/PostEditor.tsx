'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Post, Category, Author } from '@/lib/supabase';
import { ResendPanel } from './ResendPanel';
import type { Subscriber } from './AudiencePicker';

/**
 * Convert an ISO timestamp (UTC, e.g. "2026-04-29T13:00:00Z") to the format
 * that <input type="datetime-local"> expects: "YYYY-MM-DDTHH:mm" in LOCAL time.
 * The browser displays whatever we feed it as local time, so we have to
 * actually convert UTC → local before formatting.
 */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert the datetime-local string back to a full ISO string (UTC).
 * Returns null if input is empty/invalid.
 */
function fromDatetimeLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local); // browser parses as local time
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PostEditor({
  post,
  categories,
  subscribers,
  authors,
}: {
  post: Post;
  categories: Category[];
  subscribers: Subscriber[];
  authors: Author[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'save' | 'delete' | 'citations'>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // Citations state. We track the current sources locally so the UI
  // updates after a successful citation run without requiring a full
  // page refresh. Initialized from the post row.
  const [sources, setSources] = useState(post.sources ?? null);
  const [citationsMessage, setCitationsMessage] = useState<string | null>(null);

  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? '');
  const [category, setCategory] = useState(post.category ?? '');
  const [content, setContent] = useState(post.content);
  const [coverUrl, setCoverUrl] = useState(post.cover_image_url ?? '');
  const [coverCredit, setCoverCredit] = useState(post.cover_image_credit ?? '');
  // Byline author. Read from the Post row; can be reassigned here for
  // published articles. Same dropdown contract as DraftEditor.
  const [authorId, setAuthorId] = useState<string | null>(post.author_id ?? null);
  const activeAuthors = useMemo(() => authors.filter((a) => a.is_active), [authors]);
  // Published date in datetime-local format (local time, no timezone) — YYYY-MM-DDTHH:mm
  const [publishedAt, setPublishedAt] = useState(toDatetimeLocal(post.published_at));
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoOptions, setPhotoOptions] = useState<{ url: string; credit: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function searchPhotos() {
    if (!photoQuery.trim()) return;
    setPhotoBusy(true);
    try {
      const res = await fetch(`/api/admin/unsplash?q=${encodeURIComponent(photoQuery)}`);
      const data = await res.json();
      setPhotoOptions(data.photos ?? []);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          title, slug, excerpt, category, content,
          cover_image_url: coverUrl || null,
          cover_image_credit: coverCredit || null,
          author_id: authorId,
          published_at: fromDatetimeLocal(publishedAt),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    if (!confirm(`Delete "${post.title}" permanently? This cannot be undone.`)) return;
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      router.push('/admin/posts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(null);
    }
  }

  /**
   * Add citations to this post. Calls /api/admin/posts/[id]/citations
   * which uses Claude + web_search to find real sources for factual
   * claims, verifies each URL returns 200 and the page title roughly
   * matches, then stores [N] markers in the body and the source list.
   *
   * If the post already has sources, the user is prompted whether to
   * overwrite (force=1) or skip.
   *
   * The endpoint takes 30-90 seconds. The button shows a "Working…"
   * state for that duration. On success, we update local state and
   * trigger router.refresh() so the article body reloads with the new
   * markers and the count display updates.
   */
  async function runCitations() {
    const hasExisting = Array.isArray(sources) && sources.length > 0;
    if (hasExisting) {
      const confirmed = confirm(
        `This post already has ${sources!.length} sources. Overwrite with a fresh citation pass? (Costs ~$0.20-0.30 in API spend.)`
      );
      if (!confirmed) return;
    } else {
      const confirmed = confirm(
        'Run citation generation for this post? This will use Claude with web search to add inline [N] markers and a sources list. Takes 30-90 seconds and costs ~$0.20-0.30 in API spend.'
      );
      if (!confirmed) return;
    }

    setBusy('citations');
    setError(null);
    setCitationsMessage(null);
    try {
      const url = hasExisting
        ? `/api/admin/posts/${post.id}/citations?force=1`
        : `/api/admin/posts/${post.id}/citations`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Possible outcomes:
      //   skipped: post already had sources and we didn't pass force
      //     (shouldn't hit since we always pass force when overwriting)
      //   ok with verified=0: ran successfully but found no usable sources
      //   ok with verified>0: success
      if (data.skipped) {
        setCitationsMessage(`Skipped: ${data.reason}`);
      } else if (data.stats?.verified === 0) {
        setCitationsMessage(
          `Ran in ${(data.elapsedMs / 1000).toFixed(1)}s. No usable sources found (proposed ${data.stats.proposed}, all rejected by URL/title verification). Article unchanged.`
        );
        setSources([]);
      } else {
        setCitationsMessage(
          `Added ${data.stats.verified} citations in ${(data.elapsedMs / 1000).toFixed(1)}s (proposed ${data.stats.proposed}, ${data.stats.rejected} rejected by verification).`
        );
        setSources(data.sources);
        // Refresh from server so the content textarea reflects the new
        // body with [N] markers inserted.
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Citations failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
            Published {new Date(post.published_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold">Edit post</h1>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ border: '1px solid var(--line)' }}>
          <button onClick={() => setMode('edit')} className="px-4 py-2 rounded text-xs uppercase tracking-wider font-semibold" style={{ background: mode === 'edit' ? 'var(--neon)' : 'transparent', color: mode === 'edit' ? '#000' : 'var(--text)' }}>Edit</button>
          <button onClick={() => setMode('preview')} className="px-4 py-2 rounded text-xs uppercase tracking-wider font-semibold" style={{ background: mode === 'preview' ? 'var(--neon)' : 'transparent', color: mode === 'preview' ? '#000' : 'var(--text)' }}>Preview</button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'rgb(252,165,165)' }}>
          {error}
        </div>
      )}

      {mode === 'edit' ? (
        <div className="space-y-5">
          <div>
            <label className="label">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-lg font-semibold" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Slug (URL)</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input font-mono" />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
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
            <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} className="input resize-y" />
          </div>
          {/* Byline author — same contract as DraftEditor. Set on publish
              from the round-robin rotation; can be reassigned here. */}
          <div>
            <label className="label">
              Author
              {activeAuthors.length === 0 && (
                <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  No active authors — set up some at <code>/admin/authors</code>
                </span>
              )}
            </label>
            <select
              value={authorId ?? ''}
              onChange={(e) => setAuthorId(e.target.value || null)}
              className="input"
            >
              <option value="">— Just Get Fit Editorial (no byline author) —</option>
              {activeAuthors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {authorId && !activeAuthors.find((a) => a.id === authorId) && (() => {
                const inactive = authors.find((a) => a.id === authorId);
                return inactive ? (
                  <option key={inactive.id} value={inactive.id}>
                    {inactive.name} (inactive)
                  </option>
                ) : null;
              })()}
            </select>
          </div>
          <div>
            <label className="label">Published date</label>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="datetime-local"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="input"
                style={{ maxWidth: 280 }}
              />
              <button
                type="button"
                onClick={() => setPublishedAt(toDatetimeLocal(post.published_at))}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setPublishedAt(toDatetimeLocal(new Date().toISOString()))}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Set to now
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              Controls the displayed date on the article and its position in the archive. Stored as UTC; shown in your local time here.
            </p>
          </div>
          <div className="p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
            <label className="label">Cover image</label>
            {coverUrl && (
              <div className="mb-3 relative rounded-lg overflow-hidden" style={{ aspectRatio: '21/9' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} className="input mb-2 font-mono" placeholder="https://..." />
            <input value={coverCredit} onChange={(e) => setCoverCredit(e.target.value)} className="input mb-3" placeholder="Photo credit" />
            <div className="flex gap-2 mb-3">
              <input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} placeholder="Search Unsplash..." className="input flex-1" />
              <button type="button" onClick={searchPhotos} disabled={photoBusy} className="btn btn-ghost shrink-0">
                {photoBusy ? 'Searching…' : 'Search'}
              </button>
            </div>
            {photoOptions.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoOptions.map((p) => (
                  <button key={p.url} type="button" onClick={() => { setCoverUrl(p.url); setCoverCredit(p.credit); }} className="aspect-video rounded-lg overflow-hidden border-2 transition-colors" style={{ borderColor: coverUrl === p.url ? 'var(--neon)' : 'transparent' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="label">Content (Markdown)</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={28} className="input font-mono resize-y" spellCheck />
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
          {coverUrl && (
            <div className="mb-8 rounded-xl overflow-hidden" style={{ aspectRatio: '21/9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-5" style={{ letterSpacing: '-0.025em' }}>{title}</h1>
          {excerpt && <p className="text-xl mb-8" style={{ color: 'var(--text-2)' }}>{excerpt}</p>}
          <div className="prose-article max-w-2xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}

      <div className="mt-10">
        <ResendPanel
          postId={post.id}
          postTitle={post.title}
          subscribers={subscribers}
          buttonLabel="Send to subscribers →"
          intro="Send this article to subscribers on the fly — useful for ad-hoc requests, fulfilling one-off shares, or warm-up sends to specific groups."
        />
      </div>

      {/* Citations status — surfaces what's stored on posts.sources and
          a single button to run / re-run the citation pipeline. Hidden
          while editing if the user is in the middle of saving. */}
      <div
        className="mt-2 p-4 rounded-xl"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--line)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neon)' }}>
                Citations
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {!sources
                  ? 'Never run'
                  : sources.length === 0
                  ? 'Ran — no usable sources found'
                  : `${sources.length} verified ${sources.length === 1 ? 'source' : 'sources'}`}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Adds inline [N] markers to the body and a verified Sources list. Uses Claude + web search; takes 30-90s and costs ~$0.20-0.30 per article.
            </p>
            {citationsMessage && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-2)',
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(196,255,61,0.06)',
                  borderRadius: 6,
                  borderLeft: '2px solid var(--neon)',
                }}
              >
                {citationsMessage}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={runCitations}
            disabled={busy !== null}
            className="btn btn-ghost"
            style={{ flexShrink: 0 }}
          >
            {busy === 'citations'
              ? 'Working… (30-90s)'
              : sources && sources.length > 0
              ? 'Re-run citations'
              : 'Add citations'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 sticky bottom-4 p-4 rounded-xl backdrop-blur-md admin-sticky-savebar" style={{ background: 'rgba(10,10,13,0.85)', border: '1px solid var(--line-2)' }}>
        <button onClick={save} disabled={busy !== null} className="btn btn-primary">
          {busy === 'save' ? 'Saving…' : 'Save changes'}
        </button>
        <a href={post.category ? `/articles/${post.category}/${post.slug}` : `/articles`} target="_blank" rel="noreferrer" className="btn btn-ghost">View live →</a>
        <button onClick={del} disabled={busy !== null} className="btn btn-danger ml-auto">
          {busy === 'delete' ? 'Deleting…' : 'Delete post'}
        </button>
      </div>
    </div>
  );
}

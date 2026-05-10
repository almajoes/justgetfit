'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Post, Source, RejectedSource } from '@/lib/supabase';

/**
 * <SourcesClient />
 *
 * Four tabs:
 *   - By article: posts with citations, expand to see their sources
 *   - By source URL: every unique URL grouped, shows which posts cite it
 *   - Uncited: posts that haven't run citations yet (sources=null) or
 *     ran and got nothing (sources=[])
 *   - Rejected: sources Claude proposed that failed verification, shown
 *     with reason. Admin can approve (move to sources, no inline marker)
 *     or discard.
 *
 * Plus a "Check links" action that re-verifies every URL by hitting the
 * server endpoint /api/admin/sources/check-links. The endpoint returns
 * a status per URL (200, 404, etc.) and we visualize the result inline.
 */

type PostRow = Pick<Post, 'id' | 'slug' | 'title' | 'category' | 'published_at' | 'sources' | 'rejected_sources'>;

type Tab = 'by-article' | 'by-source' | 'uncited' | 'rejected';

type LinkCheck = { url: string; ok: boolean; status: number | null; reason: string | null };
type LinkCheckMap = Map<string, LinkCheck>;

export function SourcesClient({
  posts: initialPosts,
  stats,
}: {
  posts: PostRow[];
  stats: {
    total: number;
    withCitations: number;
    ranButEmpty: number;
    neverRun: number;
    totalSources: number;
    totalRejected: number;
  };
}) {
  // We hold posts in local state so approve/discard can mutate the
  // rejected list without a full page round-trip. After mutations we
  // also call router.refresh() to re-pull canonical state.
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [tab, setTab] = useState<Tab>('by-article');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [linkChecks, setLinkChecks] = useState<LinkCheckMap>(new Map());
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // Track which (postId, url) pair is currently being approved/discarded
  // so we can disable buttons while a request is in flight.
  const [actingOn, setActingOn] = useState<string | null>(null);
  // Bulk backfill state. Runs the citation pipeline on every uncited
  // post in sequence. Each post takes ~50-90s, so backfilling 50 posts
  // is a 40-75 minute commitment. The admin needs to leave the tab
  // open. Closing it stops the loop; reopening + clicking backfill
  // resumes from wherever it left off (uncited posts only).
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({
    done: 0,
    total: 0,
    currentTitle: '',
    succeeded: 0,
    skipped: 0,
    failed: 0,
  });

  // ── Derived data ──
  // postsWithCitations: just posts that have at least one source.
  const postsWithCitations = useMemo(
    () => posts.filter((p) => Array.isArray(p.sources) && p.sources.length > 0),
    [posts]
  );

  // uncitedPosts: never run + ran-but-empty, sorted with never-run first
  // (those are the actionable ones to backfill).
  const uncitedPosts = useMemo(() => {
    const neverRun = posts.filter((p) => p.sources === null || p.sources === undefined);
    const empty = posts.filter((p) => Array.isArray(p.sources) && p.sources.length === 0);
    return { neverRun, empty };
  }, [posts]);

  // bySourceURL: map of URL -> { source, posts[] } so we can show the
  // cross-reference of "which articles cite this URL". A URL appearing
  // in 3 posts shows up once with all 3 articles listed.
  const bySource = useMemo(() => {
    const map = new Map<string, { source: Source; posts: PostRow[] }>();
    for (const post of postsWithCitations) {
      for (const s of (post.sources ?? []) as Source[]) {
        const existing = map.get(s.url);
        if (existing) {
          existing.posts.push(post);
        } else {
          // Use the first occurrence's source metadata. Different
          // articles may have slightly different titles/quotes for the
          // same URL; we just show whichever comes first.
          map.set(s.url, { source: s, posts: [post] });
        }
      }
    }
    // Sort by domain alphabetically for grouping consistency.
    return Array.from(map.values()).sort((a, b) => {
      try {
        return new URL(a.source.url).hostname.localeCompare(new URL(b.source.url).hostname);
      } catch {
        return 0;
      }
    });
  }, [postsWithCitations]);

  // postsWithRejected: posts that have at least one rejected source.
  const postsWithRejected = useMemo(
    () => posts.filter((p) => Array.isArray(p.rejected_sources) && p.rejected_sources.length > 0),
    [posts]
  );

  // ── Approve / discard handlers for rejected sources ──
  // Both endpoints take {url} and the postId in the path. After success
  // we update local state immediately for snappy UX; router.refresh()
  // would trigger a full server re-fetch but that's slow.
  async function approveRejected(postId: string, url: string) {
    const key = `${postId}|${url}`;
    setActingOn(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${postId}/sources/approve-rejected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Optimistic local update: move the rejected entry from
      // rejected_sources into sources on the matching post.
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const rejected = (p.rejected_sources ?? []) as RejectedSource[];
          const sources = (p.sources ?? []) as Source[];
          const idx = rejected.findIndex((r) => r.url === url);
          if (idx < 0) return p;
          const moved = rejected[idx];
          const nextN = sources.reduce((max, s) => Math.max(max, s.n), 0) + 1;
          return {
            ...p,
            sources: [
              ...sources,
              {
                n: nextN,
                title: moved.title,
                url: moved.url,
                publication: moved.publication,
                quote: moved.quote,
                accessed_at: new Date().toISOString(),
              },
            ],
            rejected_sources: rejected.filter((_, i) => i !== idx),
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActingOn(null);
    }
  }

  async function discardRejected(postId: string, url: string) {
    const key = `${postId}|${url}`;
    setActingOn(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${postId}/sources/discard-rejected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const rejected = (p.rejected_sources ?? []) as RejectedSource[];
          return {
            ...p,
            rejected_sources: rejected.filter((r) => r.url !== url),
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discard failed');
    } finally {
      setActingOn(null);
    }
  }

  // ── Check all links ──
  // Calls our server endpoint with a list of URLs, gets back status per
  // URL. We send one batch request rather than N parallel fetches so the
  // server can rate-limit and dedupe internally.
  async function checkAllLinks() {
    const allUrls = Array.from(new Set(bySource.map((g) => g.source.url)));
    if (allUrls.length === 0) return;

    setChecking(true);
    setError(null);
    setCheckProgress({ done: 0, total: allUrls.length });

    // Process in chunks of 10 so we can stream progress updates as we go
    // (and keep individual requests under the API timeout).
    const CHUNK = 10;
    const merged: LinkCheckMap = new Map();
    try {
      for (let i = 0; i < allUrls.length; i += CHUNK) {
        const chunk = allUrls.slice(i, i + CHUNK);
        const res = await fetch('/api/admin/sources/check-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: chunk }),
        });
        if (!res.ok) {
          throw new Error(`Check failed at chunk ${i / CHUNK + 1}: HTTP ${res.status}`);
        }
        const data = (await res.json()) as { results: LinkCheck[] };
        for (const r of data.results) {
          merged.set(r.url, r);
        }
        setLinkChecks(new Map(merged)); // show progress as we go
        setCheckProgress({ done: Math.min(i + CHUNK, allUrls.length), total: allUrls.length });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link check failed');
    } finally {
      setChecking(false);
    }
  }

  // ── Bulk backfill ──
  // Run the citation pipeline on every uncited post sequentially. Calls
  // the existing per-post endpoint (/api/admin/posts/[id]/citations) for
  // each post, waits for it to finish, then moves to the next. Each
  // call updates the post's sources/rejected_sources independently — if
  // we crash mid-loop, completed posts are saved and re-running the
  // backfill picks up where we left off (already-cited posts get
  // skipped by the endpoint's default skip-if-cited check).
  //
  // Why client-loop and not a server background job: each post takes
  // 50-90s of API time. Backfilling 50 posts = ~50 minutes total, well
  // past Vercel's 300s function limit. A client loop is the simplest
  // architecture that handles a multi-hour task without infrastructure.
  async function backfillAllUncited() {
    // Recompute the set fresh from current state — the user may have
    // already-cited some posts in the time the page has been open.
    const targets = posts.filter((p) => p.sources === null || p.sources === undefined);
    if (targets.length === 0) {
      setError('No uncited posts. Everything has citations attempted.');
      return;
    }

    const estCostLow = (targets.length * 0.2).toFixed(2);
    const estCostHigh = (targets.length * 0.3).toFixed(2);
    const estTimeMin = Math.ceil((targets.length * 60) / 60); // assume ~60s/post avg
    const confirmed = confirm(
      `Add citations to ${targets.length} uncited post${targets.length === 1 ? '' : 's'}?\n\n` +
        `• Estimated cost: $${estCostLow}–$${estCostHigh} in API spend\n` +
        `• Estimated time: ~${estTimeMin} minute${estTimeMin === 1 ? '' : 's'} (sequential, one at a time)\n\n` +
        `IMPORTANT: keep this tab open. Closing it stops the run (already-completed posts are saved). You can reopen and re-click to resume — already-cited posts get skipped.`
    );
    if (!confirmed) return;

    setBackfilling(true);
    setError(null);
    setBackfillProgress({
      done: 0,
      total: targets.length,
      currentTitle: '',
      succeeded: 0,
      skipped: 0,
      failed: 0,
    });

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const post = targets[i];
      setBackfillProgress({
        done: i,
        total: targets.length,
        currentTitle: post.title,
        succeeded,
        skipped,
        failed,
      });

      try {
        const res = await fetch(`/api/admin/posts/${post.id}/citations`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok) {
          console.error(`[backfill] Post "${post.title}" failed: ${data.error || res.status}`);
          failed++;
        } else if (data.skipped) {
          skipped++;
        } else {
          succeeded++;
          // Update local state for this post so the UI reflects the new
          // sources count without a page refresh.
          setPosts((prev) =>
            prev.map((p) =>
              p.id === post.id
                ? { ...p, sources: data.sources, rejected_sources: data.rejectedSources }
                : p
            )
          );
        }
      } catch (err) {
        console.error(`[backfill] Post "${post.title}" threw:`, err);
        failed++;
      }

      // Brief pause between posts to be nice to the API and let the UI
      // breathe. Small enough to be invisible, large enough to avoid
      // hammering.
      await new Promise((r) => setTimeout(r, 500));
    }

    setBackfillProgress({
      done: targets.length,
      total: targets.length,
      currentTitle: '',
      succeeded,
      skipped,
      failed,
    });
    setBackfilling(false);
    // Pull canonical state after all the local updates so anything
    // we missed (e.g. a stat) refreshes properly.
    router.refresh();
  }

  // ── Render ──
  return (
    <div>
      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24,
          padding: 16,
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 12,
        }}
      >
        <Stat label="Posts" value={stats.total} />
        <Stat label="With citations" value={stats.withCitations} accent />
        <Stat label="Ran, no sources" value={stats.ranButEmpty} />
        <Stat label="Never run" value={stats.neverRun} />
        <Stat label="Total sources" value={stats.totalSources} accent />
        <Stat label="Rejected" value={stats.totalRejected} />
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(255,107,107,0.08)',
            border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: '#ff9c9c',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Tabs + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <TabButton active={tab === 'by-article'} onClick={() => setTab('by-article')}>
          By article ({postsWithCitations.length})
        </TabButton>
        <TabButton active={tab === 'by-source'} onClick={() => setTab('by-source')}>
          By source ({bySource.length})
        </TabButton>
        <TabButton active={tab === 'uncited'} onClick={() => setTab('uncited')}>
          Uncited ({uncitedPosts.neverRun.length + uncitedPosts.empty.length})
        </TabButton>
        <TabButton active={tab === 'rejected'} onClick={() => setTab('rejected')}>
          Rejected ({stats.totalRejected})
        </TabButton>
        <div style={{ flex: 1 }} />
        <button
          onClick={backfillAllUncited}
          disabled={backfilling || checking || uncitedPosts.neverRun.length === 0}
          className="btn btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {backfilling
            ? `Citing ${backfillProgress.done}/${backfillProgress.total}…`
            : `Add citations to ${uncitedPosts.neverRun.length} post${uncitedPosts.neverRun.length === 1 ? '' : 's'}`}
        </button>
        <button
          onClick={checkAllLinks}
          disabled={checking || backfilling || bySource.length === 0}
          className="btn btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {checking
            ? `Checking ${checkProgress.done}/${checkProgress.total}…`
            : `Check ${bySource.length} unique link${bySource.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {/* Live backfill progress banner. Stays sticky at the top of the
          content while the loop runs so the admin can monitor progress
          across tab switches. Disappears when the run finishes. */}
      {backfilling && (
        <div
          style={{
            background: 'rgba(196,255,61,0.06)',
            border: '1px solid var(--neon)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neon)' }}>
              Adding citations
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {backfillProgress.done} of {backfillProgress.total} posts processed
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ({backfillProgress.succeeded} succeeded, {backfillProgress.skipped} skipped, {backfillProgress.failed} failed)
            </span>
          </div>
          {backfillProgress.currentTitle && (
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
              Now: {backfillProgress.currentTitle}
            </div>
          )}
          {/* Progress bar */}
          <div
            style={{
              height: 6,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 100,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${backfillProgress.total === 0 ? 0 : (backfillProgress.done / backfillProgress.total) * 100}%`,
                background: 'var(--neon)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Keep this tab open. Closing it stops the loop. Already-completed posts are saved.
          </div>
        </div>
      )}

      {/* Backfill complete summary. Shown briefly after a finished run.
          Auto-clears when admin starts another action. */}
      {!backfilling && backfillProgress.total > 0 && backfillProgress.done === backfillProgress.total && (
        <div
          style={{
            background: 'rgba(196,255,61,0.04)',
            border: '1px solid rgba(196,255,61,0.4)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--text-2)',
          }}
        >
          <strong style={{ color: 'var(--neon)' }}>Done.</strong>{' '}
          Processed {backfillProgress.total} post{backfillProgress.total === 1 ? '' : 's'}:{' '}
          {backfillProgress.succeeded} succeeded, {backfillProgress.skipped} skipped, {backfillProgress.failed} failed.
        </div>
      )}

      {tab === 'by-article' && (
        <ByArticleView
          posts={postsWithCitations}
          expandedPostId={expandedPostId}
          onToggle={(id) => setExpandedPostId(expandedPostId === id ? null : id)}
          linkChecks={linkChecks}
        />
      )}
      {tab === 'by-source' && <BySourceView groups={bySource} linkChecks={linkChecks} />}
      {tab === 'uncited' && <UncitedView posts={uncitedPosts} />}
      {tab === 'rejected' && (
        <RejectedView
          postsWithRejected={postsWithRejected}
          onApprove={approveRejected}
          onDiscard={discardRejected}
          actingOn={actingOn}
        />
      )}
    </div>
  );
}

// ── Subcomponents ──

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? 'var(--neon)' : 'var(--text)', marginTop: 2 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 100,
        border: '1px solid ' + (active ? 'var(--neon)' : 'var(--line)'),
        background: active ? 'rgba(196,255,61,0.10)' : 'transparent',
        color: active ? 'var(--neon)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
      }}
    >
      {children}
    </button>
  );
}

function ByArticleView({
  posts,
  expandedPostId,
  onToggle,
  linkChecks,
}: {
  posts: PostRow[];
  expandedPostId: string | null;
  onToggle: (id: string) => void;
  linkChecks: LinkCheckMap;
}) {
  if (posts.length === 0) {
    return <Empty>No posts with citations yet. Run citations on a post from <code>/admin/posts</code>.</Empty>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {posts.map((post) => {
        const sources = (post.sources ?? []) as Source[];
        const expanded = expandedPostId === post.id;
        return (
          <div
            key={post.id}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => onToggle(post.id)}
              style={{
                width: '100%',
                padding: 16,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--text-3)',
                  width: 14,
                  flexShrink: 0,
                  transition: 'transform 0.15s',
                  transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ▶
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {post.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {post.category && <span>{post.category} · </span>}
                  {sources.length} {sources.length === 1 ? 'source' : 'sources'}
                </div>
              </div>
              <Link
                href={`/admin/posts/${post.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12, color: 'var(--neon)', textDecoration: 'none' }}
              >
                Edit →
              </Link>
            </button>
            {expanded && (
              <ol
                style={{
                  borderTop: '1px solid var(--line)',
                  padding: '12px 16px 16px 56px',
                  margin: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {sources.map((s) => (
                  <SourceLi key={`${post.id}-${s.n}`} source={s} check={linkChecks.get(s.url)} />
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BySourceView({
  groups,
  linkChecks,
}: {
  groups: { source: Source; posts: PostRow[] }[];
  linkChecks: LinkCheckMap;
}) {
  if (groups.length === 0) {
    return <Empty>No sources yet.</Empty>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map(({ source, posts }) => (
        <div
          key={source.url}
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <SourceLi source={source} check={linkChecks.get(source.url)} hideNumber />
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Cited by {posts.length} {posts.length === 1 ? 'article' : 'articles'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {posts.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/posts/${p.id}`}
                  style={{ fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}
                >
                  → {p.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UncitedView({
  posts,
}: {
  posts: { neverRun: PostRow[]; empty: PostRow[] };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <UncitedSection
        heading={`Never run (${posts.neverRun.length})`}
        intro="These posts haven't had citations attempted yet. Open one and click 'Add citations' in the post editor."
        posts={posts.neverRun}
      />
      <UncitedSection
        heading={`Ran, but no sources verified (${posts.empty.length})`}
        intro="These posts ran the citation pipeline but no sources passed verification. Re-running might find better sources, or the article may not have citable claims."
        posts={posts.empty}
      />
    </div>
  );
}

function UncitedSection({
  heading,
  intro,
  posts,
}: {
  heading: string;
  intro: string;
  posts: PostRow[];
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{heading}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{intro}</div>
      {posts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>None.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/admin/posts/${p.id}`}
              style={{
                padding: '10px 14px',
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{p.title}</span>
              {p.category && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {p.category}
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--neon)' }}>Edit →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceLi({
  source,
  check,
  hideNumber,
}: {
  source: Source;
  check: LinkCheck | undefined;
  hideNumber?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-2)' }}>
      {!hideNumber && (
        <span style={{ flexShrink: 0, fontWeight: 700, color: 'var(--neon)', minWidth: 24 }}>
          [{source.n}]
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{
              color: 'var(--text)',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(196,255,61,0.4)',
              textUnderlineOffset: 3,
              fontWeight: 500,
              wordBreak: 'break-word',
            }}
          >
            {source.title}
          </a>
          {source.publication && (
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>— {source.publication}</span>
          )}
          <CheckBadge check={check} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
          {source.url}
        </div>
        {source.quote && (
          <blockquote
            style={{
              margin: '6px 0 0 0',
              padding: '4px 10px',
              borderLeft: '2px solid rgba(196,255,61,0.4)',
              fontStyle: 'italic',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            &ldquo;{source.quote}&rdquo;
          </blockquote>
        )}
      </div>
    </div>
  );
}

function CheckBadge({ check }: { check: LinkCheck | undefined }) {
  if (!check) return null;
  const style: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 100,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
  if (check.ok) {
    return (
      <span style={{ ...style, background: 'rgba(196,255,61,0.10)', color: 'var(--neon)' }}>
        OK {check.status}
      </span>
    );
  }
  return (
    <span
      style={{ ...style, background: 'rgba(255,107,107,0.10)', color: '#ff9c9c' }}
      title={check.reason ?? ''}
    >
      {check.status ? `Broken ${check.status}` : 'Broken'}
    </span>
  );
}

function RejectedView({
  postsWithRejected,
  onApprove,
  onDiscard,
  actingOn,
}: {
  postsWithRejected: PostRow[];
  onApprove: (postId: string, url: string) => void;
  onDiscard: (postId: string, url: string) => void;
  actingOn: string | null;
}) {
  if (postsWithRejected.length === 0) {
    return <Empty>No rejected sources to review.</Empty>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>
        Sources Claude proposed during citation runs that failed verification. Each shows the
        rejection reason. <strong style={{ color: 'var(--text-2)' }}>Approve</strong> moves it
        into the Sources list as a &ldquo;further reading&rdquo; entry (no inline [N] marker is
        added — you can manually add one in the post body if you want it anchored to a specific
        claim). <strong style={{ color: 'var(--text-2)' }}>Discard</strong> removes it from the
        review list permanently.
      </p>
      {postsWithRejected.map((post) => {
        const rejected = (post.rejected_sources ?? []) as RejectedSource[];
        return (
          <div
            key={post.id}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Link
                href={`/admin/posts/${post.id}`}
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
              >
                {post.title}
              </Link>
              <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {rejected.length} rejected
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rejected.map((r) => {
                const key = `${post.id}|${r.url}`;
                const busy = actingOn === key;
                return (
                  <div
                    key={r.url}
                    style={{
                      padding: 12,
                      background: 'var(--bg-2)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        style={{
                          color: 'var(--text)',
                          textDecoration: 'underline',
                          textDecorationColor: 'rgba(196,255,61,0.4)',
                          textUnderlineOffset: 3,
                          fontWeight: 500,
                          wordBreak: 'break-word',
                        }}
                      >
                        {r.title}
                      </a>
                      {r.publication && (
                        <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 13 }}>
                          — {r.publication}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                      {r.url}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#ffb088',
                        padding: '6px 10px',
                        background: 'rgba(255,140,80,0.08)',
                        borderRadius: 4,
                        borderLeft: '2px solid #ffb088',
                      }}
                    >
                      <strong>Rejected:</strong> {r.reason}
                    </div>
                    {r.quote && (
                      <blockquote
                        style={{
                          margin: 0,
                          padding: '4px 10px',
                          borderLeft: '2px solid rgba(196,255,61,0.4)',
                          fontStyle: 'italic',
                          fontSize: 12,
                          color: 'var(--text-2)',
                        }}
                      >
                        &ldquo;{r.quote}&rdquo;
                      </blockquote>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => onApprove(post.id, r.url)}
                        disabled={busy}
                        className="btn btn-ghost"
                        style={{ padding: '6px 12px', fontSize: 12, color: 'var(--neon)' }}
                      >
                        {busy ? 'Working…' : 'Approve anyway'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDiscard(post.id, r.url)}
                        disabled={busy}
                        className="btn btn-ghost"
                        style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-3)' }}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: 'center',
        color: 'var(--text-3)',
        border: '1px dashed var(--line)',
        borderRadius: 12,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

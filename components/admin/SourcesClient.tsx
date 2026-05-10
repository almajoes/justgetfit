'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Post, Source } from '@/lib/supabase';

/**
 * <SourcesClient />
 *
 * Three tabs:
 *   - By article: posts with citations, expand to see their sources
 *   - By source URL: every unique URL grouped, shows which posts cite it
 *   - Uncited: posts that haven't run citations yet (sources=null) or
 *     ran and got nothing (sources=[])
 *
 * Plus a "Check links" action that re-verifies every URL by hitting the
 * server endpoint /api/admin/sources/check-links. The endpoint returns
 * a status per URL (200, 404, etc.) and we visualize the result inline.
 */

type PostRow = Pick<Post, 'id' | 'slug' | 'title' | 'category' | 'published_at' | 'sources'>;

type Tab = 'by-article' | 'by-source' | 'uncited';

type LinkCheck = { url: string; ok: boolean; status: number | null; reason: string | null };
type LinkCheckMap = Map<string, LinkCheck>;

export function SourcesClient({
  posts,
  stats,
}: {
  posts: PostRow[];
  stats: {
    total: number;
    withCitations: number;
    ranButEmpty: number;
    neverRun: number;
    totalSources: number;
  };
}) {
  const [tab, setTab] = useState<Tab>('by-article');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [linkChecks, setLinkChecks] = useState<LinkCheckMap>(new Map());
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

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
        <div style={{ flex: 1 }} />
        <button
          onClick={checkAllLinks}
          disabled={checking || bySource.length === 0}
          className="btn btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {checking
            ? `Checking ${checkProgress.done}/${checkProgress.total}…`
            : `Check ${bySource.length} unique link${bySource.length === 1 ? '' : 's'}`}
        </button>
      </div>

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

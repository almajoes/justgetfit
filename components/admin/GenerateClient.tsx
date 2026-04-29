'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Mode = 'backfill' | 'drafts';

type ProgressItem = {
  index: number;
  title: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  publishedAt?: string;
};

export function GenerateClient({
  unusedTopicCount,
  postCount,
}: {
  unusedTopicCount: number;
  postCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(postCount === 0 ? 'backfill' : 'drafts');
  const [count, setCount] = useState(
    postCount === 0 ? unusedTopicCount : Math.min(unusedTopicCount, 5)
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [done, setDone] = useState(false);

  const canRun = unusedTopicCount > 0 && count > 0 && count <= unusedTopicCount && !running;

  async function runBackfill() {
    setRunning(true);
    setProgress([]);
    setDone(false);

    const items: ProgressItem[] = Array.from({ length: count }, (_, i) => ({
      index: i,
      title: '',
      status: 'pending',
    }));
    setProgress(items);

    for (let i = 0; i < count; i++) {
      // Article 1 (i=0) → most recent Monday
      // Article 2 (i=1) → one Monday earlier
      // Article N (i=N-1) → N-1 Mondays before "last Monday"
      try {
        const res = await fetch('/api/admin/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weeks_ago: i }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        items[i] = {
          index: i,
          title: data.title,
          status: 'success',
          publishedAt: data.published_at,
        };
      } catch (err) {
        items[i] = {
          index: i,
          title: '(failed)',
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
      setProgress([...items]);
    }

    setRunning(false);
    setDone(true);
    router.refresh();
  }

  async function runDraftBatch() {
    setRunning(true);
    setProgress([]);
    setDone(false);

    const items: ProgressItem[] = Array.from({ length: count }, (_, i) => ({
      index: i,
      title: '',
      status: 'pending',
    }));
    setProgress(items);

    for (let i = 0; i < count; i++) {
      try {
        const res = await fetch('/api/admin/batch-generate', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        items[i] = {
          index: i,
          title: data.title,
          status: 'success',
        };
      } catch (err) {
        items[i] = {
          index: i,
          title: '(failed)',
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
      setProgress([...items]);
    }

    setRunning(false);
    setDone(true);
    router.refresh();
  }

  return (
    <div style={{ padding: 32, maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Generate articles</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Generates AI-drafted articles from your topic queue. Each article takes ~30–60 seconds. Keep this tab open while generating.
      </p>

      {unusedTopicCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
            <ModeCard
              active={mode === 'backfill'}
              onClick={() => !running && setMode('backfill')}
              title="Backfill (auto-publish, backdated)"
              desc="One-time use. Auto-publishes each article with a backdated timestamp going back one week per article — so 51 articles span the past 51 Mondays. Skips draft review."
              recommended={postCount === 0}
            />
            <ModeCard
              active={mode === 'drafts'}
              onClick={() => !running && setMode('drafts')}
              title="Draft batch (review queue)"
              desc="Standard flow. Generates drafts that land in /admin/drafts for you to review and publish manually. Use this for ongoing top-ups outside the weekly cron."
              recommended={postCount > 0}
            />
          </div>

          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <label className="label">How many articles to generate?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  className="input"
                  value={count}
                  min={1}
                  max={unusedTopicCount}
                  onChange={(e) => setCount(Math.max(1, Math.min(unusedTopicCount, parseInt(e.target.value) || 1)))}
                  disabled={running}
                  style={{ maxWidth: 160 }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[3, 5, 10, 25].filter((n) => n <= unusedTopicCount).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      disabled={running}
                      style={{
                        background: count === n ? 'var(--neon)' : 'transparent',
                        color: count === n ? '#000' : 'var(--text-2)',
                        border: `1px solid ${count === n ? 'var(--neon)' : 'var(--line-2)'}`,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: running ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCount(unusedTopicCount)}
                    disabled={running}
                    style={{
                      background: count === unusedTopicCount ? 'var(--neon)' : 'transparent',
                      color: count === unusedTopicCount ? '#000' : 'var(--text-2)',
                      border: `1px solid ${count === unusedTopicCount ? 'var(--neon)' : 'var(--line-2)'}`,
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: running ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    All ({unusedTopicCount})
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                {unusedTopicCount} unused topic{unusedTopicCount === 1 ? '' : 's'} available in the queue. Each article takes ~30–60 seconds.
              </p>
            </div>

            {mode === 'backfill' && (
              <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 8, padding: 14, fontSize: 13, color: '#ffb84d', marginBottom: 16, lineHeight: 1.6 }}>
                <strong>Heads up:</strong> Backfill auto-publishes articles directly to the public site — no review step. Use this once on a fresh deploy. If you've already published articles, you probably want "Draft batch" instead.
              </div>
            )}

            <button
              onClick={mode === 'backfill' ? runBackfill : runDraftBatch}
              disabled={!canRun}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: 14 }}
            >
              {running
                ? `Generating ${progress.filter((p) => p.status !== 'pending').length} of ${count}…`
                : mode === 'backfill'
                ? `Generate ${count} and publish`
                : `Generate ${count} draft${count === 1 ? '' : 's'}`}
            </button>
          </div>

          {progress.length > 0 && (
            <ProgressList items={progress} mode={mode} />
          )}

          {done && (
            <div
              style={{
                background: 'rgba(196,255,61,0.07)',
                border: '1px solid rgba(196,255,61,0.25)',
                borderRadius: 12,
                padding: 20,
                marginTop: 24,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neon)', marginBottom: 8 }}>
                {mode === 'backfill' ? 'Backfill complete' : 'Batch generation complete'}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
                {progress.filter((p) => p.status === 'success').length} succeeded, {progress.filter((p) => p.status === 'error').length} failed.
                {mode === 'backfill'
                  ? ' Articles are live on the public site.'
                  : ' Drafts are waiting for you in /admin/drafts.'}
              </p>
              <Link
                href={mode === 'backfill' ? '/articles' : '/admin/drafts'}
                className="btn btn-ghost"
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                {mode === 'backfill' ? 'View live articles →' : 'Go to drafts →'}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
  recommended,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  recommended: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: active ? 'rgba(196,255,61,0.07)' : 'var(--bg-1)',
        border: `1px solid ${active ? 'rgba(196,255,61,0.4)' : 'var(--line)'}`,
        borderRadius: 12,
        padding: 20,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--text)',
        position: 'relative',
      }}
    >
      {recommended && (
        <span
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'var(--neon)',
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 100,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Recommended
        </span>
      )}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, paddingRight: 90 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{desc}</div>
    </button>
  );
}

function ProgressList({ items, mode }: { items: ProgressItem[]; mode: Mode }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 4,
        maxHeight: 480,
        overflowY: 'auto',
      }}
    >
      {items.map((item) => (
        <div
          key={item.index}
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr auto',
            gap: 12,
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: item.index < items.length - 1 ? '1px solid var(--line)' : undefined,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color:
                item.status === 'success'
                  ? 'var(--neon)'
                  : item.status === 'error'
                  ? '#ff6b6b'
                  : 'var(--text-3)',
              fontWeight: 600,
            }}
          >
            {item.status === 'success' ? '✓' : item.status === 'error' ? '✕' : '…'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                color: item.status === 'pending' ? 'var(--text-3)' : 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.status === 'pending' ? 'Generating…' : item.title}
            </div>
            {item.error && (
              <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 2 }}>{item.error}</div>
            )}
          </div>
          {item.publishedAt && mode === 'backfill' && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No unused topics in queue</div>
      <p style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
        All topics in your queue have already been used for generated articles. Add new topics to keep generating.
      </p>
      <Link href="/admin/topics" className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 13 }}>
        Manage topics →
      </Link>
    </div>
  );
}

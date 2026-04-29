'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ProgressItem = {
  index: number;
  title: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
};

export function GenerateClient({ unusedTopicCount }: { unusedTopicCount: number }) {
  const router = useRouter();
  const [count, setCount] = useState(Math.max(1, Math.min(unusedTopicCount, 5)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [done, setDone] = useState(false);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const canRun = unusedTopicCount > 0 && count > 0 && count <= unusedTopicCount && !running;

  async function generateTopics() {
    setGeneratingTopics(true);
    setTopicError(null);
    try {
      const res = await fetch('/api/admin/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 8 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setTopicError(err instanceof Error ? err.message : 'Topic generation failed');
    } finally {
      setGeneratingTopics(false);
    }
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
        setProgress((prev) =>
          prev.map((p) =>
            p.index === i ? { ...p, status: 'success', title: data.title || `Draft ${i + 1}` } : p
          )
        );
      } catch (err) {
        setProgress((prev) =>
          prev.map((p) =>
            p.index === i
              ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
              : p
          )
        );
      }
    }

    setRunning(false);
    setDone(true);
    router.refresh();
  }

  return (
    <div style={{ padding: 32, maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
        Generate articles
      </h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Generates AI-drafted articles from your topic queue. Each draft lands in <Link href="/admin/drafts" style={{ color: 'var(--neon)' }}>Drafts</Link> for review before publishing. Each article takes ~30–60 seconds. Keep this tab open while generating.
      </p>

      {unusedTopicCount === 0 ? (
        <div
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 32,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>💡</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No topics in the queue</h2>
          <p style={{ color: 'var(--text-2)', marginBottom: 24, fontSize: 14, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 24px' }}>
            Add some topic ideas before you can generate articles. The fastest way is to let Claude suggest a fresh batch — they'll cover all 8 categories and avoid duplicates.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={generateTopics}
              disabled={generatingTopics}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: 14 }}
            >
              {generatingTopics ? 'Generating 8 topics…' : '✨ Generate 8 topics with AI'}
            </button>
            <Link
              href="/admin/topics"
              className="btn btn-ghost"
              style={{ padding: '12px 24px', fontSize: 14, textDecoration: 'none', display: 'inline-block' }}
            >
              Or add manually →
            </Link>
          </div>
          {topicError && (
            <p style={{ marginTop: 16, fontSize: 13, color: '#ff6b6b' }}>{topicError}</p>
          )}
        </div>
      ) : (
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
            <label className="label">How many drafts to generate?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="number"
                className="input"
                value={count}
                min={1}
                max={unusedTopicCount}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(unusedTopicCount, parseInt(e.target.value) || 1)))
                }
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
                    style={presetButton(count === n, running)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCount(unusedTopicCount)}
                  disabled={running}
                  style={presetButton(count === unusedTopicCount, running)}
                >
                  All ({unusedTopicCount})
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              {unusedTopicCount} unused topic{unusedTopicCount === 1 ? '' : 's'} available. Each article takes ~30–60 seconds.
            </p>
          </div>

          <button
            onClick={runDraftBatch}
            disabled={!canRun}
            className="btn btn-primary"
            style={{ padding: '12px 24px', fontSize: 14 }}
          >
            {running
              ? `Generating ${progress.filter((p) => p.status !== 'pending').length} of ${count}…`
              : `Generate ${count} draft${count === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {progress.length > 0 && <ProgressList items={progress} />}

      {done && (
        <div
          style={{
            marginTop: 24,
            padding: 24,
            background: 'rgba(196,255,61,0.05)',
            border: '1px solid rgba(196,255,61,0.2)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--neon)', fontWeight: 600, marginBottom: 8 }}>
            Batch generation complete
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            {progress.filter((p) => p.status === 'success').length} succeeded,{' '}
            {progress.filter((p) => p.status === 'error').length} failed.
          </p>
          <Link
            href="/admin/drafts"
            className="btn btn-ghost"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            Go to drafts →
          </Link>
        </div>
      )}
    </div>
  );
}

function presetButton(active: boolean, running: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--neon)' : 'transparent',
    color: active ? '#000' : 'var(--text-2)',
    border: `1px solid ${active ? 'var(--neon)' : 'var(--line-2)'}`,
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: running ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}

function ProgressList({ items }: { items: ProgressItem[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 8,
        maxHeight: 480,
        overflowY: 'auto',
      }}
    >
      {items.map((item) => (
        <div
          key={item.index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: item.index < items.length - 1 ? '1px solid var(--line)' : 'none',
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 12,
              background:
                item.status === 'success'
                  ? 'rgba(196,255,61,0.15)'
                  : item.status === 'error'
                  ? 'rgba(255,107,107,0.15)'
                  : 'rgba(255,255,255,0.05)',
              color:
                item.status === 'success'
                  ? 'var(--neon)'
                  : item.status === 'error'
                  ? '#ff6b6b'
                  : 'var(--text-3)',
            }}
          >
            {item.status === 'success' ? '✓' : item.status === 'error' ? '✕' : '·'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>
              {item.title || `Article ${item.index + 1}`}
            </div>
            {item.error && (
              <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{item.error}</div>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:
                item.status === 'success'
                  ? 'var(--neon)'
                  : item.status === 'error'
                  ? '#ff6b6b'
                  : 'var(--text-3)',
            }}
          >
            {item.status === 'success' ? 'done' : item.status === 'error' ? 'error' : 'queued'}
          </span>
        </div>
      ))}
    </div>
  );
}

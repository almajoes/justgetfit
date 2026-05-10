'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Draft } from '@/lib/supabase';

const STATUS_STYLES: Record<Draft['status'], { bg: string; color: string }> = {
  pending: { bg: 'rgba(196,255,61,0.15)', color: '#c4ff3d' },
  approved: { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
  rejected: { bg: 'rgba(244,244,246,0.08)', color: 'rgba(244,244,246,0.5)' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DraftsClient({
  drafts,
  unusedTopicCount,
}: {
  drafts: Draft[];
  unusedTopicCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const pending = drafts.filter((d) => d.status === 'pending');
  const handled = drafts.filter((d) => d.status !== 'pending');

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--neon)' }}>
            Admin
          </p>
          <h1 className="text-4xl md:text-5xl font-bold" style={{ letterSpacing: '-0.02em' }}>
            Drafts
          </h1>
          <p className="mt-2" style={{ color: 'var(--text-2)' }}>
            {pending.length} pending review · {drafts.length} total · {unusedTopicCount} unused topics
          </p>
        </div>
      </div>

      {/* BATCH GENERATE PANEL */}
      <div
        className="mb-10 p-6 rounded-2xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(196,255,61,0.06) 0%, rgba(0,229,255,0.03) 100%)',
          border: '1px solid rgba(196,255,61,0.15)',
        }}
      >
        <h2 className="text-xl font-bold mb-2">Need to generate drafts?</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
          Use the dedicated <Link href="/admin/generate" style={{ color: 'var(--neon)', textDecoration: 'underline' }}>Generate articles</Link> page for batch generation, including a one-time backfill mode that auto-publishes articles with backdated weekly timestamps.
        </p>
        <Link
          href="/admin/generate"
          className="btn btn-primary"
          style={{ display: 'inline-block', textDecoration: 'none' }}
        >
          Go to Generate articles →
        </Link>
        {error && (
          <div
            className="mt-4 px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'rgb(252,165,165)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      <h2 className="text-xl font-bold mb-4">Pending review</h2>
      <div className="space-y-3 mb-12">
        {pending.length === 0 ? (
          <p className="italic" style={{ color: 'var(--text-3)' }}>
            No pending drafts. Generate new drafts manually from the <Link href="/admin/generate" style={{ color: 'var(--neon)' }}>Generate articles</Link> page.
          </p>
        ) : (
          pending.map((d) => (
            <Link
              key={d.id}
              href={`/admin/drafts/${d.id}`}
              className="block p-5 rounded-xl group transition-colors"
              style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                textDecoration: 'none',
                color: 'var(--text)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <span
                      className="px-2 py-0.5 rounded uppercase tracking-wider font-semibold"
                      style={STATUS_STYLES[d.status]}
                    >
                      {d.status}
                    </span>
                    {d.category && (
                      <span style={{ color: 'var(--neon)' }}>{d.category}</span>
                    )}
                    <span style={{ color: 'var(--text-3)' }}>{formatDate(d.created_at)}</span>
                  </div>
                  <h3 className="text-xl font-semibold group-hover:text-[var(--neon)] transition-colors">
                    {d.title}
                  </h3>
                  {d.excerpt && (
                    <p className="mt-2 text-sm line-clamp-2" style={{ color: 'var(--text-2)' }}>
                      {d.excerpt}
                    </p>
                  )}
                </div>
                <span
                  className="text-xs uppercase tracking-widest mt-2 shrink-0 transition-colors group-hover:text-[var(--neon)]"
                  style={{ color: 'var(--text-3)' }}
                >
                  Review →
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {handled.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-4">History</h2>
          <div className="flex flex-col gap-1">
            {handled.map((d) => (
              <Link
                key={d.id}
                href={`/admin/drafts/${d.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors"
                style={{ textDecoration: 'none', color: 'var(--text)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded text-xs uppercase tracking-wider font-semibold shrink-0"
                    style={STATUS_STYLES[d.status]}
                  >
                    {d.status}
                  </span>
                  <span className="truncate font-medium">{d.title}</span>
                </div>
                <span
                  className="text-xs shrink-0"
                  style={{ color: 'var(--text-3)' }}
                >
                  {formatDate(d.created_at)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

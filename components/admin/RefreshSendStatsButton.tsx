'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refresh stats button — manual force-refresh of the send detail page.
 *
 * Since /admin/newsletter/[id] computes all stats live from email_events on
 * each render, a simple router.refresh() is enough to re-pull the latest
 * webhook events and re-render. No API endpoint needed.
 *
 * Useful when:
 *   - You're watching a fresh send and want the latest open/click counts
 *   - You suspect numbers may be stale (network tab cache, etc.)
 *   - A webhook just landed and you want to see it immediately
 */
export function RefreshSendStatsButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    // Brief visual confirmation that something happened, even though the
    // refresh is server-side and may complete instantly.
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--line)',
        color: 'var(--text-2)',
        padding: '6px 12px',
        fontSize: 12,
        borderRadius: 6,
        cursor: refreshing ? 'wait' : 'pointer',
        opacity: refreshing ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      title="Re-fetch stats from email_events (Resend webhook data)"
    >
      <span style={{ display: 'inline-block', transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }}>↻</span>
      {refreshing ? 'Refreshing…' : 'Refresh stats'}
    </button>
  );
}

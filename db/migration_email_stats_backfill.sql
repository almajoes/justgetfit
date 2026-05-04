-- =============================================================================
-- Backfill email_jobs and newsletter_sends.status from email_events ground truth
-- =============================================================================
-- After May 4 2026 worker chain reliability bugs, several email_jobs got stuck
-- in status='running' even though the chain had broken. This rebuilds their
-- status from email_events (Resend-driven source of truth) WITHOUT overwriting
-- `recipient_count` — we preserve the original intended audience size so the
-- UI can show the gap between "intended" and "actually sent".
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- 1. newsletter_sends: flip stuck rows to 'completed' if events show activity.
--    Leave recipient_count alone. Update failed_count to reflect both bounces
--    AND subscribers we never reached at all (intended - sent_count).
update public.newsletter_sends ns
set
  status = case
    when et.sent_count > 0 then 'completed'
    else ns.status
  end,
  failed_count = greatest(
    coalesce(et.bounced_count, 0),
    ns.recipient_count - coalesce(et.sent_count, 0)
  )
from (
  select
    send_id,
    count(*) filter (where event_type = 'sent')      as sent_count,
    count(*) filter (where event_type = 'bounced')   as bounced_count
  from public.email_events
  where send_id is not null
  group by send_id
) et
where ns.id = et.send_id
  and ns.status in ('sending', 'pending');

-- 2. email_jobs: flip stuck rows to 'completed' if linked send has events.
update public.email_jobs ej
set
  status = case
    when et.sent_count > 0 then 'completed'
    else ej.status
  end,
  completed_at = coalesce(ej.completed_at, now())
from (
  select
    send_id,
    count(*) filter (where event_type = 'sent') as sent_count
  from public.email_events
  where send_id is not null
  group by send_id
) et
where ej.send_id = et.send_id
  and ej.status in ('queued', 'running');

-- 3. Verify
select
  ns.id,
  substring(coalesce(ns.subject, '(post)'), 1, 40) as title,
  ns.status,
  ns.recipient_count as intended,
  ns.failed_count as not_received,
  ej.processed_count as worker_processed,
  ej.total_recipients as worker_total
from public.newsletter_sends ns
left join public.email_jobs ej on ej.send_id = ns.id
order by ns.sent_at desc
limit 10;

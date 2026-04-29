import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/subscribe?status=invalid', req.url));
  }

  const { data: subscriber } = await supabaseAdmin
    .from('subscribers')
    .select('id, status')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!subscriber) {
    return NextResponse.redirect(new URL('/subscribe?status=invalid', req.url));
  }

  if (subscriber.status !== 'unsubscribed') {
    await supabaseAdmin
      .from('subscribers')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', subscriber.id);
  }

  return NextResponse.redirect(new URL('/subscribe?status=unsubscribed', req.url));
}

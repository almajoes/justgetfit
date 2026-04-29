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
    .eq('confirmation_token', token)
    .maybeSingle();

  if (!subscriber) {
    return NextResponse.redirect(new URL('/subscribe?status=invalid', req.url));
  }

  if (subscriber.status === 'confirmed') {
    return NextResponse.redirect(new URL('/subscribe?confirmed=1', req.url));
  }

  await supabaseAdmin
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', subscriber.id);

  return NextResponse.redirect(new URL('/subscribe?confirmed=1', req.url));
}

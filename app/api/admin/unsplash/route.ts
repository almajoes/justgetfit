import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { listUnsplashOptions } from '@/lib/unsplash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ photos: [] });

  const photos = await listUnsplashOptions(q);
  return NextResponse.json({ photos });
}

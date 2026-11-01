import type { NextRequest } from 'next/server';

/**
 * Proxy API runtime cote serveur Next.
 *
 * - aucune URL d'API n'est figee dans le bundle : API_INTERNAL_URL est lu a
 *   chaque requete (Coolify peut changer le reseau sans rebuild) ;
 * - les cookies, le CSRF, l'origine, les traces et le corps sont transmis ;
 * - les Set-Cookie multiples et le streaming (video/master) sont preserves.
 *
 * Aucun secret n'est journalise.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function apiBaseUrl(): string | null {
  const configured = process.env.API_INTERNAL_URL;
  if (!configured) {
    // En production, aucune URL par defaut : Coolify doit fournir API_INTERNAL_URL.
    return process.env.NODE_ENV === 'production' ? null : 'http://127.0.0.1:3101';
  }
  return configured.replace(/\/+$/, '');
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const base = apiBaseUrl();
  if (!base) {
    return Response.json(
      { error: 'api_internal_url_missing', message: 'API_INTERNAL_URL doit etre configure en production.' },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    );
  }
  const suffix = path.map((segment) => encodeURIComponent(segment)).join('/');
  const target = base + '/api/' + suffix + (request.nextUrl.search || '');

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'accept-encoding' || HOP_BY_HOP.has(lower)) {
      return;
    }
    headers.set(key, value);
  });
  headers.set('x-forwarded-host', request.headers.get('host') || '');
  headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') || 'https');

  const method = request.method.toUpperCase();
  const init: RequestInit = { method, headers, redirect: 'manual', cache: 'no-store' };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      { error: 'api_unreachable', message: "L'API interne est injoignable." },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length' || HOP_BY_HOP.has(lower)) {
      return;
    }
    if (lower === 'set-cookie') {
      return;
    }
    responseHeaders.set(key, value);
  });
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function HEAD(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
export async function OPTIONS(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}

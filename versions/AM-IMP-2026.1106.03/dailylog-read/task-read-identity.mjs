// Capabilities live only on the exact internal Request. HTTP headers cannot opt in.
const pending = new WeakMap();

export function requestsTaskReadIdentity(request) {
  return pending.has(request);
}

export function captureTaskReadIdentity(request, auth) {
  const capture = pending.get(request);
  if (!capture) return null;
  capture.auth = auth;
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function readTaskIdentity(base, request, env, ctx) {
  const internal = new Request(new URL('/api/auth/session', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const capture = {};
  pending.set(internal, capture);
  try {
    const response = await base.fetch(internal, env, ctx);
    // A wrapper may replace the response after capture. Its final status and JSON
    // remain authoritative; only the private 204 channel carries the capture.
    let auth;
    if (response.ok) {
      if (response.status === 204) {
        if (!capture.auth) throw new Error('Internal task identity was not captured.');
        auth = capture.auth;
      } else auth = await response.json();
    }
    return { response, auth };
  } finally {
    pending.delete(internal);
  }
}

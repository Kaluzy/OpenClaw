// Cloudflare Worker: Groovely audio proxy for Google Drive
//
// Route:
//   GET /p/<FILE_ID>
// Streams audio bytes from Google Drive with CORS headers.
// Supports Range for seeking.

function corsHeaders(origin: string | null) {
  // Keep it permissive for now. If you want to lock it down, set
  // ALLOWED_ORIGINS and validate the Origin header.
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Content-Type,Origin,Accept',
    'Access-Control-Expose-Headers': 'Accept-Ranges,Content-Length,Content-Range,Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function driveDownloadUrl(fileId: string) {
  // This usually redirects to drive.usercontent.google.com with a signed URL.
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...corsHeaders(origin) } });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { ...corsHeaders(origin) } });
    }

    const m = url.pathname.match(/^\/p\/([A-Za-z0-9_-]{10,})$/);
    if (!m) {
      return new Response('Not found. Use /p/<driveFileId>', { status: 404, headers: { ...corsHeaders(origin) } });
    }

    const fileId = m[1];

    // Forward Range header for audio seeking.
    const range = request.headers.get('Range');

    // Follow redirects so we end up at the content host.
    const upstream = await fetch(driveDownloadUrl(fileId), {
      method: request.method,
      redirect: 'follow',
      headers: range ? { Range: range } : {},
    });

    // Pass through most upstream headers (content-type, content-range, etc.),
    // but override CORS + CORP.
    const headers = new Headers(upstream.headers);

    // Override headers that break cross-site playback.
    headers.delete('Cross-Origin-Resource-Policy');
    headers.delete('Cross-Origin-Embedder-Policy');
    headers.delete('Content-Security-Policy');
    headers.delete('X-Content-Security-Policy');

    const cors = corsHeaders(origin);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);

    // Ensure audio seeking works.
    if (!headers.get('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};

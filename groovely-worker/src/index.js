/**
 * Groovely Music Streaming API — Cloudflare Worker
 *
 * Endpoints:
 *   GET  /api/library          — merged music library (base + patches)
 *   GET  /api/stream/:fileId   — proxy audio from Google Drive (supports Range)
 *   POST /api/auth/invite      — request a magic-link login token
 *   GET  /api/auth/verify      — exchange token for a session cookie
 *   POST /api/admin/patch      — apply a metadata patch (admin only)
 *
 * KV namespaces (bound in wrangler.toml):
 *   LIBRARY_KV  — stores the canonical library JSON
 *   PATCHES_KV  — stores the ordered list of admin patches
 *   AUTH_KV     — stores allowlist, tokens, and sessions
 */

// ---------------------------------------------------------------------------
// Helpers – CORS
// ---------------------------------------------------------------------------

/**
 * Return a new Response with CORS headers merged in.
 * The allowed origin comes from the ALLOWED_ORIGIN env var so it can differ
 * between preview / production deployments.
 */
function withCors(response, env) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN || "*");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Expose-Headers", "Content-Range, Content-Length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle OPTIONS preflight.
 */
function handleOptions(env) {
  return withCors(new Response(null, { status: 204 }), env);
}

// ---------------------------------------------------------------------------
// Helpers – JSON responses
// ---------------------------------------------------------------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Helpers – Auth
// ---------------------------------------------------------------------------

/**
 * Parse the `groovely_session` cookie from the request and look up the
 * corresponding session object in AUTH_KV.
 *
 * Returns { email, role } on success, or null if unauthenticated.
 */
async function withAuth(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/groovely_session=([^;]+)/);
  if (!match) return null;

  const sessionId = match[1];
  const sessionData = await env.AUTH_KV.get(`session:${sessionId}`, "json");
  return sessionData || null;
}

/**
 * Generate a cryptographically random hex string of the given byte-length.
 */
function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Helpers – Library patching
// ---------------------------------------------------------------------------

/**
 * Apply an ordered list of patches to the base library object (mutates in
 * place for efficiency).
 *
 * Currently supported patch types:
 *   - move_track: relocate a track from one album to another.
 */
function applyPatches(library, patches) {
  if (!patches || !Array.isArray(patches)) return library;

  for (const patch of patches) {
    if (patch.type === "move_track") {
      const { trackId, fromAlbumId, toAlbumId } = patch;

      // Locate source and target albums.
      const sourceAlbum = library.albums?.find((a) => a.id === fromAlbumId);
      const targetAlbum = library.albums?.find((a) => a.id === toAlbumId);
      if (!sourceAlbum || !targetAlbum) continue;

      // Find the track in the source album and remove it.
      const trackIndex = (sourceAlbum.tracks || []).findIndex(
        (t) => t.id === trackId
      );
      if (trackIndex === -1) continue;

      const [track] = sourceAlbum.tracks.splice(trackIndex, 1);

      // Append the track to the target album.
      if (!targetAlbum.tracks) targetAlbum.tracks = [];
      targetAlbum.tracks.push(track);
    }
    // Future patch types can be added here.
  }

  return library;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/library
 *
 * Returns the full music library with all admin patches applied.
 */
async function handleGetLibrary(env) {
  try {
    // Fetch the base library from KV.
    const libraryRaw = await env.LIBRARY_KV.get("library", "json");
    if (!libraryRaw) {
      return errorResponse("Library not found", 404);
    }

    // Fetch any patches that have been applied.
    const patches = (await env.PATCHES_KV.get("patches", "json")) || [];

    // Merge patches into the library.
    const merged = applyPatches(libraryRaw, patches);

    return jsonResponse(merged);
  } catch (err) {
    console.error("GET /api/library error:", err);
    return errorResponse("Failed to load library", 500);
  }
}

/**
 * GET /api/stream/:fileId
 *
 * Proxies audio data from Google Drive, forwarding Range headers so the
 * browser can seek within the track.  Requires a valid session cookie
 * (skipped when ALLOWED_ORIGIN is not set, i.e. local dev).
 */
async function handleStream(fileId, request, env) {
  try {
    // ---- Auth gate (skip in dev when no origin is configured) ----
    const isDev = !env.ALLOWED_ORIGIN;
    if (!isDev) {
      const session = await withAuth(request, env);
      if (!session) {
        return errorResponse("Unauthorized", 401);
      }
    }

    // ---- Build upstream request ----
    const driveUrl = `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download`;
    const upstreamHeaders = new Headers();

    // Forward the Range header so seeking works.
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      upstreamHeaders.set("Range", rangeHeader);
    }

    const upstream = await fetch(driveUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    // ---- Build downstream response ----
    const responseHeaders = new Headers();

    // Forward relevant headers from upstream.
    const forwardHeaders = ["Content-Range", "Content-Length", "Content-Type"];
    for (const name of forwardHeaders) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }

    // Default to audio/mpeg if Drive didn't provide a content type.
    if (!responseHeaders.has("Content-Type")) {
      responseHeaders.set("Content-Type", "audio/mpeg");
    }

    // Use 206 for range (partial content) responses, 200 for full.
    const status = rangeHeader && upstream.status === 206 ? 206 : 200;

    return new Response(upstream.body, { status, headers: responseHeaders });
  } catch (err) {
    console.error("GET /api/stream error:", err);
    return errorResponse("Streaming failed", 500);
  }
}

/**
 * POST /api/auth/invite
 *
 * Accepts { email } in the body.  If the email is on the allowlist stored in
 * AUTH_KV, a one-time login token is generated and stored with a 30-minute
 * TTL.  The actual email delivery is left as a TODO.
 */
async function handleInvite(request, env) {
  try {
    const body = await request.json();
    const { email } = body || {};

    if (!email || typeof email !== "string") {
      return errorResponse("Missing or invalid email", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ---- Check the allowlist ----
    const allowlist = (await env.AUTH_KV.get("allowlist", "json")) || [];
    const entry = allowlist.find(
      (e) => e.email.toLowerCase() === normalizedEmail
    );

    if (!entry) {
      // Return a generic success to avoid leaking whether the email exists.
      return jsonResponse({ success: true });
    }

    // ---- Generate and store a one-time token ----
    const token = randomHex(32);
    await env.AUTH_KV.put(
      `token:${token}`,
      JSON.stringify({ email: entry.email, role: entry.role }),
      { expirationTtl: 1800 } // 30 minutes
    );

    // TODO: Send the magic-link email containing the token.
    // Example link: `${env.ALLOWED_ORIGIN}/api/auth/verify?token=${token}`
    console.log(`[invite] token created for ${entry.email}: ${token}`);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("POST /api/auth/invite error:", err);
    return errorResponse("Invite failed", 500);
  }
}

/**
 * GET /api/auth/verify?token=xxx
 *
 * Exchanges a one-time token for a persistent session cookie and redirects
 * the user to the app.
 */
async function handleVerify(request, env) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return errorResponse("Missing token", 400);
    }

    // ---- Look up the token ----
    const tokenKey = `token:${token}`;
    const tokenData = await env.AUTH_KV.get(tokenKey, "json");

    if (!tokenData) {
      return errorResponse("Invalid or expired token", 401);
    }

    // ---- Create a session ----
    const sessionId = randomHex(32);
    const sessionTtl = 7 * 24 * 60 * 60; // 7 days in seconds

    await env.AUTH_KV.put(
      `session:${sessionId}`,
      JSON.stringify({ email: tokenData.email, role: tokenData.role }),
      { expirationTtl: sessionTtl }
    );

    // ---- Delete the consumed token ----
    await env.AUTH_KV.delete(tokenKey);

    // ---- Redirect with session cookie ----
    const redirectUrl = env.ALLOWED_ORIGIN || "/";
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        "Set-Cookie": `groovely_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${sessionTtl}`,
      },
    });
  } catch (err) {
    console.error("GET /api/auth/verify error:", err);
    return errorResponse("Verification failed", 500);
  }
}

/**
 * POST /api/admin/patch
 *
 * Appends a metadata patch to PATCHES_KV.  Requires an admin session.
 *
 * Body: { type: "move_track", trackId, fromAlbumId, toAlbumId }
 */
async function handleAdminPatch(request, env) {
  try {
    // ---- Require admin session ----
    const session = await withAuth(request, env);
    if (!session) {
      return errorResponse("Unauthorized", 401);
    }
    if (session.role !== "admin") {
      return errorResponse("Forbidden — admin role required", 403);
    }

    // ---- Parse and validate the patch ----
    const body = await request.json();
    const { type, trackId, fromAlbumId, toAlbumId } = body || {};

    if (type !== "move_track") {
      return errorResponse("Unsupported patch type", 400);
    }
    if (!trackId || !fromAlbumId || !toAlbumId) {
      return errorResponse(
        "Missing required fields: trackId, fromAlbumId, toAlbumId",
        400
      );
    }

    // ---- Append the patch ----
    const patches = (await env.PATCHES_KV.get("patches", "json")) || [];

    patches.push({
      type,
      trackId,
      fromAlbumId,
      toAlbumId,
      timestamp: new Date().toISOString(),
      adminEmail: session.email,
    });

    await env.PATCHES_KV.put("patches", JSON.stringify(patches));

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("POST /api/admin/patch error:", err);
    return errorResponse("Patch failed", 500);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Simple URL-pattern router.  Returns a Response or null (not found).
 */
async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // GET /api/library
  if (method === "GET" && pathname === "/api/library") {
    return handleGetLibrary(env);
  }

  // GET /api/stream/:fileId
  if (method === "GET" && pathname.startsWith("/api/stream/")) {
    const fileId = pathname.replace("/api/stream/", "");
    if (!fileId) {
      return errorResponse("Missing fileId", 400);
    }
    return handleStream(fileId, request, env);
  }

  // POST /api/auth/invite
  if (method === "POST" && pathname === "/api/auth/invite") {
    return handleInvite(request, env);
  }

  // GET /api/auth/verify
  if (method === "GET" && pathname === "/api/auth/verify") {
    return handleVerify(request, env);
  }

  // POST /api/admin/patch
  if (method === "POST" && pathname === "/api/admin/patch") {
    return handleAdminPatch(request, env);
  }

  return null; // no matching route
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  /**
   * Main fetch handler for the Cloudflare Worker.
   */
  async fetch(request, env, ctx) {
    // Handle CORS preflight for every route.
    if (request.method === "OPTIONS") {
      return handleOptions(env);
    }

    // Attempt to match a route and produce a response.
    let response = await route(request, env);

    // 404 for unknown routes.
    if (!response) {
      response = errorResponse("Not found", 404);
    }

    // Attach CORS headers to every response.
    return withCors(response, env);
  },
};

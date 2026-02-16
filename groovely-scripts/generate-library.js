#!/usr/bin/env node

/**
 * generate-library.js — Groovely Music Library Generator
 *
 * Scans a Google Drive folder structure organized as:
 *   root / Artist / Album / track files (.mp3, .m4a, .flac, .wav)
 *
 * Produces a library.json manifest consumed by the Groovely front-end.
 *
 * Environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — JSON string of a GCP service-account key
 *   DRIVE_ROOT_FOLDER_ID        — Google Drive folder ID that contains artist folders
 *   CF_API_TOKEN                 — (optional) Cloudflare API token for KV upload
 *   CF_ACCOUNT_ID               — (optional) Cloudflare account ID
 *   CF_KV_NAMESPACE_ID          — (optional) Cloudflare KV namespace ID
 *
 * Usage:
 *   node generate-library.js [--output <path>] [--help]
 */

import { google } from "googleapis";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP_TEXT = `
Groovely — generate-library.js

Generate a library.json manifest from a Google Drive music folder.

USAGE
  node generate-library.js [OPTIONS]

OPTIONS
  --output, -o <path>   Write library.json to the given file path.
                         If omitted the JSON is printed to stdout.
  --help, -h            Show this help message and exit.

ENVIRONMENT VARIABLES (required)
  GOOGLE_SERVICE_ACCOUNT_KEY   JSON string of a GCP service-account key.
  DRIVE_ROOT_FOLDER_ID         The root Drive folder containing artist folders.

ENVIRONMENT VARIABLES (optional — Cloudflare KV upload)
  CF_API_TOKEN          Cloudflare API bearer token.
  CF_ACCOUNT_ID         Cloudflare account ID.
  CF_KV_NAMESPACE_ID    Cloudflare KV namespace ID.

FOLDER STRUCTURE
  <root>/
    <Artist Name>/
      <Album Name>/
        cover.jpg          (or cover.png — optional album artwork)
        01 Track Title.mp3
        02 Track Title.flac
        ...

Each album folder is expected to live inside an artist folder. Track files
are sorted by filename so numbering prefixes (01, 02 …) determine order.
`.trim();

const { values: cliArgs } = parseArgs({
  options: {
    output: { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (cliArgs.help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Configuration & validation
// ---------------------------------------------------------------------------

const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;

if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
  console.error("Error: GOOGLE_SERVICE_ACCOUNT_KEY environment variable is required.");
  process.exit(1);
}

if (!DRIVE_ROOT_FOLDER_ID) {
  console.error("Error: DRIVE_ROOT_FOLDER_ID environment variable is required.");
  process.exit(1);
}

// Supported audio file extensions (case-insensitive matching)
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".flac", ".wav"]);

// Recognised cover-art filenames (case-insensitive matching)
const COVER_FILENAMES = new Set(["cover.jpg", "cover.png"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a short deterministic hex hash from a string.
 * Used to create stable IDs for albums and tracks so that the manifest stays
 * consistent across regenerations as long as folder/file paths don't change.
 */
function deterministicId(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/**
 * Return the lowercase file extension including the leading dot, e.g. ".mp3".
 */
function extension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Strip the file extension from a filename.
 */
function stripExtension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

// ---------------------------------------------------------------------------
// Google Drive helpers
// ---------------------------------------------------------------------------

/**
 * Authenticate with Google Drive using a service-account key and return an
 * authorised Drive v3 client.
 */
function buildDriveClient() {
  // Parse the service-account JSON from the environment variable
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * List every item inside a Drive folder, handling pagination automatically.
 * Returns an array of Drive file resource objects.
 *
 * @param {object} drive  — authorised Drive v3 client
 * @param {string} folderId — the parent folder's Drive ID
 * @param {string} [extraQuery] — optional additional query fragment (ANDed)
 */
async function listFolder(drive, folderId, extraQuery) {
  const items = [];
  let pageToken;

  // Build the base query: direct children of the folder that are not trashed
  let q = `'${folderId}' in parents and trashed = false`;
  if (extraQuery) {
    q += ` and ${extraQuery}`;
  }

  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      pageSize: 1000,
      pageToken,
      orderBy: "name",
    });

    items.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * List only sub-folders of a given folder.
 */
async function listSubfolders(drive, folderId) {
  return listFolder(drive, folderId, "mimeType = 'application/vnd.google-apps.folder'");
}

/**
 * List all files (non-folders) in a given folder.
 */
async function listFiles(drive, folderId) {
  return listFolder(drive, folderId, "mimeType != 'application/vnd.google-apps.folder'");
}

// ---------------------------------------------------------------------------
// Core scanning logic
// ---------------------------------------------------------------------------

/**
 * Scan a single album folder. Returns an album object (or null if the folder
 * contains no recognised audio files).
 *
 * @param {object} drive        — Drive v3 client
 * @param {string} artistName   — human-readable artist name (parent folder)
 * @param {object} albumFolder  — Drive file resource for the album folder
 */
async function scanAlbumFolder(drive, artistName, albumFolder) {
  const albumName = albumFolder.name;
  const files = await listFiles(drive, albumFolder.id);

  // Separate audio tracks from other files (looking for cover art)
  let coverUrl = null;
  const trackFiles = [];

  for (const file of files) {
    const nameLower = file.name.toLowerCase();

    // Check if this file is a cover image
    if (COVER_FILENAMES.has(nameLower)) {
      // Use the webViewLink so the front-end can display it via Drive
      coverUrl = file.webViewLink || null;
      continue;
    }

    // Check if this file is a recognised audio format
    if (AUDIO_EXTENSIONS.has(extension(file.name))) {
      trackFiles.push(file);
    }
  }

  // Skip folders that contain no audio
  if (trackFiles.length === 0) {
    return null;
  }

  // Sort tracks by filename so that numbered prefixes produce correct order
  trackFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // Build track objects
  const tracks = trackFiles.map((file, index) => {
    // The track's deterministic ID is derived from its logical path
    const trackPath = `${artistName}/${albumName}/${file.name}`;
    return {
      id: `track-${deterministicId(trackPath)}`,
      title: stripExtension(file.name),
      duration: 0, // Duration is not available from Drive metadata alone
      driveFileId: file.id,
      trackNumber: index + 1,
    };
  });

  // Build the album object
  const albumPath = `${artistName}/${albumName}`;
  return {
    id: `album-${deterministicId(albumPath)}`,
    title: albumName,
    artist: artistName,
    cover: coverUrl,
    year: null, // Year is not available from folder names by default
    tracks,
  };
}

/**
 * Scan an artist folder. Returns an array of album objects.
 */
async function scanArtistFolder(drive, artistFolder) {
  const artistName = artistFolder.name;
  const albumFolders = await listSubfolders(drive, artistFolder.id);

  console.error(`  Artist: ${artistName} (${albumFolders.length} album folder(s))`);

  const albums = [];

  for (const albumFolder of albumFolders) {
    const album = await scanAlbumFolder(drive, artistName, albumFolder);
    if (album) {
      console.error(`    Album: ${album.title} — ${album.tracks.length} track(s)`);
      albums.push(album);
    }
  }

  return albums;
}

/**
 * Scan the entire root folder and return the complete library manifest.
 */
async function scanLibrary(drive) {
  console.error(`Scanning root folder ${DRIVE_ROOT_FOLDER_ID} …`);

  // Step 1 — List all artist folders under the root
  const artistFolders = await listSubfolders(drive, DRIVE_ROOT_FOLDER_ID);
  console.error(`Found ${artistFolders.length} artist folder(s).\n`);

  // Step 2 — Iterate through each artist and collect albums
  const albums = [];

  for (const artistFolder of artistFolders) {
    const artistAlbums = await scanArtistFolder(drive, artistFolder);
    albums.push(...artistAlbums);
  }

  // Step 3 — Assemble the final manifest
  const library = {
    version: 1,
    generated: new Date().toISOString(),
    albums,
  };

  console.error(`\nLibrary generated: ${albums.length} album(s) total.`);
  return library;
}

// ---------------------------------------------------------------------------
// Cloudflare KV upload (optional)
// ---------------------------------------------------------------------------

/**
 * Upload the library JSON to a Cloudflare Workers KV namespace.
 * This is a convenience for deployments that serve library.json from the edge.
 *
 * Requires CF_API_TOKEN, CF_ACCOUNT_ID, and CF_KV_NAMESPACE_ID env vars.
 */
async function uploadToCloudflareKV(library) {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;

  // All three variables must be present to attempt the upload
  if (!token || !accountId || !namespaceId) {
    console.error("Cloudflare KV env vars not set — skipping KV upload.");
    return;
  }

  console.error("Uploading library.json to Cloudflare KV …");

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
    `/storage/kv/namespaces/${namespaceId}/values/library.json`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(library),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Cloudflare KV upload failed (${response.status}): ${body}`);
    process.exit(1);
  }

  console.error("Cloudflare KV upload succeeded.");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  // Build an authenticated Drive client from the service-account key
  const drive = buildDriveClient();

  // Scan the Drive folder tree and produce the library manifest
  const library = await scanLibrary(drive);

  // Serialise the manifest as pretty-printed JSON
  const json = JSON.stringify(library, null, 2);

  // Write to file if --output was given, otherwise print to stdout
  if (cliArgs.output) {
    await writeFile(cliArgs.output, json + "\n", "utf-8");
    console.error(`Written to ${cliArgs.output}`);
  } else {
    process.stdout.write(json + "\n");
  }

  // Optionally push to Cloudflare KV
  await uploadToCloudflareKV(library);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

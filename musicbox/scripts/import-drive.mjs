#!/usr/bin/env node
/**
 * Groovely (musicbox) — import public Google Drive folder into site/library.json
 *
 * Usage:
 *   node scripts/import-drive.mjs <drive-folder-url>
 *
 * Notes:
 * - Requires the Drive folder to be shared as: Anyone with the link can view.
 * - Scrapes Drive HTML (no OAuth) and is best-effort.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'site', 'library.json');

function die(msg){
  console.error(msg);
  process.exit(1);
}

const folderUrl = process.argv[2];
if (!folderUrl) die('Usage: node scripts/import-drive.mjs <drive-folder-url>');

function extractFolderId(url){
  const m = String(url).match(/\/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const rootId = extractFolderId(folderUrl);
if (!rootId) die('Could not parse folder id from URL');

async function fetchText(url){
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0,200)}`);
  return text;
}

function htmlDecode(s){
  return String(s)
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

/**
 * Very pragmatic parser:
 * In the Drive folder HTML, items appear as chunks containing:
 *   [[[[[null,"<ID>"],... ,"<MIME>", ... [[["<NAME>"]]] ...
 */
function parseItems(html){
  const items = [];
  const re = /\[\[(?:\[\[\[\[)?null,&quot;([A-Za-z0-9_-]{10,})&quot;\][\s\S]{0,900}?&quot;((?:application\/vnd\.google-apps\.folder)|(?:audio\/[^&]+?))&quot;[\s\S]{0,700}?\[\[\[&quot;([^&]+?)&quot;/g;
  let m;
  while ((m = re.exec(html))){
    const id = m[1];
    const mime = htmlDecode(m[2]);
    const name = htmlDecode(m[3]);
    items.push({ id, mime, name });
  }
  // de-dupe by id
  const map = new Map();
  for (const it of items){
    if (!map.has(it.id)) map.set(it.id, it);
  }
  return Array.from(map.values());
}

function isAudioMime(m){
  return String(m||'').startsWith('audio/');
}

function isFolderMime(m){
  return String(m||'') === 'application/vnd.google-apps.folder';
}

function driveDownloadUrl(fileId){
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

async function listFolder(folderId){
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const html = await fetchText(url);
  const items = parseItems(html);
  return items;
}

const rootItems = await listFolder(rootId);
const subfolders = rootItems.filter(x=>isFolderMime(x.mime));

// Fix occasional Drive HTML scrape mis-associations by overriding known folder IDs.
const FOLDER_NAME_OVERRIDES = {
  '1WTAE7pxJXO56rcJJKIjt4lCSF183OBjY': 'Afrobeats',
  '18yhD4h5VDQeUEFLYG6yJ5GruxV5Plbck': 'Amapiano',
  '1bGwOVfCTdoavHOd8nXrbZVeQkupJHxs5': 'Ethio Jazz',
  '1AW6f3MzLmFxHhM-WbvOzcqwhymSkq4jf': 'Salsa',
};
for (const f of subfolders){
  if (FOLDER_NAME_OVERRIDES[f.id]) f.name = FOLDER_NAME_OVERRIDES[f.id];
}
const rootAudio = rootItems.filter(x=>isAudioMime(x.mime));

// Build albums per subfolder
const albums = [];
let trackSeq = 1;

async function buildAlbumFromFolder(folder){
  const items = await listFolder(folder.id);
  const audio = items.filter(x=>isAudioMime(x.mime));
  const tracks = audio.map((a)=>({
    id: `d${trackSeq++}`,
    title: a.name.replace(/\.(mp3|m4a|wav|aac|flac|ogg)$/i,'').trim(),
    artist: 'Kaluzy',
    durationSec: null,
    src: driveDownloadUrl(a.id),
    genre: folder.name.toLowerCase(),
  }));

  return {
    id: `drive-${folder.id}`,
    title: folder.name,
    year: String(new Date().getFullYear()),
    cover: null,
    tracks,
  };
}

for (const f of subfolders){
  try {
    albums.push(await buildAlbumFromFolder(f));
  } catch (e){
    console.error('Failed to read subfolder', f.name, f.id, String(e));
  }
}

// Put any root-level audio into a misc album
if (rootAudio.length){
  albums.push({
    id: `drive-root-${rootId}`,
    title: 'Loose Tracks',
    year: String(new Date().getFullYear()),
    cover: null,
    tracks: rootAudio.map((a)=>( {
      id: `d${trackSeq++}`,
      title: a.name.replace(/\.(mp3|m4a|wav|aac|flac|ogg)$/i,'').trim(),
      artist: 'Kaluzy',
      durationSec: null,
      src: driveDownloadUrl(a.id),
      genre: 'misc',
    })),
  });
}

const library = {
  brand: {
    name: 'Groovely',
    tagline: 'Groove-first. Albums + playlists.',
  },
  albums,
  featuredPlaylists: [],
};

fs.writeFileSync(OUT, JSON.stringify(library, null, 2));
console.log('Wrote', OUT);
console.log('Albums:', albums.length, 'Tracks:', albums.reduce((n,a)=>n+a.tracks.length,0));

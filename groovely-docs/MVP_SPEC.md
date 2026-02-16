# Groovely MVP Spec & Implementation Blueprint

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Static Frontend (GitHub Pages)                     │
│  site/index.html  (single-page app)                 │
│  - Library browser (albums → tracks)                │
│  - Persistent bottom player bar                     │
│  - Mobile: mini-player + fullscreen now-playing     │
│  - Admin mode overlay                               │
└──────────────┬──────────────────────────────────────┘
               │ fetch
┌──────────────▼──────────────────────────────────────┐
│  Cloudflare Worker  (worker/src/index.js)           │
│                                                     │
│  GET  /api/library       → merged library manifest  │
│  GET  /api/stream/:id    → Drive proxy + Range      │
│  POST /api/auth/verify   → magic-link verify        │
│  POST /api/admin/patch   → move track / edit meta   │
│                                                     │
│  KV bindings:                                       │
│    LIBRARY_KV  – cached library.json                │
│    PATCHES_KV  – admin patches (moves/edits)        │
│    AUTH_KV     – invite tokens + sessions           │
└──────────────┬──────────────────────────────────────┘
               │ proxy
┌──────────────▼──────────────────────────────────────┐
│  Google Drive (source of truth for audio files)     │
│  Organized: Artist/Album/track.mp3                  │
└─────────────────────────────────────────────────────┘
```

## 2. Screens & Components

### 2.1 Desktop Layout (≥768px)

```
┌──────────────────────────────────────────────────────┐
│  ┌─sidebar──────┐  ┌─main─────────────────────────┐  │
│  │ GROOVELY     │  │ Album: Midnight Sessions      │  │
│  │              │  │ Artist Name                    │  │
│  │ ▶ Library    │  │ ┌─────────────────────────┐   │  │
│  │ ♫ Playlists  │  │ │ cover art               │   │  │
│  │   Chill Mix  │  │ └─────────────────────────┘   │  │
│  │   Road Trip  │  │                               │  │
│  │              │  │ #  Title          Duration     │  │
│  │ ⚙ Admin      │  │ 1  ▶ Track One     3:42      │  │
│  │              │  │ 2  ║ Track Two     4:15  ← playing│
│  │              │  │ 3  ▶ Track Three   3:58      │  │
│  └──────────────┘  └───────────────────────────────┘  │
│  ┌─player-bar──────────────────────────────────────┐  │
│  │ cover │ Track Two - Artist │ ◄◄ ▐▐ ►► │ 🔀 🔁 │  │
│  │       │ ───●──────── 1:23/4:15  │ 🔊━━●━━     │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 2.2 Mobile Layout (<768px)

**Default view: Library grid**
```
┌────────────────────┐
│ GROOVELY     ☰     │
│                    │
│ ┌──────┐ ┌──────┐ │
│ │cover │ │cover │ │
│ │Album1│ │Album2│ │
│ └──────┘ └──────┘ │
│ ┌──────┐ ┌──────┐ │
│ │cover │ │cover │ │
│ │Album3│ │Album4│ │
│ └──────┘ └──────┘ │
│                    │
│ ┌────────────────┐ │  ← mini player bar
│ │▶ Track Two 1:23│ │     tap to expand
│ └────────────────┘ │
└────────────────────┘
```

**Expanded now-playing (swipe up / tap mini-player)**
```
┌────────────────────┐
│ ▼                  │  ← swipe down to collapse
│                    │
│  ┌──────────────┐  │
│  │              │  │
│  │  cover art   │  │
│  │   (large)    │  │
│  │              │  │
│  └──────────────┘  │
│                    │
│  Track Two         │
│  Artist Name       │
│                    │
│  ───●──────── 1:23 │
│       /4:15        │
│                    │
│   ◄◄   ▐▐   ►►    │
│                    │
│  🔀          🔁    │
│  🔊━━━●━━━━━━━    │
└────────────────────┘
```

### 2.3 Component Tree

```
App
├── Sidebar (desktop) / Drawer (mobile)
│   ├── NavItem: Library
│   ├── NavItem: Playlists
│   │   └── PlaylistList
│   └── NavItem: Admin (if admin)
├── MainContent
│   ├── LibraryView (album grid)
│   │   └── AlbumCard (cover + title)
│   ├── AlbumView (track list)
│   │   ├── AlbumHeader (cover + info)
│   │   └── TrackRow (# + play/pause + title + duration)
│   └── AdminView
│       └── MoveTrackForm
├── PlayerBar (desktop: bottom bar)
│   ├── TrackInfo (cover thumbnail + title + artist)
│   ├── PlaybackControls (prev, play/pause, next)
│   ├── ProgressBar (seekable)
│   ├── ShuffleButton (toggle)
│   ├── RepeatButton (off → all → one)
│   └── VolumeControl (slider)
└── MobileNowPlaying (fullscreen drawer, mobile only)
    └── (same controls as PlayerBar, larger layout)
```

## 3. Data Model

### 3.1 library.json Schema

```json
{
  "version": 1,
  "generated": "2025-01-15T10:00:00Z",
  "albums": [
    {
      "id": "album-abc123",
      "title": "Midnight Sessions",
      "artist": "Artist Name",
      "cover": "https://drive.google.com/...",
      "year": 2024,
      "tracks": [
        {
          "id": "track-xyz789",
          "title": "Track One",
          "duration": 222,
          "driveFileId": "1ABCxyz...",
          "trackNumber": 1
        }
      ]
    }
  ]
}
```

### 3.2 Admin Patch Schema (KV: PATCHES_KV)

```json
{
  "patches": [
    {
      "id": "patch-001",
      "type": "move_track",
      "trackId": "track-xyz789",
      "fromAlbumId": "album-abc123",
      "toAlbumId": "album-def456",
      "timestamp": "2025-01-15T12:00:00Z",
      "adminEmail": "admin@example.com"
    }
  ]
}
```

The `/api/library` endpoint merges `library.json` + patches at read time.

### 3.3 User State (localStorage)

```json
{
  "groovely_playlists": [
    {
      "id": "pl-001",
      "name": "Chill Mix",
      "trackIds": ["track-xyz789", "track-abc123"]
    }
  ],
  "groovely_volume": 0.8,
  "groovely_repeat": "off",
  "groovely_shuffle": false
}
```

## 4. Playback Behavior Spec

### 4.1 Track Row Button States

| State                         | Icon    | Action on click     |
|-------------------------------|---------|---------------------|
| Track is current AND playing  | ▐▐ Pause | Pause playback     |
| Track is current AND paused   | ▶ Play  | Resume playback     |
| Track is NOT current          | ▶ Play  | Load + play track   |

### 4.2 Continuous Play

On `audio.ended` event:
1. If repeat === "one" → seek to 0, play again
2. If shuffle === true → pick random unplayed track from queue
3. Else → advance to next track in album/playlist
4. If last track AND repeat === "all" → go to first track
5. If last track AND repeat === "off" → stop

### 4.3 Repeat States (cycle on click)

off → all → one → off

- **off**: Stop after last track
- **all**: Loop entire album/playlist
- **one**: Loop current track

### 4.4 Shuffle

Toggle on/off. When enabled:
- Build a shuffled copy of the current queue
- Preserve current track position
- When disabled, restore original order

### 4.5 Seek & Volume

- Click/drag on progress bar → seek to position
- Click/drag on volume slider → set volume (0–1)
- Volume persists in localStorage

## 5. Auth: Magic-Link Flow

```
1. User visits app → sees login screen
2. Enters email → POST /api/auth/invite { email }
3. Worker checks email against allowlist (KV)
4. If allowed → generates token, stores in AUTH_KV (30min TTL)
5. Sends magic-link email via Mailgun/Resend
6. User clicks link → GET /api/auth/verify?token=xxx
7. Worker validates token → sets httpOnly cookie (7-day session)
8. App loads with session cookie → all /api/* requests authenticated
```

Roles stored in allowlist KV:
- `listener` — can browse, play, create playlists
- `admin` — can also move tracks, trigger library rebuild

## 6. Admin Features (MVP)

### 6.1 Move Track to Different Album

1. Admin selects track → "Move to..." button appears
2. Modal shows album list
3. Admin selects target album → POST /api/admin/patch
4. Worker writes patch to PATCHES_KV
5. Library re-merges on next /api/library call

### 6.2 Rebuild Library (stretch)

Button in admin panel → POST /api/admin/rebuild
Worker re-scans Drive folders → regenerates library.json → stores in LIBRARY_KV

## 7. Implementation Plan (Prioritized)

### Phase 1: Core Player UI (ship first)
1. Create `site/index.html` with full responsive layout
2. Implement audio playback engine (play/pause/next/prev/seek/volume)
3. Implement shuffle + repeat state machine
4. Implement continuous play (audio.ended handler)
5. Track row button state logic (play/pause per track)
6. Album grid view + album detail view
7. Mobile mini-player + fullscreen now-playing drawer
8. LocalStorage for playlists, volume, preferences

### Phase 2: Cloudflare Worker API
1. `/api/library` — serve library.json from KV
2. `/api/stream/:id` — proxy Drive files with Range header support
3. CORS headers for GitHub Pages origin

### Phase 3: Auth
1. Email allowlist in KV
2. Magic-link token generation + verification
3. Session cookie management
4. Role-based middleware (listener vs admin)
5. Login screen in frontend

### Phase 4: Admin
1. Admin mode toggle (UI)
2. Move-track modal + PATCH endpoint
3. Patch merging in /api/library
4. (Stretch) Rebuild-library endpoint

### Phase 5: Generator Script
1. Node.js script that lists Drive folders via API
2. Builds library.json with album/track metadata
3. Uploads to LIBRARY_KV via Cloudflare API

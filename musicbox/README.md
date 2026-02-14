# Groovely (Musicbox)

A lightweight web music player (albums + playlists) published to GitHub Pages.

## Live
- https://Kaluzy.github.io/Stella/music/

## How it works
- `site/index.html` — the player UI (vanilla HTML/CSS/JS)
- `site/library.json` — the library manifest (albums + tracks)
- Tracks are stored in Google Drive and streamed via a Cloudflare Worker proxy to avoid Drive CORP blocking.

## Update library from Google Drive
1) Ensure the Drive folder is shared: **Anyone with the link can view**
2) Run:

```bash
cd /Users/kaluzy/.openclaw/workspace/musicbox
node scripts/import-drive.mjs 'https://drive.google.com/drive/folders/<FOLDER_ID>'
```

3) Publish:

```bash
bash scripts/publish-to-stella.sh
```

## Cloudflare Worker (audio proxy)
- Worker project lives in `worker/`
- Deployed URL (current): https://groovely-audio.kmariozzy.workers.dev

The manifest `src` values point to the Worker:
`https://groovely-audio.kmariozzy.workers.dev/p/<driveFileId>`

## Notes
- User playlists currently live in browser `localStorage`.
- MVP focus: reliable playback + mobile UX + basic sharing.

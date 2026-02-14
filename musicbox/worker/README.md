# Groovely — Cloudflare Worker audio proxy

Google Drive serves media with `Cross-Origin-Resource-Policy: same-site`, which prevents `<audio>` playback from your GitHub Pages site.

This Worker proxies Drive downloads and sets permissive CORS headers so browsers can play audio.

## What you get
- URL like: `https://groovely-audio.<your-subdomain>.workers.dev/p/<FILE_ID>`
- Supports `Range` requests (required for audio seeking).

## Cost / safety
- **Bandwidth costs** apply on Cloudflare (and/or your plan limits).
- Start with a small library and monitor usage.

## Deploy (quick)
1) Install Wrangler

```bash
npm i -g wrangler
wrangler login
```

2) From this folder:

```bash
cd worker
wrangler deploy
```

3) Optional: add a custom domain route in Cloudflare dashboard.

## Use in library.json
Set track src to:

`https://<your-worker-domain>/p/<driveFileId>`

Example:
`https://groovely-audio.kaluzy.workers.dev/p/1Y5fAGUdzLC0-tKJASkW0dpuXdAdIcYnD`

## Notes
- Requires your Drive files/folders to be shared as: **Anyone with the link can view**.
- The Worker fetches Drive's download endpoint and streams bytes through.

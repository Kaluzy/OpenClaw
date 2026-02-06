# Stella ⭐️

A personal assistant + daily dashboard.

## Morning Brief (newspaper-style)

Every morning, Stella publishes a clean, dark-mode “newspaper” dashboard to GitHub Pages.

- **Latest brief:** `https://Kaluzy.github.io/Stella/latest/`
- **Archive:** `https://Kaluzy.github.io/Stella/YYYY-MM-DD/`

### What’s inside
- Hacker News (RSS)
- GitHub “hot repos” (7-day stars proxy via GitHub API)
- WatchTower Pulse: Sales/RevOps/competitive moves
- Security Pulse: Microsoft + global security intel (MSRC, CISA, SANS)
- 1 AI business / branding idea
- Today’s 2 actions

## How publishing works

The site is served from the `gh-pages` branch.

Stella generates a static HTML dashboard and pushes it to:
- `/latest/` (always the newest)
- `/<YYYY-MM-DD>/` (daily snapshot)

## Local generator (OpenClaw workspace)

Source lives on the machine running OpenClaw:

- Generator: `~/.openclaw/workspace/morning-brief-v0/generate.mjs`
- Publisher: `~/.openclaw/workspace/morning-brief-v0/scripts/publish-simple.sh`

Run manually:

```bash
bash ~/.openclaw/workspace/morning-brief-v0/scripts/publish-simple.sh
```

## Notes
- Product Hunt + YC sections are intentionally skipped for now (anti-bot / app-driven pages). We can add them later via official APIs or alternative sources.
- This repo is intentionally treated as **build output** (static site) rather than a codebase.

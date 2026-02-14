#!/usr/bin/env bash
set -euo pipefail

# Publishes the musicbox site into Stella GitHub Pages under /music/
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OWNER_REPO="${STELLA_PAGES_REPO:-Kaluzy/Stella}"

# Token from env or OpenClaw config
if [[ -z "${GITHUB_TOKEN:-}" || "${GITHUB_TOKEN:-}" == "PASTE_TOKEN_HERE" ]]; then
  GITHUB_TOKEN="$(node -e "const fs=require('fs'); try{const c=JSON.parse(fs.readFileSync('/Users/kaluzy/.openclaw/openclaw.json','utf8')); process.stdout.write((c.env&&c.env.vars&&c.env.vars.GITHUB_TOKEN)||'');}catch(e){}")"
  GITHUB_TOKEN="${GITHUB_TOKEN//$'\n'/}"
fi

if [[ -z "$GITHUB_TOKEN" || "$GITHUB_TOKEN" == "PASTE_TOKEN_HERE" ]]; then
  echo "Missing GITHUB_TOKEN" >&2
  exit 1
fi

TMP="/tmp/stella-pages-music-$$"
rm -rf "$TMP" && mkdir -p "$TMP"
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${OWNER_REPO}.git"

git clone -q --branch gh-pages --single-branch "$REMOTE" "$TMP"

mkdir -p "$TMP/music"
rsync -a --delete "$PROJECT_DIR/site/" "$TMP/music/"

cd "$TMP"
git add -A
if ! git diff --cached --quiet; then
  git -c user.name='stella' -c user.email='stella@localhost' commit -m "Musicbox publish" >/dev/null
  git push -q origin gh-pages:gh-pages
fi

echo "Published: https://Kaluzy.github.io/Stella/music/"

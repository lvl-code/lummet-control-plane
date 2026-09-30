#!/usr/bin/env bash
# =====================================================================
# Integrate the "database-driven public site" change into an existing
# lummet-control-plane checkout (built for Termux, works on any Linux).
#
#   bash integrate.sh check   [ZIP] [DEST]   compare only, changes nothing
#   bash integrate.sh apply   [ZIP] [DEST]   copy new + modified files, remove the 2 obsolete ones
#
# Defaults:
#   ZIP  = ~/storage/downloads/lummet-control-plane-public-site-full.zip
#   DEST = ~/lummet/lummet-control-plane
# It never touches .git, .wrangler or node_modules, and never commits.
# =====================================================================
set -euo pipefail

MODE="${1:-check}"
ZIP="${2:-$HOME/storage/downloads/lummet-control-plane-public-site-full.zip}"
DEST="${3:-$HOME/lummet/lummet-control-plane}"
STAGE="$HOME/lummet/compare-upgrades/public-site"
ROOT="lummet-control-plane"
REMOVED="worker/public-brands.js worker/views/pages/home.js"

die() { echo "ERROR: $*" >&2; exit 1; }

for tool in unzip git sha256sum diff cp; do
  command -v "$tool" >/dev/null || die "missing '$tool'. In Termux: pkg install unzip git coreutils diffutils"
done
[ "$MODE" = "check" ] || [ "$MODE" = "apply" ] || die "mode must be 'check' or 'apply'"
[ -f "$ZIP" ]  || die "zip not found: $ZIP  (is it in ~/storage/downloads? run termux-setup-storage once)"
[ -d "$DEST/.git" ] || die "$DEST is not a git checkout"

echo "== 1/5 Unpacking into $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
unzip -q "$ZIP" -d "$STAGE"
NEW="$STAGE/$ROOT"
[ -d "$NEW/worker/public-site" ] || die "zip does not contain $ROOT/worker/public-site"

echo "== 2/5 Checking your working tree"
cd "$DEST"
echo "   branch: $(git branch --show-current)   HEAD: $(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  echo "   You have uncommitted changes:"; git status --short | sed 's/^/     /'
  [ "${FORCE:-0}" = "1" ] || die "commit or stash them first (or re-run with FORCE=1)"
fi

echo "== 3/5 Verifying the files this change modifies are still the versions it was built on"
BAD=0
while read -r sum file; do
  [ -f "$DEST/$file" ] || { echo "   MISSING  $file"; BAD=1; continue; }
  have="$(sha256sum "$DEST/$file" | cut -d' ' -f1)"
  if [ "$have" != "$sum" ]; then echo "   DIFFERS  $file  (changed since the baseline; review before applying)"; BAD=1; fi
done < "$NEW/docs/integration/baseline.sha256"
if [ "$BAD" = "1" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "   Compare manually:  diff -u $DEST/<file> $NEW/<file>"
  die "baseline mismatch. Nothing was changed. (FORCE=1 overrides, overwriting your version)"
fi
echo "   all 11 baseline files match"

echo "== 4/5 Comparison (your repo  vs  new tree)"
diff -rq --exclude=.git --exclude=.wrangler --exclude=node_modules "$DEST" "$NEW" | sed "s#$DEST#[yours]#g; s#$NEW#[new]#g" || true

if [ "$MODE" = "check" ]; then
  echo; echo "CHECK ONLY: nothing was changed. Re-run with 'apply' to integrate."; exit 0
fi

echo "== 5/5 Applying"
cp -a "$NEW/." "$DEST/"
for f in $REMOVED; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then git rm -q "$f"; else rm -f "$f"; fi
  echo "   removed $f"
done
echo; git status --short | awk '{print $1}' | sort | uniq -c
echo
echo "Done. Next: npm test, then apply the D1 migrations, then git add/commit/push."
echo "See docs/INTEGRATION_PUBLIC_SITE.md"

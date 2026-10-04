#!/usr/bin/env bash
# =====================================================================
# Integrate a packaged change into an existing checkout (built for Termux, works on any Linux).
# Works for lummet-control-plane and lummet-tenant: the repo name is read from the zip.
#
#   bash integrate.sh check ZIP DEST   compare only, changes nothing
#   bash integrate.sh apply ZIP DEST   copy new + modified files, remove obsolete ones
#
# Example (control plane):
#   bash integrate.sh check ~/storage/downloads/lummet-control-plane-v4-dashboards-full.zip ~/lummet/lummet-control-plane
#
# Safety: refuses to run on a dirty git tree or when any file the change modifies differs from the
# version it was built on (docs/integration/baseline.sha256). FORCE=1 overrides both.
# It never touches .git, .wrangler or node_modules, and never commits.
# =====================================================================
set -euo pipefail

MODE="${1:-check}"
ZIP="${2:-}"
DEST="${3:-}"
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$MODE" = "check" ] || [ "$MODE" = "apply" ] || die "mode must be 'check' or 'apply'"
[ -n "$ZIP" ] && [ -n "$DEST" ] || die "usage: bash integrate.sh {check|apply} ZIP DEST"
for tool in unzip git sha256sum diff cp; do
  command -v "$tool" >/dev/null || die "missing '$tool'. In Termux: pkg install unzip git coreutils diffutils"
done
[ -f "$ZIP" ]       || die "zip not found: $ZIP  (is it in ~/storage/downloads? run termux-setup-storage once)"
[ -d "$DEST/.git" ] || die "$DEST is not a git checkout"

FIRST="$(unzip -Z1 "$ZIP" | sed -n 1p)"
ROOT="${FIRST%%/*}"
[ -n "$ROOT" ] || die "empty zip"
STAGE="$HOME/lummet/compare-upgrades/$(basename "$ZIP" .zip)"

echo "== 1/5 Unpacking $ROOT into $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
unzip -q "$ZIP" -d "$STAGE"
NEW="$STAGE/$ROOT"
[ -f "$NEW/docs/integration/baseline.sha256" ] || die "zip has no docs/integration/baseline.sha256"

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
  [ -n "$file" ] || continue
  [ -f "$DEST/$file" ] || { echo "   MISSING  $file"; BAD=1; continue; }
  have="$(sha256sum "$DEST/$file" | cut -d' ' -f1)"
  if [ "$have" != "$sum" ]; then echo "   DIFFERS  $file  (changed since the baseline; review before applying)"; BAD=1; fi
done < "$NEW/docs/integration/baseline.sha256"
if [ "$BAD" = "1" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "   Compare manually:  diff -u $DEST/<file> $NEW/<file>"
  die "baseline mismatch. Nothing was changed. (FORCE=1 overrides, overwriting your version)"
fi
echo "   all $(grep -c . "$NEW/docs/integration/baseline.sha256" || true) baseline files match"

echo "== 4/5 Comparison (your repo  vs  new tree)"
diff -rq --exclude=.git --exclude=.wrangler --exclude=node_modules "$DEST" "$NEW" | sed "s#$DEST#[yours]#g; s#$NEW#[new]#g" || true

if [ "$MODE" = "check" ]; then
  echo; echo "CHECK ONLY: nothing was changed. Re-run with 'apply' to integrate."; exit 0
fi

echo "== 5/5 Applying"
cp -a "$NEW/." "$DEST/"
if [ -f "$NEW/docs/integration/removed.txt" ]; then
  while read -r f; do
    [ -n "$f" ] || continue
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then git rm -q "$f"; echo "   removed $f"; fi
  done < "$NEW/docs/integration/removed.txt"
fi
echo; git status --short | awk '{print $1}' | sort | uniq -c
echo
echo "Done. Next: run the tests, then git add/commit/push (see the docs/RELEASE_*.md file in this change)."

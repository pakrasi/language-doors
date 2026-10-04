#!/bin/bash
# Fluentish cutover for Igloo: merge branch `cutover` into main, give it a fresh V, run the gates, push.
# Run it from anywhere:   bash <(git -C ~/language-doors show cutover:scripts/cutover-merge.sh)
# Undo: see Rollback in fluentish docs/CUTOVER.md (git revert -m 1 <merge>, then bump V and push).
set -euo pipefail
REPO=${REPO:-$HOME/language-doors}
PORT=${PORT:-8461}
cd "$REPO"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "language-doors has uncommitted changes; commit or stash them first"; exit 1; }
START=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin
git rev-parse -q --verify cutover >/dev/null || { echo "no local branch 'cutover'"; exit 1; }
git switch -q main
git merge -q --ff-only origin/main
if ! git merge --no-ff --no-edit -m "Fluentish cutover: B1 moves to Fluentish (merge branch cutover)" cutover; then
  # Expected only if a P0 deploy bumped V after the branch was cut (site.js, sw.js, version.json, app.html, index.html):
  # keep cutover's lines with any V, `git add` them, `git commit --no-edit`, then run the rest of this script by hand.
  echo "merge conflict in: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; exit 1
fi
bash scripts/bump_v.sh
git commit -q -am "V $(sed -n "s/^  const V = '\([^']*\)'.*/\1/p" site.js) for the Fluentish cutover"
# gates (README): matcher, B1 tests, Igloo Test/Drill unchanged
python3 -m http.server "$PORT" >/dev/null 2>&1 & SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
node scripts/test_match.mjs >/dev/null
node scripts/test_b1.mjs >/dev/null
U=http://localhost:$PORT bash scripts/b1_regress.sh
grep -q "if (window.B1_MOVED) return;" app.js && grep -q "B1 = /" app.html || { echo "redirect guard missing after merge"; exit 1; }
git push origin main
git switch -q "$START" 2>/dev/null || true
echo "pushed $(git rev-parse --short main). Pages deploys in about a minute: curl -s https://pakrasi.github.io/language-doors/version.json"

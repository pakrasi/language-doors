#!/bin/bash
# bash scripts/bump_v.sh [NEWV]  — one version for everything: site.js V, every ?v= in app.html, sw.js V, version.json.
# Default NEWV: today's date + a letter after the current one. Run before every deploy.
set -e
cd "$(dirname "$0")/.."
OLD=$(sed -n "s/^  const V = '\([^']*\)'.*/\1/p" site.js)
NEW=${1:-}
if [ -z "$NEW" ]; then
  D=$(date +%Y%m%d)
  if [[ "$OLD" == "$D"* ]]; then L=${OLD:8:1}; NEW="$D$(echo "$L" | tr 'a-y' 'b-z')"; else NEW="${D}a"; fi
fi
sed -i '' "s/const V = '$OLD'/const V = '$NEW'/" site.js
sed -i '' "s/?v=$OLD/?v=$NEW/g" app.html index.html 2>/dev/null || true
sed -i '' "s/^const V = '[^']*'/const V = '$NEW'/" sw.js
printf '{"v":"%s","sw":"on"}\n' "$NEW" > version.json
echo "V $OLD -> $NEW"

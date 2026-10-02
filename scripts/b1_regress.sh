#!/bin/bash
# bash scripts/b1_regress.sh [--write]   (server: python3 -m http.server 8430 in the repo)
# Igloo Test/Drill no-regression check in headless WebKit (iPhone 14). Captures the Test autotest summary and the
# SM-2 records it writes, and the Drill session's first card and key handling; compares with
# scripts/baselines/ui.json (or writes it with --write). Screenshots go to $SHOTS (default: scratchpad b1plan/shots/regress).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
U=${U:-http://localhost:8430}
WORK=${WORK:-${TMPDIR:-/tmp}/b1-regress}; mkdir -p "$WORK"; cd "$WORK"
SHOTS=${SHOTS:-$WORK/shots}; mkdir -p "$SHOTS"
P="playwright-cli -s=b1reg"
ev() { $P --raw eval "$1" 2>/dev/null; }
waitfor() { for i in $(seq 1 30); do r=$(ev "$1"); [ "$r" = "true" ] && return 0; sleep 0.5; done; return 1; }
$P close >/dev/null 2>&1
$P open "$U/app.html?autotest=12#test" --browser=webkit --device="iPhone 14" >/dev/null 2>&1
waitfor "!!document.querySelector('.summary h2')" || echo "Test autotest did not finish"
TEST=$(ev "JSON.stringify({h2:document.querySelector('.summary h2')?.textContent,grid:document.querySelector('.sum-grid')?.innerText,srs:Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('doors.srs.v1')||'{}')).map(([k,v])=>[k,[v.ivl,v.reps,v.lapses,v.hist,v.ease]]).sort())})")
$P screenshot --filename="$SHOTS/test-autotest12.png" >/dev/null
ERR1=$($P console 2>&1 | grep -c '^\[ERROR\]')
$P close >/dev/null 2>&1
$P open "$U/app.html?autostart#drill/start" --browser=webkit --device="iPhone 14" >/dev/null 2>&1
waitfor "!!document.querySelector('.card')" || echo "Drill did not start"
CARD=$(ev "JSON.stringify({card:!!document.querySelector('.card')?.innerText.trim(),show:!!document.querySelector('.show-btn')})")
$P screenshot --filename="$SHOTS/drill-start.png" >/dev/null
$P press Space >/dev/null; sleep 0.4; $P press 3 >/dev/null; sleep 0.4
N1=$(ev "Object.keys(JSON.parse(localStorage.getItem('doors.srs.v1')||'{}')).length")
$P press u >/dev/null 2>&1; sleep 0.4
DRILL=$(ev "JSON.stringify({after_space_3:$N1,after_u:Object.keys(JSON.parse(localStorage.getItem('doors.srs.v1')||'{}')).length,hash:location.hash})")
ERR2=$($P console 2>&1 | grep -c '^\[ERROR\]')
$P close >/dev/null 2>&1
NOW=$(python3 -c "import json,sys; print(json.dumps({'test':json.loads(json.loads(sys.argv[1])),'drill_card':json.loads(json.loads(sys.argv[2])),'drill':json.loads(json.loads(sys.argv[3])),'console_errors':int(sys.argv[4])+int(sys.argv[5])},ensure_ascii=False,sort_keys=True,indent=1))" "$TEST" "$CARD" "$DRILL" "$ERR1" "$ERR2")
BASE="$ROOT/scripts/baselines/ui.json"
if [ "${1:-}" = "--write" ]; then echo "$NOW" > "$BASE"; echo "UI baseline written: $BASE"; exit 0; fi
if [ "$NOW" = "$(cat "$BASE")" ]; then echo "Test/Drill unchanged (UI baseline)"; else echo "Test/Drill CHANGED:"; diff <(cat "$BASE") <(echo "$NOW") | head -30; exit 1; fi

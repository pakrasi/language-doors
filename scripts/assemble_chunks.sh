#!/bin/sh
# Assemble every language whose chunk batches all validate.
cd "$(dirname "$0")/.."
N=$(ls data/chunks/src/batch*.json | wc -l | tr -d ' ')
for l in khasi german hindi french swissgerman bengali spanish italian portuguese arabic; do
  n=$(ls data/chunks/parts/$l/batch*.json 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "$N" ]; then python3 scripts/validate_chunks.py $l --assemble | tail -1; else echo "$l: $n/$N batches"; fi
done

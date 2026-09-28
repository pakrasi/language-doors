#!/bin/sh
# Assemble every language whose 12 chunk batches all validate.
cd "$(dirname "$0")/.."
for l in khasi german hindi french swissgerman bengali spanish italian portuguese arabic; do
  n=$(ls data/chunks/parts/$l/batch*.json 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "12" ]; then python3 scripts/validate_chunks.py $l --assemble | tail -1; else echo "$l: $n/12 batches"; fi
done

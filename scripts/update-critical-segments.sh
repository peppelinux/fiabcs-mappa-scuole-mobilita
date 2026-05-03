#!/usr/bin/env bash
# Scarica da OSM i way nominati dell'asse Cosenza (Maestri del Lavoro, Pasquale Rossi,
# Viale della Repubblica, Via Roma) nel bbox progetto; build-critical-corridor-cosenza-axis.py
# unisce le geometrie (no merge automatico su tutta la rete = niente tratti in bosco).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/overpass-cosenza-axis-$$.json"
OVERPASS_URL="${OVERPASS_URL:-https://overpass-api.de/api/interpreter}"

QUERY='[out:json][timeout:120];
(
  way["name"="Via Roma"]["highway"](39.28,16.16,39.34,16.30);
  way["name"="Viale della Repubblica"]["highway"](39.28,16.16,39.34,16.30);
  way["name"~"Maestri del Lavoro",i]["highway"](39.28,16.16,39.34,16.30);
  way["name"~"Pasquale Rossi",i]["highway"](39.28,16.16,39.34,16.30);
);
out tags geom;'

curl -sS -X POST "$OVERPASS_URL" --data-urlencode "data=${QUERY}" -o "$TMP"
python3 "$ROOT/scripts/build-critical-corridor-cosenza-axis.py" "$TMP" "$ROOT/data/schools-poi.geojson" "$ROOT/data.geojson"
rm -f "$TMP"
echo "Aggiornato $ROOT/data.geojson"

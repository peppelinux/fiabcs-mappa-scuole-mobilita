#!/usr/bin/env bash
# Scarica da OSM i way dell'itinerario critico: asse centro (Maestri, Rossi, Repubblica, Roma)
# + Rende (Misasi, Europa, Panebianco, Kennedy) + Città 2000 (Pomponio Leto, Via Guglielmo Marconi,
# Via Torino, Via Don Minzoni). Nessun tratto SS107 / Garibaldi verso stazione (filtrato in Python).
# build-critical-corridor-cosenza-axis.py unisce le geometrie (merge lungo tratto ≤650 m).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/overpass-cosenza-axis-$$.json"
OVERPASS_URL="${OVERPASS_URL:-https://overpass-api.de/api/interpreter}"

QUERY='[out:json][timeout:180];
(
  way["name"="Via Roma"]["highway"](39.28,16.16,39.34,16.30);
  way["name"="Viale della Repubblica"]["highway"](39.28,16.16,39.34,16.30);
  way["name"~"Maestri del Lavoro",i]["highway"](39.28,16.16,39.34,16.30);
  way["name"~"Pasquale Rossi",i]["highway"](39.28,16.16,39.34,16.30);
  way["name"~"Riccardo Misasi",i]["highway"](39.28,16.16,39.34,16.30);
  way["name"="Piazza Europa"]["highway"](39.28,16.16,39.38,16.32);
  way["name"="Viale Europa"]["highway"](39.28,16.16,39.38,16.32);
  way["name"="Via Panebianco"]["highway"](39.28,16.16,39.38,16.32);
  way["name"~"John Fitzgerald Kennedy",i]["highway"](39.28,16.16,39.38,16.32);
  way["name"="Via Pomponio Leto"]["highway"](39.28,16.16,39.38,16.32);
  way["name"~"Guglielmo Marconi",i]["highway"](39.28,16.16,39.38,16.32);
  way["name"="Via Torino"]["highway"](39.28,16.16,39.38,16.32);
  way["name"~"Don Minzoni",i]["highway"](39.28,16.16,39.38,16.32);
);
out tags geom;'

curl -sS -X POST "$OVERPASS_URL" --data-urlencode "data=${QUERY}" -o "$TMP"
python3 "$ROOT/scripts/build-critical-corridor-cosenza-axis.py" "$TMP" "$ROOT/data/schools-poi.geojson" "$ROOT/data.geojson"
rm -f "$TMP"
echo "Aggiornato $ROOT/data.geojson"

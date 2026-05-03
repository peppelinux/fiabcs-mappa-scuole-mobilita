#!/usr/bin/env bash
# Rigenera data.geojson (itinerario critico): scarica il grafo stradale OSM nel bbox
# definito in config/critical-corridor.json e calcola i percorsi con Dijkstra tra i waypoint.
# Vie, esclusioni e waypoint si modificano solo nel JSON, non nello script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${CRITICAL_CORRIDOR_CONFIG:-$ROOT/config/critical-corridor.json}"

python3 "$ROOT/scripts/build-critical-corridor-cosenza-axis.py" \
  "$CONFIG" \
  "$ROOT/data/schools-poi.geojson" \
  "$ROOT/data.geojson"
echo "Aggiornato $ROOT/data.geojson"

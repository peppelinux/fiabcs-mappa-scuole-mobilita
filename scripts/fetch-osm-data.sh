#!/usr/bin/env bash
# Rigenera gli estratti OSM in data/osm-*.geojson (bbox Cosenza–Rende–Arcavacata).
# Dipendenze: curl, python3. Licenza dati: ODbL (OpenStreetMap).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_JSON="${TMPDIR:-/tmp}/overpass-cosenza-$$.json"
QUERY='[out:json][timeout:180];
(
  way["highway"="cycleway"](39.25,16.14,39.42,16.33);
  way["bicycle_road"="yes"](39.25,16.14,39.42,16.33);
  way["highway"="pedestrian"](39.25,16.14,39.42,16.33);
  way["highway"="footway"]["footway"="crossing"](39.25,16.14,39.42,16.33);
  way["highway"]["cycleway"~"^(lane|track|share_busway|yes)$"](39.25,16.14,39.42,16.33);
);
out tags geom;'

echo "Scaricamento Overpass API…"
curl -sS -X POST "https://overpass-api.de/api/interpreter" \
  --data-urlencode "data=${QUERY}" \
  -o "$OUT_JSON"

export OUT_JSON
export ROOT
python3 << 'PY'
import json, os

def way_to_feat(el, tags):
    geom = el.get("geometry") or []
    if len(geom) < 2:
        return None
    coords = [[g["lon"], g["lat"]] for g in geom]
    props = dict(tags)
    props["osm_way_id"] = el["id"]
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "LineString", "coordinates": coords},
    }

def is_cycle(tags):
    if tags.get("highway") == "cycleway":
        return True
    if tags.get("bicycle_road") == "yes":
        return True
    cw = tags.get("cycleway") or ""
    if cw in ("lane", "track", "share_busway", "yes", "opposite", "opposite_lane"):
        return bool(tags.get("highway"))
    return False

def is_ped(tags):
    if tags.get("highway") == "pedestrian":
        return True
    if tags.get("highway") == "footway" and tags.get("footway") == "crossing":
        return True
    return False

path = os.environ["OUT_JSON"]
root = os.environ["ROOT"]
with open(path) as f:
    j = json.load(f)

cycle, ped = [], []
for el in j.get("elements", []):
    if el.get("type") != "way":
        continue
    tags = el.get("tags") or {}
    feat = way_to_feat(el, tags)
    if not feat:
        continue
    if is_cycle(tags):
        cycle.append(feat)
    if is_ped(tags):
        ped.append(feat)

meta = {
    "source": "OpenStreetMap via Overpass API",
    "license": "ODbL 1.0",
    "osm_timestamp": j.get("osm3s", {}).get("timestamp_osm_base"),
}
os.makedirs(os.path.join(root, "data"), exist_ok=True)
for name, feats in [("osm-cycleways", cycle), ("osm-pedestrian", ped)]:
    out = {"type": "FeatureCollection", "name": name, "properties": meta, "features": feats}
    fp = os.path.join(root, "data", name + ".geojson")
    with open(fp, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(fp, len(feats), "features")
PY

rm -f "$OUT_JSON"
echo "Fatto."

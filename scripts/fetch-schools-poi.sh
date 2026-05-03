#!/usr/bin/env bash
# Scarica amenity=school|kindergarten|college nella bbox Cosenza–Rende e genera data/schools-poi.geojson
# Licenza OSM: ODbL. Dipendenze: curl, python3.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/osm-schools-$$.json"

QUERY='[out:json][timeout:240];
(
  nwr["amenity"="school"](39.25,16.14,39.42,16.33);
  nwr["amenity"="kindergarten"](39.25,16.14,39.42,16.33);
  nwr["amenity"="college"](39.25,16.14,39.42,16.33);
);
out center tags;'

curl -sS -X POST "https://overpass-api.de/api/interpreter" --data-urlencode "data=${QUERY}" -o "$TMP"
export OSM_JSON="$TMP"
export ROOT
python3 << 'PY'
import json, os, re

ROOT = os.environ["ROOT"]
PATH_JSON = os.environ["OSM_JSON"]


def classify(tags):
    amenity = (tags.get("amenity") or "").strip()
    name = (tags.get("name") or "").strip()
    operator = (tags.get("operator") or "").strip()
    blob = f" {name} {operator} ".lower()
    compact = re.sub(r"[\s.]+", "", blob)

    if amenity == "kindergarten":
        return (
            "infanzia",
            "Asilo nido / scuola dell'infanzia (amenity=kindergarten)",
        )

    if amenity == "college":
        return ("superiori", "Secondaria di II grado (amenity=college)")

    if re.search(r"\bI\.?\s*T\.?\s*C\.?\b", name, re.I) or re.search(
        r"\bI\.?\s*T\.?\s*I\.?\b", name, re.I
    ):
        return ("superiori", "Istituto tecnico (sigla I.T.C. / I.T.I.)")
    if re.search(r"\bITIS\b", name, re.I) or re.search(r"\bIIS\b", name, re.I):
        return ("superiori", "Istituto secondario di II grado (sigla)")

    if "comprensivo" in blob or " i.c." in blob or " ic " in blob or "instituto comprensivo" in blob:
        return ("comprensivo", "Istituto comprensivo (polo pluriordine)")

    if "istituto d'istruzione superiore" in blob or "istituto di istruzione superiore" in blob:
        return ("superiori", "IISS / IIS")
    if "liceo" in blob or "ginnasio" in blob:
        return ("superiori", "Liceo / II grado")
    if "istituto tecnico" in blob or "itis " in blob or " itis" in blob:
        return ("superiori", "Istituto tecnico")
    if "ipss" in blob or "ipsia" in blob or "professionale" in blob or "agrario" in blob or "alberghier" in blob or "geometri" in blob:
        return ("superiori", "Istituto professionale / tecnico")
    if "istituto tecnico commerciale" in blob:
        return ("superiori", "Istituto tecnico commerciale")
    if "itc" in compact and "comprensivo" not in blob:
        return ("superiori", "Istituto tecnico (I.T.C.)")

    if (
        "secondaria di primo" in blob
        or " i grado" in blob
        or "primo grado" in blob
        or "scuola media" in blob
        or "secondaria di i grado" in blob
    ):
        return ("media", "Scuola secondaria di I grado (media)")
    if "elementare" in blob or " primaria" in blob or "scuola primaria" in blob:
        return ("elementare", "Scuola primaria (elementare)")
    if (
        "infanzia" in blob
        or " asilo" in blob
        or "materna" in blob
        or "dell'infanzia" in blob
        or "dell’infanzia" in blob
    ):
        return ("infanzia", "Scuola dell'infanzia")

    if "convitto" in blob:
        return ("superiori", "Convitto / collegio")

    return (
        "non_classificata",
        "Scuola (OSM) — nome generico o tag incompleti; integra su openstreetmap.org",
    )


def element_center(el):
    if el["type"] == "node":
        la, lo = el.get("lat"), el.get("lon")
        return la, lo
    c = el.get("center")
    if c:
        return c.get("lat"), c.get("lon")
    return None, None


with open(PATH_JSON) as f:
    j = json.load(f)

seen = set()
features = []
for el in j.get("elements", []):
    tags = el.get("tags") or {}
    lat, lon = element_center(el)
    if lat is None or lon is None:
        continue
    raw_name = (tags.get("name") or tags.get("official_name") or "").strip()
    name = raw_name or "Senza nome"
    cat, cat_label = classify(tags)
    key = (round(lat, 4), round(lon, 4), name.lower()[:120])
    if key in seen:
        continue
    seen.add(key)

    props = {
        "kind": "school_poi",
        "category": cat,
        "category_label": cat_label,
        "name": name,
        "amenity": tags.get("amenity"),
        "operator": tags.get("operator"),
        "addr:street": tags.get("addr:street"),
        "addr:housenumber": tags.get("addr:housenumber"),
        "addr:city": tags.get("addr:city"),
        "addr:postcode": tags.get("addr:postcode"),
        "website": tags.get("website"),
        "phone": tags.get("phone"),
        "osm_type": el["type"],
        "osm_id": el["id"],
    }
    if not raw_name:
        # Filtro GeoJSON / jq: select(.properties.poi_uid)
        props["poi_uid"] = "school-poi-anon-%s-%s" % (el["type"], el["id"])
    props = {k: v for k, v in props.items() if v is not None and v != ""}

    features.append(
        {
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        }
    )

out = {
    "type": "FeatureCollection",
    "name": "schools-poi-cosenza-rende",
    "properties": {
        "source": "OpenStreetMap (Overpass API)",
        "license": "ODbL 1.0",
        "bbox": "39.25,16.14 — 39.42,16.33",
        "osm_timestamp": j.get("osm3s", {}).get("timestamp_osm_base"),
        "classification_note": "Categorie euristiche da nome/amenity OSM; verificare su OSM e integrare isced:level dove possibile. POI senza nome in OSM hanno poi_uid school-poi-anon-<tipo>-<id> per modifica manuale.",
    },
    "features": features,
}

os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
outp = os.path.join(ROOT, "data", "schools-poi.geojson")
with open(outp, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(outp, len(features), "POI")
PY

rm -f "$TMP"
echo "OK."

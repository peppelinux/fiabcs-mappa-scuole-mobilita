#!/usr/bin/env python3
"""
Deprecato per questo progetto: usare build-critical-corridor-cosenza-axis.py (asse nominato).

Ricostruisce i tratti critici in data.geojson da un dump Overpass (ways con geometry).
L’estrazione deve limitarsi ai comuni di Cosenza e Rende (Andreotta = frazione di Rende),
es. query Overpass con area ref:ISTAT 078045 e 078102.
Esclude le strade statali (SS / denominazioni da statale); focus su arterie urbane
(`primary`, `secondary`, `tertiary` non statali). Merge di segmenti con estremità ≤ 12 m.

Uso: python3 scripts/build-critical-segments.py /path/to/overpass.json /path/to/data.geojson
"""
from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime, timezone


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p = math.pi / 180
    a = (
        0.5
        - math.cos((lat2 - lat1) * p) / 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def geom_to_lonlat(geom: list) -> list[list[float]]:
    return [[g["lon"], g["lat"]] for g in geom]


def chain_len_m(coords: list[list[float]]) -> float:
    s = 0.0
    for i in range(1, len(coords)):
        s += haversine_m(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    return s


def close(a: list[float], b: list[float], max_m: float = 12) -> bool:
    return haversine_m(a[1], a[0], b[1], b[0]) <= max_m


def merge_all(segments: list[list[list[float]]]) -> list[list[list[float]]]:
    segs = [list(s) for s in segments if len(s) >= 2]
    chains: list[list[list[float]]] = []
    while segs:
        chain = segs.pop(0)
        while True:
            merged = False
            i = 0
            while i < len(segs):
                seg = segs[i]
                if close(chain[0], seg[0]):
                    chain = list(reversed(seg))[1:] + chain
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[0], seg[-1]):
                    chain = seg[:-1] + chain
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[-1], seg[0]):
                    chain = chain + seg[1:]
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[-1], seg[-1]):
                    chain = chain + list(reversed(seg))[1:]
                    segs.pop(i)
                    merged = True
                    break
                i += 1
            if not merged:
                break
        chains.append(chain)
    return chains


def simplify(coords: list[list[float]], min_dist_m: float = 12) -> list[list[float]]:
    if len(coords) < 3:
        return coords
    out = [coords[0]]
    acc = 0.0
    for c in coords[1:-1]:
        d = haversine_m(out[-1][1], out[-1][0], c[1], c[0])
        acc += d
        if acc >= min_dist_m:
            out.append(c)
            acc = 0.0
    out.append(coords[-1])
    return out


_RE_SS_REF = re.compile(r"^(SS|RA)\s*\d", re.I)
_RE_SS_IN_REF = re.compile(r"\bSS\.?\s*\d{2,4}\b", re.I)
_RE_SS_IN_NAME = re.compile(r"\bss\.?\s*\d{2,4}\b", re.I)


def is_strada_statale(tags: dict) -> bool:
    """Strade statali italiane (ref SS…, RA…, o nome esplicito)."""
    ref = (tags.get("ref") or "").strip().upper()
    name = (tags.get("name") or "").lower()
    off = (tags.get("official_name") or "").lower()

    if _RE_SS_REF.match(ref):
        return True
    if _RE_SS_IN_REF.search(ref):
        return True
    if "strada statale" in name or "strada statale" in off:
        return True
    if _RE_SS_IN_NAME.search(name) or _RE_SS_IN_NAME.search(off):
        return True
    return False


def urban_artery(tags: dict) -> bool:
    h = tags.get("highway")
    if h not in ("primary", "secondary", "tertiary"):
        return False
    return not is_strada_statale(tags)


def main() -> None:
    if len(sys.argv) != 3:
        print("Uso: build-critical-segments.py <overpass.json> <data.geojson>", file=sys.stderr)
        sys.exit(1)
    inp, outp = sys.argv[1], sys.argv[2]
    with open(inp) as f:
        elems = [
            e
            for e in json.load(f).get("elements", [])
            if e.get("type") == "way" and e.get("geometry")
        ]

    segs = []
    for e in elems:
        tags = e.get("tags") or {}
        if urban_artery(tags):
            segs.append(geom_to_lonlat(e["geometry"]))

    chains = sorted(merge_all(segs), key=chain_len_m, reverse=True)
    if not chains:
        print(
            "Nessuna catena: nessun way primary/secondary/tertiary non statale nel dump.",
            file=sys.stderr,
        )
        sys.exit(2)

    lon1 = simplify(chains[0])
    l1 = chain_len_m(lon1) / 1000

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    props_common = {
        "note": "Tratti critici: arterie urbane OSM nei soli comuni Cosenza e Rende (ISTAT; Andreotta in Rende), no SS. Scuole: data/schools-poi.geojson.",
        "critical_segments_generated": now,
        "critical_segments_source": "OpenStreetMap (highway=primary|secondary|tertiary) nei comuni Cosenza (ISTAT 078045) e Rende (078102, include Andreotta); esclusi ref/nome strade statali (SS…); merge ≤12 m. ODbL.",
    }

    feats: list[dict] = [
        {
            "type": "Feature",
            "properties": {
                "kind": "critical_segment",
                "name": "Arterie urbane — tratto critico 1 (no strade statali)",
                "risk": "Assi urbani a traffico sostenuto; continuità ciclopedonale e attraversamenti da verificare.",
                "notes": f"Catena più lunga ~{l1:.1f} km (ways merge, escl. SS). Rigenera: scripts/update-critical-segments.sh.",
                "osm_filter": "primary|secondary|tertiary,urban,no_SS",
                "length_km": round(l1, 2),
            },
            "geometry": {"type": "LineString", "coordinates": lon1},
        }
    ]

    if len(chains) > 1:
        lon2 = simplify(chains[1])
        l2 = chain_len_m(lon2) / 1000
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": "critical_segment",
                    "name": "Arterie urbane — tratto critico 2 (no strade statali)",
                    "risk": "Rete urbana collegata; mixing traffico-bici e velocità da analizzare tratto per tratto.",
                    "notes": f"Seconda catena per lunghezza ~{l2:.1f} km, stessi criteri (no SS). Rigenera: scripts/update-critical-segments.sh.",
                    "osm_filter": "primary|secondary|tertiary,urban,no_SS",
                    "length_km": round(l2, 2),
                },
                "geometry": {"type": "LineString", "coordinates": lon2},
            }
        )

    fc = {
        "type": "FeatureCollection",
        "name": "heatmap-demo-overlays",
        "properties": props_common,
        "features": feats,
    }
    with open(outp, "w") as f:
        json.dump(fc, f, indent=2)
    n2 = len(feats[1]["geometry"]["coordinates"]) if len(feats) > 1 else 0
    print(outp, "OK —", len(lon1), n2, "vertici", f"({len(chains)} catene)")


if __name__ == "__main__":
    main()

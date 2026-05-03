#!/usr/bin/env python3
"""
Costruisce un unico LineString `critical_segment` in data.geojson (itinerario critico):

- Cosenza centro: Maestri del Lavoro, Pasquale Rossi, Viale della Repubblica, Via Roma
  (filtro bbox stretto = niente omonimi lontani).
- Rende / campus: Via Riccardo Misasi, Piazza e Viale Europa, Via Panebianco, Via John Fitzgerald Kennedy.
- Città 2000: Via Pomponio Leto, Via Guglielmo Marconi (solo `name` che inizia con «Via »),
  Via Torino, Via Don Minzoni (filtrati nel bbox nord o vicino al nodo place Città 2000).

Esclusi: ogni way con **ref** o denominazione **SS 107**; **Via/Viale Giuseppe Garibaldi**
(per il tratto verso stazione e affini). Nessun tratto sulla SS107.

Unisce i segmenti OSM a ≤25 m; unisce componenti a ≤MERGE_LONG_LINK m (default 650 m).
Orientamento: nord (lat maggiore) → sud.

Uso:
  python3 scripts/build-critical-corridor-cosenza-axis.py \\
    /path/to/overpass.json /path/to/schools-poi.geojson /path/to/data.geojson

Il secondo file serve per note metodologiche (buffer 300 m); il tracciato è interamente da OSM.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone

# Distanza massima (m) per unire due polilinee dello stesso asse quando OSM ha un «salto» tra way.
MERGE_LONG_LINK_M = 650.0


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


def close(a: list[float], b: list[float], max_m: float) -> bool:
    return haversine_m(a[1], a[0], b[1], b[0]) <= max_m


def merge_all(segments: list[list[list[float]]], max_m: float) -> list[list[list[float]]]:
    segs = [list(s) for s in segments if len(s) >= 2]
    chains: list[list[list[float]]] = []
    while segs:
        chain = segs.pop(0)
        while True:
            merged = False
            i = 0
            while i < len(segs):
                seg = segs[i]
                if close(chain[0], seg[0], max_m):
                    chain = list(reversed(seg))[1:] + chain
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[0], seg[-1], max_m):
                    chain = seg[:-1] + chain
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[-1], seg[0], max_m):
                    chain = chain + seg[1:]
                    segs.pop(i)
                    merged = True
                    break
                if close(chain[-1], seg[-1], max_m):
                    chain = chain + list(reversed(seg))[1:]
                    segs.pop(i)
                    merged = True
                    break
                i += 1
            if not merged:
                break
        chains.append(chain)
    return chains


def simplify(coords: list[list[float]], min_dist_m: float = 14) -> list[list[float]]:
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


def centroid_lonlat(seg: list[list[float]]) -> tuple[float, float]:
    mx = sum(p[0] for p in seg) / len(seg)
    my = sum(p[1] for p in seg) / len(seg)
    return mx, my


def _ref_u(tags: dict) -> str:
    return (tags.get("ref") or "").upper().replace(" ", "")


def _ref_has_ss107(ref: str) -> bool:
    for part in ref.replace(",", ";").split(";"):
        p = part.strip().upper().replace(" ", "")
        if p == "SS107" or p.startswith("SS107"):
            return True
    return False


def allowed_street(tags: dict) -> bool:
    n = (tags.get("name") or "").strip()
    nl = n.lower()
    ref = _ref_u(tags)
    if _ref_has_ss107(ref):
        return False
    if "garibaldi" in nl and "giuseppe" in nl:
        return False
    if ("silana" in nl and "107" in nl) or ("crotonese" in nl and "107" in nl):
        return False
    if "ss107" in nl:
        return False
    if "maestri del lavoro" in nl:
        return True
    if "pasquale rossi" in nl:
        return True
    if nl == "viale della repubblica":
        return True
    if nl == "via roma":
        return True
    if "misasi" in nl:
        return True
    if nl == "piazza europa":
        return True
    if nl == "viale europa":
        return True
    if "panebianco" in nl:
        return True
    if "kennedy" in nl:
        return True
    if "pomponio leto" in nl:
        return True
    if nl.startswith("via ") and "guglielmo marconi" in nl:
        return True
    if nl == "via torino":
        return True
    if "minzoni" in nl and ("don" in nl or nl.startswith("via don")):
        return True
    return False


def is_core_axis_name(tags: dict) -> bool:
    nl = (tags.get("name") or "").strip().lower()
    return (
        ("maestri del lavoro" in nl)
        or ("pasquale rossi" in nl)
        or nl == "viale della repubblica"
        or nl == "via roma"
    )


def urban_cosenza_core(seg: list[list[float]]) -> bool:
    """Esclude omonimi lontani (es. Viale Repubblica fuori tessuto Cosenza nel bbox largo)."""
    mx, my = centroid_lonlat(seg)
    return 16.195 <= mx <= 16.275 and 39.285 <= my <= 39.322


def north_rende_quattromiglia_corridor(seg: list[list[float]]) -> bool:
    """Rende, Europa, Panebianco, campus / nord (no omonimi lontani)."""
    mx, my = centroid_lonlat(seg)
    return 16.18 <= mx <= 16.32 and 39.295 <= my <= 39.375


# Nodo OSM place=suburb «Città 2000» (vicino Via Pomponio Leto / rete locale).
CITTA2000_LONLAT = (16.2430327, 39.3100376)


def near_citta2000_m(seg: list[list[float]], max_m: float) -> bool:
    mx, my = centroid_lonlat(seg)
    lon, lat = CITTA2000_LONLAT
    return haversine_m(my, mx, lat, lon) <= max_m


def segment_kept(tags: dict, seg: list[list[float]]) -> bool:
    if not allowed_street(tags):
        return False
    nl = (tags.get("name") or "").strip().lower()
    if is_core_axis_name(tags):
        return urban_cosenza_core(seg)
    if "pomponio leto" in nl:
        return near_citta2000_m(seg, 1700)
    if nl.startswith("via ") and "guglielmo marconi" in nl:
        return near_citta2000_m(seg, 1900)
    if nl == "via torino":
        return north_rende_quattromiglia_corridor(seg)
    if "minzoni" in nl and "don" in nl:
        return north_rende_quattromiglia_corridor(seg)
    return north_rende_quattromiglia_corridor(seg)


def dist_point_to_chain_m(pt: tuple[float, float], chain: list[list[float]]) -> float:
    lon, lat = pt
    best = float("inf")
    for i in range(1, len(chain)):
        a, b = chain[i - 1], chain[i]
        for c in (a, b):
            best = min(best, haversine_m(lat, lon, c[1], c[0]))
        m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        best = min(best, haversine_m(lat, lon, m[1], m[0]))
    return best


def main() -> None:
    if len(sys.argv) != 4:
        print(
            "Uso: build-critical-corridor-cosenza-axis.py "
            "<overpass.json> <schools-poi.geojson> <data.geojson>",
            file=sys.stderr,
        )
        sys.exit(1)
    inp, schools_path, outp = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(inp) as f:
        elems = [
            e
            for e in json.load(f).get("elements", [])
            if e.get("type") == "way" and e.get("geometry")
        ]

    segs: list[list[list[float]]] = []
    for e in elems:
        tags = e.get("tags") or {}
        seg = geom_to_lonlat(e["geometry"])
        if not segment_kept(tags, seg):
            continue
        segs.append(seg)

    if not segs:
        print("Nessun segmento: controlla Overpass e filtri toponimi.", file=sys.stderr)
        sys.exit(2)

    chains = merge_all(segs, 25)
    chains.sort(key=lambda c: len(c), reverse=True)
    chains = merge_all(chains, MERGE_LONG_LINK_M)
    chains.sort(key=lambda c: len(c), reverse=True)

    # Tra le catene che passano vicino al punto storico di ancoraggio, si preferisce la più lunga
    # (include asse centro + diramazioni Rende / Città 2000 quando unite da merge).
    anchor = (16.2450790, 39.3054831)
    anchor_max_m = 600.0
    scored = [(dist_point_to_chain_m(anchor, ch), chain_len_m(ch), ch) for ch in chains]
    near = [t for t in scored if t[0] <= anchor_max_m]
    if near:
        ch = max(near, key=lambda t: t[1])[2]
    else:
        ch = min(scored, key=lambda t: t[0])[2]
    if ch[0][1] < ch[-1][1]:
        ch = list(reversed(ch))

    lonlat = simplify(ch)
    length_km = chain_len_m(lonlat) / 1000
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

    with open(schools_path) as f:
        n_schools = len(
            [
                x
                for x in json.load(f).get("features", [])
                if (x.get("geometry") or {}).get("type") == "Point"
            ]
        )

    props_common = {
        "note": "Itinerario critico: centro Cosenza (Maestri del Lavoro, Rossi, Repubblica, Roma) "
        "+ Misasi, Piazza/Viale Europa, Via Panebianco, Kennedy; Città 2000: Via Pomponio Leto, "
        "Via Guglielmo Marconi, Via Torino, Via Don Minzoni. Esclusi SS107 e Via/Viale Giuseppe Garibaldi. "
        "Scuole: data/schools-poi.geojson.",
        "critical_segments_generated": now,
        "critical_segments_source": "OpenStreetMap (ways nominati), merge ≤25 m e ≤650 m tra "
        "componenti; filtro bbox centro o corridoio nord; vie Città 2000 entro ~1,9 km dal place omonimo. "
        "Esclusione ref/nome SS107 e Garibaldi. ODbL.",
    }

    feat = {
        "type": "Feature",
        "properties": {
            "kind": "critical_segment",
            "name": "Itinerario critico — centro, Europa, Panebianco, Città 2000",
            "risk": "Contesto scolastico e flussi urbani: sicurezza e comfort per chi si muove "
            "a piedi e in bici (continuità ciclopedonale, velocità, attraversamenti, qualità "
            "dell’ambiente stradale) da analizzare tratto per tratto.",
            "notes": (
                f"Linea unica ~{length_km:.2f} km da geometrie OSM (n≈{n_schools} POI scuola "
                "nel progetto per buffer 300 m). Rigenera: scripts/update-critical-segments.sh."
            ),
            "osm_filter": "named_ways:Cosenza_axis_Misasi_Europa_Panebianco_Kennedy_Citta2000_spine",
            "length_km": round(length_km, 2),
        },
        "geometry": {"type": "LineString", "coordinates": lonlat},
    }

    fc = {
        "type": "FeatureCollection",
        "name": "heatmap-demo-overlays",
        "properties": props_common,
        "features": [feat],
    }
    with open(outp, "w") as f:
        json.dump(fc, f, indent=2)
    print(outp, "OK —", len(lonlat), "vertici,", f"{length_km:.2f} km")


if __name__ == "__main__":
    main()

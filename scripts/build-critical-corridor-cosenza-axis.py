#!/usr/bin/env python3
"""
Itinerario critico in data.geojson: grafo OSM da Overpass + **Dijkstra** (std: heapq)
tra waypoint definiti in **config/critical-corridor.json** — niente merge euristico.

L’itinerario critico **non** deve seguire piste ciclabili dedicate: nel grafo sono
sempre esclusi `highway=cycleway`, `bicycle_road` e `highway=path` con
`bicycle=designated|official` (anche se la regex in JSON li includesse per errore).

Uso:
  python3 scripts/build-critical-corridor-cosenza-axis.py \\
    path/to/critical-corridor.json path/to/schools-poi.geojson path/to/data.geojson

Opzionale: variabile d’ambiente CRITICAL_ROUTING_JSON punta a un dump Overpass
già scaricato (stesso formato di out body + nodi) per sviluppo offline.
"""
from __future__ import annotations

import heapq
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p = math.pi / 180
    a = (
        0.5
        - math.cos((lat2 - lat1) * p) / 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    )
    return 2 * r * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _m_xy(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Metri locali (origine lat0,lon0), sufficienti per distanze << 1 km."""
    p = math.pi / 180
    mx = (lon - lon0) * 6_371_000 * math.cos(lat0 * p) * p
    my = (lat - lat0) * 6_371_000 * p
    return mx, my


def dist_point_to_segment_m(
    plat: float, plon: float, alat: float, alon: float, blat: float, blon: float
) -> float:
    """Distanza approssimata (m) dal punto P al segmento AB."""
    ax, ay = 0.0, 0.0
    bx, by = _m_xy(blat, blon, alat, alon)
    px, py = _m_xy(plat, plon, alat, alon)
    len2 = bx * bx + by * by
    if len2 < 1e-6:
        return haversine_m(plat, plon, alat, alon)
    t = max(0.0, min(1.0, (px * bx + py * by) / len2))
    qx, qy = t * bx, t * by
    return math.hypot(px - qx, py - qy)


def min_dist_segment_segment_m(
    alat: float,
    alon: float,
    blat: float,
    blon: float,
    clat: float,
    clon: float,
    dlat: float,
    dlon: float,
) -> float:
    """Distanza minima (m) tra segmenti AB e CD (stima conservativa)."""
    return min(
        dist_point_to_segment_m(alat, alon, clat, clon, dlat, dlon),
        dist_point_to_segment_m(blat, blon, clat, clon, dlat, dlon),
        dist_point_to_segment_m(clat, clon, alat, alon, blat, blon),
        dist_point_to_segment_m(dlat, dlon, alat, alon, blat, blon),
    )


def chain_len_m(coords: list[list[float]]) -> float:
    s = 0.0
    for i in range(1, len(coords)):
        s += haversine_m(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
    return s


def simplify(coords: list[list[float]], min_dist_m: float) -> list[list[float]]:
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


def load_config(path: str) -> dict[str, Any]:
    with open(path) as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        sys.exit("Config: radice deve essere un oggetto JSON.")
    if "routing" not in cfg or "legs" not in cfg or "route" not in cfg:
        sys.exit("Config: servono le chiavi routing, route, legs.")
    return cfg


def fetch_overpass_routing(cfg: dict[str, Any]) -> dict[str, Any]:
    r = cfg["routing"]
    bbox = r["bbox"]
    south, west, north, east = bbox["south"], bbox["west"], bbox["north"], bbox["east"]
    timeout = int(r.get("timeout_s", 180))
    url = r.get("overpass_url", "https://overpass-api.de/api/interpreter")
    query = f"""[out:json][timeout:{timeout}];
(
  way["highway"]["area"!~"yes"]({south},{west},{north},{east});
);
(._;>;);
out body;
"""
    req = urllib.request.Request(
        url,
        data=query.encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "User-Agent": "Fiab-heatmap-critical-corridor/1.0 (https://github.com; build-critical-corridor)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout + 30) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        print(f"Overpass HTTP {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(4)
    except urllib.error.URLError as e:
        print(f"Overpass URL error: {e.reason}", file=sys.stderr)
        sys.exit(4)
    return json.loads(raw.decode("utf-8"))


def tags_name_search_blob(tags: dict[str, Any]) -> str:
    """Unisce i toponimi OSM più usati per i match exclude_ways (non solo `name`)."""
    parts: list[str] = []
    for k in (
        "name",
        "name:it",
        "name:en",
        "alt_name",
        "official_name",
        "loc_name",
        "short_name",
        "old_name",
    ):
        v = tags.get(k)
        if v:
            parts.append(str(v))
    return " ".join(parts).lower()


def way_matches_geometry_buffer_rule(tags: dict[str, Any], rule: dict[str, Any]) -> bool:
    blob = tags_name_search_blob(tags)
    if "name_contains" in rule and str(rule["name_contains"]).lower() in blob:
        return True
    if "name_contains_all" in rule:
        parts = rule["name_contains_all"]
        if all(str(p).lower() in blob for p in parts):
            return True
    return False


def collect_geometry_buffer_segments(
    osm: dict[str, Any],
    nodes: dict[int, tuple[float, float]],
    rules: list[dict[str, Any]],
    extra_way_ids: set[int],
    extra_buffer_m: float,
) -> list[tuple[float, float, float, float, float]]:
    """(lat1,lon1,lat2,lon2,buffer_m) per ogni segmento da «cancellare» intorno."""
    out: list[tuple[float, float, float, float, float]] = []

    def push_segments(nlist: list[Any], buf: float) -> None:
        for i in range(len(nlist) - 1):
            a, b = int(nlist[i]), int(nlist[i + 1])
            if a not in nodes or b not in nodes:
                continue
            loa, laa = nodes[a]
            lob, lab = nodes[b]
            out.append((laa, loa, lab, lob, buf))

    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        wid = el.get("id")
        nlist = el.get("nodes") or []
        if len(nlist) < 2:
            continue
        tags = el.get("tags") or {}
        if wid is not None and int(wid) in extra_way_ids and extra_buffer_m > 0:
            push_segments(nlist, extra_buffer_m)
        for rule in rules:
            buf = float(rule.get("buffer_m", 40))
            if buf <= 0:
                continue
            if way_matches_geometry_buffer_rule(tags, rule):
                push_segments(nlist, buf)
    return out


def strip_edges_near_forbidden_corridors(
    adj: dict[int, list[tuple[int, float]]],
    nodes: dict[int, tuple[float, float]],
    forbidden: list[tuple[float, float, float, float, float]],
    max_edge_len_m: float,
) -> None:
    """Rimuove archi corti che passano entro buffer_m da un corridoio vietato.

    Gli archi lunghi (dorsali) non vengono toccati: altrimenti si taglia l'unico
    collegamento tra quartieri pur non essendo «la via» vietata nel nome.
    """
    if not forbidden:
        return
    to_drop: set[tuple[int, int]] = set()
    for u, edges in adj.items():
        if u not in nodes:
            continue
        lo_u, la_u = nodes[u]
        for v, _w in list(edges):
            if v not in nodes or u >= v:
                continue
            lo_v, la_v = nodes[v]
            elen = haversine_m(la_u, lo_u, la_v, lo_v)
            if elen > max_edge_len_m:
                continue
            for fla, flo, tla, tlo, buf in forbidden:
                d = min_dist_segment_segment_m(la_u, lo_u, la_v, lo_v, fla, flo, tla, tlo)
                if d <= buf:
                    to_drop.add((u, v))
                    break
    for u, v in to_drop:
        adj[u] = [(n, wt) for n, wt in adj[u] if n != v]
        adj[v] = [(n, wt) for n, wt in adj[v] if n != u]


def way_centroid_lonlat(
    nlist: list[Any],
    nodes: dict[int, tuple[float, float]],
) -> tuple[float, float] | None:
    coords: list[tuple[float, float]] = []
    for n in nlist:
        ni = int(n)
        if ni in nodes:
            coords.append(nodes[ni])
    if not coords:
        return None
    mx = sum(c[0] for c in coords) / len(coords)
    my = sum(c[1] for c in coords) / len(coords)
    return (mx, my)


def rule_triggers_exclusion(
    tags: dict[str, str],
    rule: dict[str, Any],
    centroid: tuple[float, float] | None,
) -> bool:
    ref_u = (tags.get("ref") or "").upper()
    name_l = tags_name_search_blob(tags)
    has_geo = "centroid_lat_gte" in rule or "centroid_lat_lte" in rule

    if has_geo:
        tag_ok = True
        has_tag = False
        if "ref_contains" in rule:
            has_tag = True
            tag_ok = tag_ok and (rule["ref_contains"].upper() in ref_u)
        if "name_contains" in rule:
            has_tag = True
            tag_ok = tag_ok and (rule["name_contains"].lower() in name_l)
        if "name_contains_all" in rule:
            has_tag = True
            parts = rule["name_contains_all"]
            tag_ok = tag_ok and all(str(p).lower() in name_l for p in parts)
        if not has_tag or not tag_ok or centroid is None:
            return False
        lat = centroid[1]
        if "centroid_lat_gte" in rule and lat < float(rule["centroid_lat_gte"]):
            return False
        if "centroid_lat_lte" in rule and lat > float(rule["centroid_lat_lte"]):
            return False
        return True

    if "ref_contains" in rule and rule["ref_contains"].upper() in ref_u:
        return True
    if "name_contains" in rule and rule["name_contains"].lower() in name_l:
        return True
    if "name_contains_all" in rule:
        parts = rule["name_contains_all"]
        if all(str(p).lower() in name_l for p in parts):
            return True
    return False


def way_excluded(
    tags: dict[str, str],
    rules: list[dict[str, Any]],
    centroid: tuple[float, float] | None,
) -> bool:
    return any(rule_triggers_exclusion(tags, rule, centroid) for rule in rules)


def collect_excluded_way_segment_pairs(
    osm: dict[str, Any],
    nodes: dict[int, tuple[float, float]],
    exclude_rules: list[dict[str, Any]],
    exclude_way_ids: set[int],
) -> set[tuple[int, int]]:
    """Coppie di nodi consecutive su way esclusi (regole + id OSM).

    Serve a togliere dal grafo anche archi aggiunti da *altri* way che ripetono
    la stessa geometria (stesso segmento tra due nodi), altrimenti Dijkstra
    può ancora «attraversare» una via esclusa.
    """
    out: set[tuple[int, int]] = set()
    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        wid = el.get("id")
        nlist = el.get("nodes") or []
        if len(nlist) < 2:
            continue
        tags = el.get("tags") or {}
        centroid = way_centroid_lonlat(nlist, nodes)
        by_id = wid is not None and int(wid) in exclude_way_ids
        by_rule = way_excluded(tags, exclude_rules, centroid)
        if not (by_id or by_rule):
            continue
        for i in range(len(nlist) - 1):
            a, b = int(nlist[i]), int(nlist[i + 1])
            if a not in nodes or b not in nodes:
                continue
            if a > b:
                a, b = b, a
            out.add((a, b))
    return out


def strip_undirected_edges_on_node_pairs(
    adj: dict[int, list[tuple[int, float]]],
    pairs: set[tuple[int, int]],
) -> None:
    for a, b in pairs:
        if a in adj:
            adj[a] = [(n, wt) for n, wt in adj[a] if n != b]
        if b in adj:
            adj[b] = [(n, wt) for n, wt in adj[b] if n != a]


def way_is_dedicated_cycle_infrastructure(tags: dict[str, str]) -> bool:
    """Pista / corredo ciclabile dedicato in OSM (non usato per l’itinerario critico)."""
    hw = (tags.get("highway") or "").strip()
    if hw in ("cycleway", "bicycle_road"):
        return True
    if hw == "path":
        bc = (tags.get("bicycle") or "").strip().lower()
        return bc in ("designated", "official")
    return False


def collect_dedicated_cycle_infrastructure_segment_pairs(
    osm: dict[str, Any],
    nodes: dict[int, tuple[float, float]],
) -> set[tuple[int, int]]:
    """Segmenti OSM da non percorrere nemmeno se duplicati su altro `highway`."""
    out: set[tuple[int, int]] = set()
    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        if not way_is_dedicated_cycle_infrastructure(tags):
            continue
        nlist = el.get("nodes") or []
        if len(nlist) < 2:
            continue
        for i in range(len(nlist) - 1):
            a, b = int(nlist[i]), int(nlist[i + 1])
            if a not in nodes or b not in nodes:
                continue
            if a > b:
                a, b = b, a
            out.add((a, b))
    return out


def collect_dedicated_cycle_infrastructure_node_ids(osm: dict[str, Any]) -> set[int]:
    """Nodi su infrastruttura ciclabile dedicata (vietati per lo snap)."""
    out: set[int] = set()
    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        if not way_is_dedicated_cycle_infrastructure(tags):
            continue
        for n in el.get("nodes") or []:
            out.add(int(n))
    return out


def collect_forbidden_snap_nodes(osm: dict[str, Any], cfg: dict[str, Any]) -> set[int]:
    """Nodi OSM su cui non fare snap (incroci / tratti «vietati» anche se il grafo usa altri archi)."""
    r = cfg["routing"]
    out: set[int] = set()
    id_set = {int(x) for x in (r.get("exclude_osm_way_ids") or [])}
    subs = [str(s).lower() for s in (r.get("forbidden_snap_name_substrings") or []) if s]

    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        wid = el.get("id")
        nlist = el.get("nodes") or []
        if not nlist:
            continue
        tags = el.get("tags") or {}
        by_id = wid is not None and int(wid) in id_set
        blob = tags_name_search_blob(tags) if subs else ""
        by_name = bool(subs) and "highway" in tags and any(s in blob for s in subs)
        if not (by_id or by_name):
            continue
        for n in nlist:
            out.add(int(n))
    out |= collect_dedicated_cycle_infrastructure_node_ids(osm)
    return out


def highway_allowed(tags: dict[str, str], allow_re: re.Pattern[str]) -> bool:
    hw = (tags.get("highway") or "").strip()
    if not hw:
        return False
    if way_is_dedicated_cycle_infrastructure(tags):
        return False
    return allow_re.match(hw) is not None


def oneway_mode(tags: dict[str, str]) -> str:
    """'forward' = solo ordine nodi OSM, 'backward' = inverti, 'both' = bidirezionale."""
    ow = (tags.get("oneway") or "").strip().lower()
    if ow in ("yes", "true", "1"):
        return "forward"
    if ow == "-1":
        return "backward"
    if ow in ("no", "false", "0", "reversible", "alternating"):
        return "both"
    if ow in ("bicycle", "motor_vehicle"):
        return "both"
    return "both"


def build_graph(
    osm: dict[str, Any],
    cfg: dict[str, Any],
) -> tuple[dict[int, tuple[float, float]], dict[int, list[tuple[int, float]]]]:
    routing = cfg["routing"]
    allow_re = re.compile(routing["highway_allow_regex"])
    exclude_rules = routing.get("exclude_ways") or []
    exclude_way_ids = {int(x) for x in (routing.get("exclude_osm_way_ids") or [])}
    respect_oneway = bool(routing.get("respect_oneway", False))

    nodes: dict[int, tuple[float, float]] = {}
    for el in osm.get("elements", []):
        if el.get("type") != "node":
            continue
        nid = el.get("id")
        lat, lon = el.get("lat"), el.get("lon")
        if nid is None or lat is None or lon is None:
            continue
        nodes[int(nid)] = (float(lon), float(lat))

    adj: dict[int, list[tuple[int, float]]] = {}

    def add_edge(u: int, v: int, weight: float) -> None:
        adj.setdefault(u, []).append((v, weight))

    for el in osm.get("elements", []):
        if el.get("type") != "way":
            continue
        wid = el.get("id")
        if wid is not None and int(wid) in exclude_way_ids:
            continue
        tags = el.get("tags") or {}
        if not highway_allowed(tags, allow_re):
            continue
        nlist = el.get("nodes") or []
        if len(nlist) < 2:
            continue
        centroid = way_centroid_lonlat(nlist, nodes)
        if way_excluded(tags, exclude_rules, centroid):
            continue
        ow = oneway_mode(tags) if respect_oneway else "both"
        for i in range(len(nlist) - 1):
            a, b = int(nlist[i]), int(nlist[i + 1])
            if a not in nodes or b not in nodes:
                continue
            la, lo = nodes[a][1], nodes[a][0]
            lb, lo2 = nodes[b][1], nodes[b][0]
            w = haversine_m(la, lo, lb, lo2)
            if w <= 0:
                continue
            if not respect_oneway or ow == "both":
                add_edge(a, b, w)
                add_edge(b, a, w)
            elif ow == "forward":
                add_edge(a, b, w)
            elif ow == "backward":
                add_edge(b, a, w)

    # Nessun arco che coincide con piste / corredo ciclabile dedicato in OSM.
    dedicated_pairs = collect_dedicated_cycle_infrastructure_segment_pairs(osm, nodes)
    strip_undirected_edges_on_node_pairs(adj, dedicated_pairs)

    strip_pairs = collect_excluded_way_segment_pairs(
        osm, nodes, exclude_rules, exclude_way_ids
    )
    strip_undirected_edges_on_node_pairs(adj, strip_pairs)

    geom_rules: list[dict[str, Any]] = list(routing.get("exclude_geometry_near_names") or [])
    id_buf = float(routing.get("exclude_osm_way_geometry_buffer_m", 0) or 0)
    if geom_rules or (exclude_way_ids and id_buf > 0):
        forbid = collect_geometry_buffer_segments(
            osm, nodes, geom_rules, exclude_way_ids, id_buf
        )
        max_e = float(routing.get("exclude_geometry_max_edge_length_m", 75))
        strip_edges_near_forbidden_corridors(adj, nodes, forbid, max_e)

    used = set(adj.keys())
    for es in adj.values():
        for v, _ in es:
            used.add(v)
    nodes_out = {nid: nodes[nid] for nid in used if nid in nodes}
    adj = {nid: es for nid, es in adj.items() if es}

    return nodes_out, adj


def nearest_node(
    nodes: dict[int, tuple[float, float]],
    lon: float,
    lat: float,
    max_m: float,
    forbidden: set[int] | None = None,
) -> int:
    """Sceglie il nodo più vicino entro max_m; se `forbidden`, prova i successivi per distanza."""
    forbid = forbidden or set()
    ranked: list[tuple[float, int]] = []
    for nid, (nlo, nla) in nodes.items():
        d = haversine_m(lat, lon, nla, nlo)
        if d <= max_m:
            ranked.append((d, nid))
    ranked.sort(key=lambda t: t[0])
    for d, nid in ranked:
        if nid not in forbid:
            return nid
    best_id: int | None = None
    best_d = float("inf")
    for nid, (nlo, nla) in nodes.items():
        if nid in forbid:
            continue
        d = haversine_m(lat, lon, nla, nlo)
        if d < best_d:
            best_d = d
            best_id = nid
    if best_id is None:
        raise SystemExit(
            f"Nessun nodo grafo disponibile vicino a ({lon:.6f}, {lat:.6f}) "
            "(tutti vietati per snap?)."
        )
    if best_d > max_m:
        raise SystemExit(
            f"Nessun nodo grafo entro {max_m:.0f} m da ({lon:.6f}, {lat:.6f}) "
            "escludendo i nodi vietati per snap; allarga route.max_snap_m o "
            "riduci routing.forbidden_snap_name_substrings / exclude_osm_way_ids."
        )
    return best_id


def dijkstra(
    adj: dict[int, list[tuple[int, float]]],
    start: int,
    goal: int,
) -> list[int] | None:
    """Percorso minimo su pesi non negativi (Dijkstra, coda a priorità)."""
    dist: dict[int, float] = {start: 0.0}
    prev: dict[int, int] = {}
    pq: list[tuple[float, int]] = [(0.0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float("inf")):
            continue
        if u == goal:
            break
        for v, w in adj.get(u, ()):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if goal not in dist:
        return None
    path = [goal]
    cur = goal
    while cur != start:
        if cur not in prev:
            return None
        cur = prev[cur]
        path.append(cur)
    path.reverse()
    return path


def node_path_to_lonlat(
    path: list[int],
    nodes: dict[int, tuple[float, float]],
) -> list[list[float]]:
    return [[nodes[nid][0], nodes[nid][1]] for nid in path]


def stitch_paths(parts: list[list[list[float]]]) -> list[list[float]]:
    if not parts:
        return []
    out = list(parts[0])
    for nxt in parts[1:]:
        if not nxt:
            continue
        if out and haversine_m(out[-1][1], out[-1][0], nxt[0][1], nxt[0][0]) < 2.0:
            out.extend(nxt[1:])
        else:
            out.extend(nxt)
    return out


def route_leg(
    leg: dict[str, Any],
    nodes: dict[int, tuple[float, float]],
    adj: dict[int, list[tuple[int, float]]],
    max_snap_m: float,
    snap_forbidden: set[int] | None = None,
) -> list[list[float]]:
    wps = leg.get("waypoints") or []
    if len(wps) < 2:
        raise SystemExit(f"Leg {leg.get('id')!r}: servono almeno 2 waypoint.")
    segments: list[list[list[float]]] = []
    for i in range(len(wps) - 1):
        a, b = wps[i], wps[i + 1]
        la, lo = float(a["lon"]), float(a["lat"])
        lb, lo2 = float(b["lon"]), float(b["lat"])
        na = nearest_node(nodes, la, lo, max_snap_m, snap_forbidden)
        nb = nearest_node(nodes, lb, lo2, max_snap_m, snap_forbidden)
        path = dijkstra(adj, na, nb)
        if path is None:
            raise SystemExit(
                f"Leg {leg.get('id')!r}: nessun percorso tra "
                f"({la:.5f},{lo:.5f}) e ({lb:.5f},{lo2:.5f}) sul grafo. "
                "Aggiungi un waypoint intermedio o allarga il bbox / i tipi highway."
            )
        if len(path) < 2:
            continue
        segments.append(node_path_to_lonlat(path, nodes))
    if not segments:
        raise SystemExit(
            f"Leg {leg.get('id')!r}: tutti i segmenti tra waypoint hanno lunghezza nulla "
            "(waypoint duplicati o snap sullo stesso nodo)."
        )
    return stitch_paths(segments)


def main() -> None:
    if len(sys.argv) != 4:
        print(
            "Uso: build-critical-corridor-cosenza-axis.py "
            "<critical-corridor.json> <schools-poi.geojson> <data.geojson>",
            file=sys.stderr,
        )
        sys.exit(1)
    cfg_path, schools_path, outp = sys.argv[1], sys.argv[2], sys.argv[3]

    cfg = load_config(cfg_path)
    route_cfg = cfg["route"]
    max_snap = float(route_cfg.get("max_snap_m", 200))
    simplify_m = float(route_cfg.get("simplify_min_vertex_spacing_m", 6))
    algo = route_cfg.get("algorithm", "dijkstra")
    if algo.lower() != "dijkstra":
        print(f"Avviso: algoritmo {algo!r} ignorato, uso dijkstra.", file=sys.stderr)

    env_routing = os.environ.get("CRITICAL_ROUTING_JSON")
    if env_routing and os.path.isfile(env_routing):
        with open(env_routing) as f:
            osm = json.load(f)
    else:
        osm = fetch_overpass_routing(cfg)

    nodes, adj = build_graph(osm, cfg)
    if len(adj) < 100:
        print("Grafo troppo piccolo: controlla bbox e filtri highway.", file=sys.stderr)
        sys.exit(3)

    snap_forbidden = collect_forbidden_snap_nodes(osm, cfg)

    line_coords: list[list[list[float]]] = []
    for leg in cfg["legs"]:
        raw = route_leg(leg, nodes, adj, max_snap, snap_forbidden)
        line_coords.append(simplify(raw, simplify_m))
    line_coords = [ln for ln in line_coords if len(ln) >= 2]
    if not line_coords:
        sys.exit("Nessuna geometria valida dopo il routing.")

    length_km = sum(chain_len_m(lc) for lc in line_coords) / 1000
    n_vert = sum(len(lc) for lc in line_coords)
    if len(line_coords) == 1:
        geometry: dict[str, Any] = {"type": "LineString", "coordinates": line_coords[0]}
    else:
        geometry = {"type": "MultiLineString", "coordinates": line_coords}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    meta = cfg.get("metadata") or {}

    with open(schools_path) as f:
        n_schools = len(
            [
                x
                for x in json.load(f).get("features", [])
                if (x.get("geometry") or {}).get("type") == "Point"
            ]
        )

    src_tpl = meta.get("critical_segments_source_template") or (
        "OpenStreetMap: grafo highway nel bbox, percorso {algorithm} tra waypoint; "
        "semplificazione ≥{simplify_m} m. ODbL."
    )
    crit_src = src_tpl.format(algorithm="dijkstra", simplify_m=int(simplify_m))

    props_common = {
        "note": meta.get("note", ""),
        "critical_segments_generated": now,
        "critical_segments_source": crit_src,
        "critical_corridor_config": os.path.basename(cfg_path),
    }

    feat = {
        "type": "Feature",
        "properties": {
            "kind": "critical_segment",
            "name": meta.get("name", "Itinerario critico"),
            "risk": meta.get("risk", ""),
            "notes": (
                f"{len(line_coords)} tratte (config), ~{length_km:.2f} km, {n_vert} vertici; "
                f"routing Dijkstra su OSM (n≈{n_schools} POI scuola). "
                "Rigenera: scripts/update-critical-segments.sh."
            ),
            "osm_filter": meta.get("osm_filter", "routing_graph+dijkstra"),
            "length_km": round(length_km, 2),
        },
        "geometry": geometry,
    }

    fc = {
        "type": "FeatureCollection",
        "name": "heatmap-demo-overlays",
        "properties": props_common,
        "features": [feat],
    }
    with open(outp, "w") as f:
        json.dump(fc, f, indent=2)
    print(outp, "OK —", n_vert, "vertici,", len(line_coords), "tratte,", f"{length_km:.2f} km")


if __name__ == "__main__":
    main()

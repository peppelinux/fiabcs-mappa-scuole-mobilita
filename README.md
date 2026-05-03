# Heatmap mobilità sostenibile scolastica (FIAB Cosenzaciclabile)

Mappa web statica: articolo in Markdown (`content.md`), mappa Leaflet (`render.js`), dati GeoJSON in `data/`.

## Avvio in locale

`render.js` carica `content.md` e i GeoJSON con **`fetch()`**: servono URL **HTTP/HTTPS**, non aprire `index.html` come file `file://` (il browser bloccherebbe le richieste).

Dalla radice del repository:

```bash
python3 -m http.server 8080
```

Poi nel browser: **http://localhost:8080/** (o la porta scelta).

## Aggiornare i dati (rete richiesta)

Esegui dalla radice del progetto:

| Cosa | Script |
|------|--------|
| Asse prioritario in `data.geojson` | `./scripts/update-critical-segments.sh` |
| POI scuole in `data/schools-poi.geojson` | `./scripts/fetch-schools-poi.sh` |
| Layer ciclo/pedonale OSM | `./scripts/fetch-osm-data.sh` |

Opzionale per Overpass sovraccarico: `OVERPASS_URL=https://overpass.kumi.systems/api/interpreter ./scripts/update-critical-segments.sh`

Dopo modifiche alla metodologia, aggiorna anche **`content.md`**.

## File principali

- **`index.html`** — pagina, legenda, favicon, script
- **`styles.css`** — layout e tema FIAB
- **`content.md`** — testo dell’articolo (metodologia, fonti, note legali)
- **`data.geojson`** — linea asse prioritario mobilità sostenibile
- **`vendor/leaflet-heat.js`** — Leaflet.heat con patch Canvas `willReadFrequently`

## Licenze

- **Materiale originale** del repository (testi, `render.js`, `styles.css`, `index.html` del progetto, script dedicati, `README.md`): [**Creative Commons Attribuzione 4.0 (CC BY 4.0)**](https://creativecommons.org/licenses/by/4.0/deed.it) — vedi il file **`LICENSE`** nella radice.
- **Dati OSM / GeoJSON** dagli script: [**ODbL**](https://wiki.openstreetmap.org/wiki/OpenStreetMap_License) (come da fonti in pagina).
- **Librerie e servizi esterni**: restano alle licenze dei rispettivi progetti (tabella in `content.md`, sezione *Fonti, licenze e repository*).

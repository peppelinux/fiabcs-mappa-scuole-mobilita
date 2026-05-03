# Mappa scuole e mobilità sicura — FIAB Cosenzaciclabile

Applicazione web statica: testo in Markdown (`content.md`), mappa Leaflet (`render.js`), dati GeoJSON in `data/`. La pagina principale è pensata per **famiglie**, **scuole** e **amministratori locali**; questo README raccoglie **metodologia**, **pipeline dati** e **riferimenti tecnici** per sviluppatori e contributori.

**Logo e favicon:** immagine del profilo dalla pagina Facebook [FIAB Cosenza Ciclabile](https://www.facebook.com/cosenzaciclabile/?locale=it_IT), salvata in `assets/logo-cosenzaciclabile.png` per uso locale. `favicon.ico`, `favicon.svg` (PNG 32×32 incorporato), `assets/favicon-32.png` e `apple-touch-icon.png` sono derivati da quella immagine (rigenerabili con ImageMagick, vedi sotto).

```bash
convert assets/logo-cosenzaciclabile.png -define icon:auto-resize=64,48,32,16 favicon.ico
convert assets/logo-cosenzaciclabile.png -resize 180x180 apple-touch-icon.png
convert assets/logo-cosenzaciclabile.png -resize 32x32 assets/favicon-32.png
# favicon.svg: incorporare base64 di assets/favicon-32.png oppure aggiornare a mano
```

## Avvio in locale

`render.js` carica `content.md` e i GeoJSON con **`fetch()`**: servono URL **HTTP/HTTPS**, non aprire `index.html` come `file://` (il browser bloccherebbe le richieste).

Dalla radice del repository:

```bash
python3 -m http.server 8080
```

Poi nel browser: **http://localhost:8080/** (o la porta scelta).

## Aggiornare i dati (rete richiesta)

Esegui dalla radice del progetto:

| Cosa | Script |
|------|--------|
| Itinerario critico in `data.geojson` | `./scripts/update-critical-segments.sh` |
| POI scuole in `data/schools-poi.geojson` | `./scripts/fetch-schools-poi.sh` |
| Layer ciclo/pedonale OSM | `./scripts/fetch-osm-data.sh` |

Opzionale se Overpass è sovraccarico: `OVERPASS_URL=https://overpass.kumi.systems/api/interpreter ./scripts/update-critical-segments.sh`

Dopo modifiche alla metodologia, aggiornare **`content.md`** (messaggio pubblico) e questo README (dettaglio tecnico).

## File principali

- **`index.html`** — struttura pagina, legenda, script
- **`styles.css`** — layout e tema FIAB
- **`content.md`** — testo per il pubblico (obiettivi, utilità, criteri in sintesi)
- **`data.geojson`** — Itinerario critico (`kind=critical_segment`, LineString o MultiLineString)
- **`vendor/leaflet-heat.js`** — Leaflet.heat con patch Canvas `willReadFrequently`

---

## Metodologia tecnica (buffer 300 m)

1. **Georeferenziazione delle scuole** (sedi di istituti comprensivi, secondarie di I e II grado, licei e istituti tecnici/professionali).
2. **Buffer circolare di 300 m** attorno a ciascuna sede, coerente con distanze tipiche a piedi/in bici e con letteratura su esposizione al traffico in prossimità delle scuole.
3. **Rilevazione o desk analysis** delle strade intercettate dal buffer, con criteri tra cui:
   - assenza o **discontinuità** di **piste / corsie ciclabili** protette e di **percorsi pedonali** sicuri e continui;
   - **velocità** e volume veicolare elevati;
   - **intersezioni** complesse, mancanza di **attraversamenti** sicuri e tempi di attesa eccessivi;
   - **soste** invasive, **marciapiedi** assenti o ostruiti, **strettoie**;
   - **qualità dell’aria** e comfort (es. pendenza eccessiva, fondo stradale degradato per chi pedala).

Rappresentazione: **POI scuole** da OpenStreetMap, ciascuno con **cerchio 300 m**, **itinerario critico** in `data.geojson`, **heatmap**, overlay **rete ciclabile**, **pedonalità**, **Open-Meteo** (qualità aria).

### Heatmap (layer termico): scopo e limiti

La heatmap **non** è una misura strumentale di traffico in tempo reale né un modello di emissioni: sintetizza **vicinanza e numero delle sedi scolastiche** (e l’intensità legata ai buffer di 300 m) per una **geografia delle priorità**. Zone più “calde” suggeriscono dove intensificare **comunicazione, educazione stradale e progettazione partecipata**; non sostituisce conteggi veicolari o piani ufficiali.

**Calcolo (client, `render.js`):** per ogni scuola, intensità da peso base + contributi delle altre sedi entro **600 m** (e ulteriore contributo se entro **300 m**); punti intermedi tra coppie di scuole a distanza **inferiore a 600 m** con rafforzamento se altre scuole cadono entro i due buffer; vertici dell’**itinerario critico** con intensità costante **0,35**; poi **Leaflet.heat** (`radius` 44, `blur` 24, `max` 0,92). Spiegazione divulgativa e motivazione delle valutazioni in **`content.md`** (sezione *Metodologia della heatmap*).

Implementazione: **Leaflet.heat** su punti derivati dalle sedi (vedi `render.js`).

### Classificazione POI scuole (`data/schools-poi.geojson`)

Punti dalla **bbox** del progetto (`amenity=school`, `kindergarten`, `college` su OSM), categorizzati per la mappa:

| Categoria | Significato approssimativo | Come è assegnata |
|-----------|---------------------------|------------------|
| **Infanzia / asilo** | `amenity=kindergarten` o nome con infanzia / asilo / materna | Tag OSM + nome |
| **Primaria (elementare)** | Scuola primaria / elementare dal nome | Euristiche sul `name` |
| **I grado (media)** | Secondaria di primo grado / media dal nome | Euristiche sul `name` |
| **II grado (superiori)** | Licei, ITS, ITC, IIS, `amenity=college`, ecc. | Tag + nome (es. sigle I.T.C., ITIS) |
| **Istituto comprensivo** | Nomi con “comprensivo” / I.C. | Nome |
| **Non classificate** | `amenity=school` senza indizi sufficienti nel nome | Da **completare in OSM** (es. `isced:level`, `grades`, `operator`) |

Le classificazioni sono **automatiche e possono essere imprecise**; la fonte di verità resta la scheda OSM (link nel popup). Aggiornamento POI: **`./scripts/fetch-schools-poi.sh`**.

I POI **senza nome** in OSM hanno la proprietà **`poi_uid`** (`school-poi-anon-<tipo OSM>-<id OSM>`), utile in editor o con `jq`, es.: `jq '.features[] | select(.properties.poi_uid)' data/schools-poi.geojson`. (Non è mostrato nel popup della mappa pubblica.)

### Itinerario critico e layer OSM (`data.geojson`, `data/osm-*.geojson`)

Il file `data.geojson` contiene l’**itinerario critico** (LineString o **MultiLineString**): il tracciato segue il **grafo stradale OSM** nel bbox definito in **`config/critical-corridor.json`**; tra i waypoint configurati per ogni «gamba» si calcola il percorso di **costo minimo (algoritmo di Dijkstra)** su archi con peso = lunghezza in metri (nessuna corda arbitraria fuori strada). Vie d’interesse, filtri `highway`, esclusioni (`exclude_ways`: anche regole con **`centroid_lat_gte`** / `centroid_lat_lte` per escludere un toponimo solo in una zona) e waypoint si **modificano solo nel JSON**. Rigenerazione: **`./scripts/update-critical-segments.sh`** (variabile opzionale `CRITICAL_CORRIDOR_CONFIG` per un file di config alternativo).

- **`data/osm-cycleways.geojson`** — piste dedicate, `cycleway`, `bicycle_road` (estratto bbox OSM).
- **`data/osm-pedestrian.geojson`** — `highway=pedestrian`, attraversamenti `footway=crossing`.
- **Qualità dell’aria** — tre coordinate con API **Open-Meteo** (modello europeo su griglia; non misure ARPA al suolo).

Per **traffico veicolare** omogeneo a livello locale non c’è oggi un dataset aperto unico: integrare con fonti comunali/regionali dove disponibili.

---

## Fonti, licenze e repository

| Tema | Cosa usiamo | Licenza / note | Repository o endpoint |
|------|-------------|----------------|------------------------|
| Carta di base | Tile **OpenStreetMap** | [ODbL 1.0](https://wiki.openstreetmap.org/wiki/OpenStreetMap_License) | [openstreetmap.org](https://www.openstreetmap.org/) |
| Rete ciclabile e pedonalità | Geometrie OSM, **Overpass** → GeoJSON locale | ODbL | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| Rigenerazione estratti OSM | `scripts/fetch-osm-data.sh` | — | `curl` verso `overpass-api.de` |
| Itinerario critico | `config/critical-corridor.json` + `update-critical-segments.sh` | ODbL | Grafo OSM nel bbox; Dijkstra; esclusioni da config |
| POI scuole | `data/schools-poi.geojson` + `scripts/fetch-schools-poi.sh` | ODbL | Overpass; classificazione in script (non ufficiale MIUR) |
| Qualità dell’aria | **Open-Meteo** Air Quality API | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [open-meteo.com](https://open-meteo.com/) |
| Mappa | **Leaflet** 1.9 | BSD 2-Clause | [Leaflet](https://github.com/Leaflet/Leaflet) |
| Basemap satellite | **Esri World Imagery** | [Condizioni Esri](https://www.esri.com/legal/terms/full-master-agreement) | Living Atlas |
| Testi e codice originale | Repository | [**CC BY 4.0**](https://creativecommons.org/licenses/by/4.0/deed.it) | File **`LICENSE`** |
| Markdown → HTML | **Marked** | Licenza Marked | [markedjs/marked](https://github.com/markedjs/marked) |
| Heatmap | **Leaflet.heat** in `vendor/` | Licenza progetto | [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) |
| Catalogo dataset Italia | **dati.gov.it** | Varie | [dati.gov.it](https://dati.gov.it/) |

**Attribuzione OSM:** © [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.

**Manuale logo FIAB:** [Materiali grafici FIAB Italia](https://fiabitalia.it/fiab/informazioni/materiali-grafici/).

---

## Licenze (sintesi)

- **Materiale originale** del repository (testi, `render.js`, `styles.css`, `index.html` del progetto, script dedicati, `README.md`): [**CC BY 4.0**](https://creativecommons.org/licenses/by/4.0/deed.it) — dettaglio in **`LICENSE`**.
- **Dati OSM / GeoJSON** dagli script: [**ODbL**](https://wiki.openstreetmap.org/wiki/OpenStreetMap_License).
- **Librerie e servizi esterni**: licenze dei rispettivi progetti (tabella sopra).

## Note legali

Marchi **FIAB** in chiave di proposta tematica per gruppi locali; per uso ufficiale del logo: [materiali grafici FIAB Italia](https://fiabitalia.it/fiab/informazioni/materiali-grafici/).

Progetto di mappatura partecipativa per **FIAB Cosenzaciclabile**, nell’ambito della **Federazione Italiana Ambiente e Bicicletta (FIAB)** che individua, nel raggio di **300 metri** dalle scuole **elementari, medie e superiori**, i contesti in cui la **mobilità sostenibile** (spostamenti sicuri **a piedi** e **in bicicletta**, accessibilità, qualità dell’aria e dell’ambiente urbano) risulta **non adeguata** o **degradata**, con particolare attenzione a **sicurezza e salute** di **bambine, bambini e adolescenti**.

---

## Perimetro territoriale

L’area considerata copre il tessuto urbano e periurbano di **Cosenza**, **Rende** (inclusa la frazione di **Andreotta** e i collegamenti con Arcavacata / campus universitario dove rilevante per gli spostamenti scolastici) e i principali assi che collegano le sedi scolastiche alla rete ciclopedonale.

---

## Metodologia (buffer 300 m)

1. **Georeferenziazione delle scuole** (sedi di istituti comprensivi, secondarie di I e II grado, licei e istituti tecnici/professionali).
2. **Buffer circolare di 300 m** attorno a ciascuna sede, coerente con distanze tipiche a piedi/in bici e con letteratura su esposizione al traffico in prossimità delle scuole.
3. **Rilevazione o desk analysis** delle strade intercettate dal buffer, con criteri tra cui (mobilità sostenibile nel suo complesso):
   - assenza o **discontinuità** di **piste / corsie ciclabili** protette e di **percorsi pedonali** sicuri e continui;
   - **velocità** e volume veicolare elevati;
   - **intersezioni** complesse, mancanza di **attraversamenti** sicuri e tempi di attesa eccessivi;
   - **soste** invasive, **marciapiedi** assenti o ostruiti, **strettoie**;
   - **qualità dell’aria** e comfort (es. pendenza eccessiva, fondo stradale degradato per chi pedala).

I risultati sono rappresentati sulla **mappa interattiva**: **POI scuole reali** da OpenStreetMap (vedi sotto), ciascuno con **cerchio di 300 m**, **asse prioritario per la mobilità sostenibile** (linea in `data.geojson`), **layer termico** (heatmap; significato sotto) e overlay su **rete ciclabile**, **pedonalità** e **qualità dell’aria**.

### Heatmap (layer termico): scopo e lettura

La heatmap **non** è una misura strumentale di traffico in tempo reale né un modello di emissioni: sintetizza sulla mappa la **vicinanza e il numero delle sedi scolastiche** (e l’intensità legata ai buffer di 300 m) per rendere immediata la **geografia delle priorità**.

**Indicazioni d’uso:** le zone con intensità maggiore (da blu FIAB verso giallo, arancio e rosso) indicano territori in cui è **urgente sensibilizzare e promuovere iniziative di mobilità sostenibile** — dal confronto con istituzioni e comunità scolastiche a interventi su percorsi sicuri, moderazione del traffico, aria e organizzazione degli orari di accesso alle scuole.

**Interpretazione:** intensità elevate mettono in luce **rischi** e **insostenibilità evidenti** in presenza di **elevate concentrazioni di persone** (studenti, famiglie, personale) e **veicoli urbani** nelle **fasce orarie critiche** (entrate/uscite, picchi di spostamento locale). Serve a **prioritizzare comunicazione, educazione stradale e progettazione partecipata**, non a sostituire conteggi veicolari, rilievi di stazione o piani ufficiali di traffico.

### Scuole OSM (`data/schools-poi.geojson`)

I punti sono scaricati dalla stessa **bbox** del progetto (`amenity=school`, `kindergarten`, `college` su OpenStreetMap) e **suddivisi in categorie** per la mappa e il pannello livelli:

| Categoria | Significato approssimativo | Come è assegnata |
|-----------|---------------------------|-------------------|
| **Infanzia / asilo** | `amenity=kindergarten` o nome con infanzia / asilo / materna | Tag OSM + nome |
| **Primaria (elementare)** | Scuola primaria / elementare dal nome | Euristiche sul `name` |
| **I grado (media)** | Secondaria di primo grado / media dal nome | Euristiche sul `name` |
| **II grado (superiori)** | Licei, ITS, ITC, IIS, `amenity=college`, ecc. | Tag + nome (es. sigle I.T.C., ITIS) |
| **Istituto comprensivo** | Nomi con “comprensivo” / I.C. | Nome |
| **Non classificate** | `amenity=school` senza indizi sufficienti nel nome | Da **completare in OSM** (es. `isced:level`, `grades`, `operator`) |

Le classificazioni sono **automatiche e possono essere imprecise**: la fonte di verità resta la scheda OSM (link nel popup). Per aggiornare i POI: **`./scripts/fetch-schools-poi.sh`**.

I POI **senza nome** in OSM hanno la proprietà **`poi_uid`** (`school-poi-anon-<tipo OSM>-<id OSM>`), utile per filtrarli in editor o con `jq`, es.: `jq '.features[] | select(.properties.poi_uid)' data/schools-poi.geojson`.

Il file `data.geojson` contiene **un asse prioritario** (mobilità sostenibile) come **LineString** lungo l’arteria cittadina **ingresso autostradale / Piazza Maestri del Lavoro**, **Via Pasquale Rossi**, **Viale della Repubblica** e **Via Roma** (geometrie **OpenStreetMap** dei `way` con questi toponimi nel bbox progetto, filtrati sul **tessuto di Cosenza** per escludere omonimi lontani). È un **indicatore di contesto** (flussi, attraversamenti, continuità ciclopedonale da analizzare), non solo “mancanza di piste”. I segmenti vengono **uniti** dove le estremità coincidono (≤25 m; fino a 300 m per collegare due tratti dello stesso asse, es. salti tra way Via Roma). **Non** si usa più il merge automatico su tutta la rete `primary|secondary|tertiary` comunale (evita tratti lunghi in **area boschiva** o periurbana non pertinente). Nel centro denso il tracciato **interseca o costeggia** i **buffer 300 m** di più sedi scolastiche del progetto (contiguità lungo l’asse). Per rigenerare: **`./scripts/update-critical-segments.sh`** (opzionale: `OVERPASS_URL=…`). Sulla mappa vengono caricati anche:

- **`data/osm-cycleways.geojson`** — piste ciclabili dedicate, strade con `cycleway` (corsia/tracciato) e `bicycle_road`, ricavati da **OpenStreetMap** (estratto bbox, timestamp nel file).
- **`data/osm-pedestrian.geojson`** — aree `highway=pedestrian` e attraversamenti `footway=crossing`.
- **Qualità dell’aria** — tre punti di riferimento (Cosenza, Rende, Arcavacata) con dati **orari correnti** dall’API **Open-Meteo** (modello europeo su griglia; non sono misure di stazione ARPA al suolo).

Per **traffico veicolare** (conteggi, flussi, congestione) non esiste oggi un dataset aperto omogeneo a livello locale: in fonti trovi collegamenti a cataloghi e iniziative dove cercare materiali aggiuntivi.

---

## Fonti, licenze e repository (trasparenza)

I dati e gli strumenti usati in questa pagina sono elencati qui con **link ai progetti o alle API** per consentire verifica e riuso.

| Tema | Cosa usiamo | Licenza / note | Repository o endpoint |
|------|-------------|----------------|------------------------|
| Carta di base | Tile **OpenStreetMap** | [ODbL 1.0](https://wiki.openstreetmap.org/wiki/OpenStreetMap_License) | [github.com/openstreetmap](https://github.com/openstreetmap), [openstreetmap.org](https://www.openstreetmap.org/) |
| Rete ciclabile e pedonalità | Geometrie e tag OSM, estratto **Overpass** in GeoJSON locale | ODbL (stesso database OSM) | [wiki Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), codice server: [github.com/drolbr/Overpass-API](https://github.com/drolbr/Overpass-API) |
| Rigenerazione estratti OSM | Script `scripts/fetch-osm-data.sh` | — | Esegue `curl` verso `overpass-api.de` e converte in `data/osm-*.geojson` |
| Asse prioritario mobilità sostenibile (linea su mappa) | `scripts/update-critical-segments.sh` + `build-critical-corridor-cosenza-axis.py` | ODbL | Overpass su way nominati (asse Maestri del Lavoro / Rossi / Repubblica / Roma); merge controllato |
| POI scuole (bbox progetto) | `data/schools-poi.geojson` + `scripts/fetch-schools-poi.sh` | ODbL | Stessa API Overpass; classificazione in script (non ufficiale MIUR) |
| Qualità dell’aria | **Open-Meteo** Air Quality API (`air-quality-api.open-meteo.com`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (attribuire Open-Meteo) | [open-meteo.com](https://open-meteo.com/), [github.com/open-meteo/open-meteo](https://github.com/open-meteo/open-meteo), [documentazione Air Quality](https://open-meteo.com/en/docs/air-quality-api) |
| Mappa interattiva | **Leaflet** 1.9 | BSD 2-Clause | [github.com/Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) |
| Basemap (scelta in mappa) | **OpenStreetMap** Standard | ODbL | [openstreetmap.org](https://www.openstreetmap.org/copyright) |
| Basemap | **Esri World Imagery** (ortofoto satellite) | [Condizioni d’uso Esri](https://www.esri.com/legal/terms/full-master-agreement) | [Living Atlas](https://livingatlas.arcgis.com/en/home/) (World Imagery) |
| Testi e codice originale del progetto | Repository (es. `content.md`, `render.js`, `styles.css`, script dedicati) | [**CC BY 4.0**](https://creativecommons.org/licenses/by/4.0/deed.it) | File **`LICENSE`**; attribuzione: progetto FIAB Cosenzaciclabile / contributori |
| Markdown → HTML | **Marked** | Licenza progetto Marked | [github.com/markedjs/marked](https://github.com/markedjs/marked) |
| Heatmap | **Leaflet.heat** 0.2.0 (copia in `vendor/leaflet-heat.js`, patch `willReadFrequently`) | Licenza progetto | [github.com/Leaflet/Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) |
| Catalogo dataset Italia | **dati.gov.it** | Varie (per dataset) | [dati.gov.it](https://dati.gov.it/) |
| Aria Europa (riferimento) | **EEA** — Agenzia europea per l’ambiente | Varie per prodotto | [eea.europa.eu](https://www.eea.europa.eu/), [dissemination](https://www.eea.europa.eu/data-and-maps/data) |
| Incidenti stradali UE (macro) | **European Road Safety Observatory** / dati connessi | Varie | [road-safety.transport.ec.europa.eu](https://road-safety.transport.ec.europa.eu/) |
| Open data ISTAT | Indicatori e dataset nazionali | Varie | [istat.it — dati](https://www.istat.it/it/dati-analisi-conoscenza-l-italia) |

**Attribuzione OSM (obbligatoria per riuso dei derivati):** © contribuenti [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.

**Manuale logo FIAB** (uso marchio, non dati): [Materiali grafici FIAB Italia](https://fiabitalia.it/fiab/informazioni/materiali-grafici/).

---

## Punti critici per sicurezza e salute (nei pressi della scuola)

| Rischio | Perché conta per bambine/i |
|--------|----------------------------|
| Traffico veloce e mixing con pedoni/ciclisti | Maggiore probabilità di urto; percezione di insicurezza che scoraggia spostamenti attivi (piedi e bici). |
| Attraversamenti insufficienti | Concentrazione di attraversamenti non protetti all’ingresso/uscita. |
| Assenza di rete ciclopedonale continua e sicura | Si costringe al marciapiede stretto o alla carreggiata in contesti non idonei all’età. |
| Qualità dell’aria | Esposizione a picchi di inquinanti nelle “canyon street” e ai marciapiedi affiancati a correnti veicolari dense. |
| Intermodalità e sosta caotica | Manovre veicoli, scooter, zone di sosta selvaggia aumentano conflitti con pedoni e ciclisti. |

---

## Licenza del progetto (Creative Commons)

Il materiale **originale** di questo repository — in particolare `content.md`, il markup di **`index.html`** dedicato al progetto, **`styles.css`**, **`render.js`**, gli script in **`scripts/`** scritti per questa mappa e **`README.md`** — è distribuito con licenza [**Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)**](https://creativecommons.org/licenses/by/4.0/deed.it): puoi condividere e adattare il materiale citando l’autore e indicando le modifiche. Il testo legale completo è nel file **`LICENSE`** nella radice del repository.

I **dati derivati da OpenStreetMap** e i **GeoJSON** prodotti dagli script restano soggetti all’[**Open Database License (ODbL)**](https://wiki.openstreetmap.org/wiki/OpenStreetMap_License). Le **librerie di terze parti** (Leaflet, Marked, Leaflet.heat, fornitori di tile, font, API Open-Meteo, ecc.) restano alle rispettive licenze elencate nella sezione *Fonti, licenze e repository*.

---

## Note legali

Marchi e riferimenti a **FIAB** sono usati in chiave di **proposta tematica** per gruppi locali; per uso ufficiale del logo e palette verificare i [materiali grafici FIAB Italia](https://fiabitalia.it/fiab/informazioni/materiali-grafici/).

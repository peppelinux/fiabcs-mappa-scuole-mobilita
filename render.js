/**
 * Carica content.md, GeoJSON (itinerario critico, scuole, ciclo/ped), Open-Meteo. Avvio: README.md.
 */
(function () {
  "use strict";

  var BUFFER_M = 300;
  var MAP_ID = "map";
  var CONTENT_ID = "content";
  var ERROR_ID = "fetch-error";

  var URLS = {
    overlays: "data.geojson",
    schoolsPoi: "data/schools-poi.geojson",
    osmCycle: "data/osm-cycleways.geojson",
    osmPed: "data/osm-pedestrian.geojson",
  };

  var SCHOOL_CAT_ORDER = [
    { id: "superiori", overlay: "Scuole: II grado (superiori)" },
    { id: "comprensivo", overlay: "Scuole: istituto comprensivo" },
    { id: "media", overlay: "Scuole: I grado (media)" },
    { id: "elementare", overlay: "Scuole: primaria (elementare)" },
    { id: "infanzia", overlay: "Scuole: infanzia / asilo" },
    { id: "non_classificata", overlay: "Scuole: tipo non ancora indicato" },
  ];

  var SCHOOL_POINT_STYLE = {
    infanzia: { r: 7, fill: "#aed957", stroke: "#4a7c23" },
    elementare: { r: 8, fill: "#3788d8", stroke: "#003f66" },
    media: { r: 8, fill: "#006aa7", stroke: "#001f33" },
    superiori: { r: 9, fill: "#003f66", stroke: "#001a28" },
    comprensivo: { r: 8, fill: "#7b1fa2", stroke: "#311b92" },
    non_classificata: { r: 6, fill: "#b0bec5", stroke: "#546e7a" },
  };

  /** Pane sopra overlay (400) così i marker scuola ricevono il click prima di linee/heatmap. */
  var PANE_SCHOOL_MARKERS = "schoolHitMarkers";
  var PANE_AIR_MARKERS = "airQualityMarkers";

  var AIR_POINTS = [
    { lat: 39.2989, lon: 16.2538, label: "Cosenza" },
    { lat: 39.3315, lon: 16.2412, label: "Rende" },
    { lat: 39.355, lon: 16.225, label: "Arcavacata / campus" },
  ];

  function showFetchError(msg) {
    var el = document.getElementById(ERROR_ID);
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
  }

  function renderMarkdown(text) {
    if (typeof marked === "undefined") {
      return "<p>Marked non caricato.</p>";
    }
    marked.setOptions({ breaks: true, mangle: false, headerIds: true });
    return marked.parse(text);
  }

  function escapeHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }

  function tryFetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) return { type: "FeatureCollection", features: [] };
      return r.json();
    }).catch(function () {
      return { type: "FeatureCollection", features: [] };
    });
  }

  function aqiColor(aqi) {
    if (aqi == null || isNaN(aqi)) return "#979ca4";
    if (aqi <= 20) return "#aed957";
    if (aqi <= 40) return "#f1c40f";
    if (aqi <= 60) return "#f7a134";
    if (aqi <= 80) return "#ea6485";
    return "#cf2e2e";
  }

  /**
   * Indice qualità aria europeo (EAQI) da Open-Meteo `european_aqi` (stessa scala dei colori marker).
   * Riferimento orientativo: bande EEA/Copernicus 0–20 buona … >100 estremamente scarsa.
   */
  function europeanAqiAssessment(aqi) {
    if (aqi == null || isNaN(aqi)) {
      return {
        bandLabel: "Non disponibile",
        bandDetail: "Indice EAQI non calcolabile da questa risposta API.",
        isGood: null,
        airBuonaPhrase: "Non è possibile dirlo: manca l’indice sintetico.",
      };
    }
    var n = Number(aqi);
    if (n <= 20) {
      return {
        bandLabel: "Buona",
        bandDetail: "EAQI 0–20: livelli bassi, adatti alla maggior parte delle persone.",
        isGood: true,
        airBuonaPhrase: "Sì: in generale l’aria è buona in questo punto (modello a griglia).",
      };
    }
    if (n <= 40) {
      return {
        bandLabel: "Discreta",
        bandDetail: "EAQI 21–40: qualità accettabile; chi è molto sensibile può avvertire lievi effetti.",
        isGood: true,
        airBuonaPhrase: "Abbastanza sì: qualità discreta; pochi rischi per la salute nella popolazione generale.",
      };
    }
    if (n <= 60) {
      return {
        bandLabel: "Moderata",
        bandDetail: "EAQI 41–60: possibili effetti per chi è sensibile (bambini, anziani, problemi respiratori).",
        isGood: false,
        airBuonaPhrase: "Non del tutto: qualità moderata; conviene limitare sforzi prolungati all’aperto se si è sensibili.",
      };
    }
    if (n <= 80) {
      return {
        bandLabel: "Scarsa",
        bandDetail: "EAQI 61–80: effetti possibili su tutti; sensibili con sintomi più marcati.",
        isGood: false,
        airBuonaPhrase: "No: qualità scarsa; ridurre esposizione e attività intense all’aperto.",
      };
    }
    if (n <= 100) {
      return {
        bandLabel: "Molto scarsa",
        bandDetail: "EAQI 81–100: effetti sulla salute per molti; limitare tempo all’aperto.",
        isGood: false,
        airBuonaPhrase: "No: aria molto inquinata; evitare sforzo all’aperto, soprattutto per bambini e fragili.",
      };
    }
    return {
      bandLabel: "Estremamente scarsa",
      bandDetail: "EAQI oltre 100: rischio elevato; ridurre al minimo l’esposizione all’aperto.",
      isGood: false,
      airBuonaPhrase: "No: situazione pessima per la qualità dell’aria (indice molto alto).",
    };
  }

  function loadAirQualityLayer(map, airGroup, airPane) {
    var jobs = AIR_POINTS.map(function (pt) {
      var u =
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" +
        encodeURIComponent(pt.lat) +
        "&longitude=" +
        encodeURIComponent(pt.lon) +
        "&current=european_aqi,pm10,pm2_5,nitrogen_dioxide&timezone=Europe%2FRome";
      return fetch(u)
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .catch(function () {
          return null;
        })
        .then(function (data) {
          if (!data || !data.current) return;
          var cur = data.current;
          var aqi = cur.european_aqi;
          var col = aqiColor(aqi);
          var assess = europeanAqiAssessment(aqi);
          var m = L.circleMarker([pt.lat, pt.lon], {
            radius: 11,
            fillColor: col,
            color: "#003f66",
            weight: 2,
            fillOpacity: 0.9,
            pane: airPane,
          });
          var html =
            "<strong>" +
            escapeHtml(pt.label) +
            "</strong><br/>" +
            "<small>Stima da modello (Open-Meteo), non misura diretta sul posto</small><br/>" +
            "<strong>Indice EAQI (europeo):</strong> " +
            escapeHtml(String(aqi != null ? aqi : "n/d")) +
            " — <strong>" +
            escapeHtml(assess.bandLabel) +
            "</strong><br/><span style=\"opacity:.92\">" +
            escapeHtml(assess.bandDetail) +
            "</span><br/>" +
            "<strong>L’aria è buona?</strong> " +
            escapeHtml(assess.airBuonaPhrase) +
            "<br/><hr style=\"margin:.45rem 0;border:none;border-top:1px solid rgba(0,63,102,.2)\"/>" +
            "PM2.5: " +
            escapeHtml(cur.pm2_5 != null ? String(cur.pm2_5) + " μg/m³" : "n/d") +
            "<br/>PM10: " +
            escapeHtml(cur.pm10 != null ? String(cur.pm10) + " μg/m³" : "n/d") +
            "<br/>NO₂: " +
            escapeHtml(
              cur.nitrogen_dioxide != null ? String(cur.nitrogen_dioxide) + " μg/m³" : "n/d"
            ) +
            "<br/><small>" +
            escapeHtml(cur.time || "") +
            "</small>";
          m.bindPopup(html);
          airGroup.addLayer(m);
        });
    });
    return Promise.all(jobs).then(function () {
      if (airGroup.getLayers().length === 0) return;
      airGroup.addTo(map);
    });
  }

  var OSM_POPUP_LABEL = {
    highway: "Tipo strada",
    name: "Nome",
    cycleway: "Corsia ciclabile",
    footway: "Percorso pedonale",
    bicycle: "Accesso in bici",
    surface: "Superficie",
    maxspeed: "Velocità massima",
  };

  function osmLinePopup(props) {
    var keys = ["highway", "name", "cycleway", "footway", "bicycle", "surface", "maxspeed"];
    var parts = [];
    keys.forEach(function (k) {
      if (props[k])
        parts.push(
          "<strong>" + escapeHtml(OSM_POPUP_LABEL[k] || k) + "</strong>: " + escapeHtml(props[k])
        );
    });
    if (props.osm_way_id)
      parts.push(
        '<small><a href="https://www.openstreetmap.org/way/' +
          encodeURIComponent(String(props.osm_way_id)) +
          '" target="_blank" rel="noopener">Apri questo tratto su OpenStreetMap</a></small>'
      );
    return parts.length ? parts.join("<br/>") : "Dettaglio non disponibile.";
  }

  function schoolPoiPopup(p) {
    var lines = [];
    lines.push("<strong>" + escapeHtml(p.name || "Senza nome") + "</strong>");
    if (p.category_label)
      lines.push("<span style=\"opacity:.85\">" + escapeHtml(p.category_label) + "</span>");
    var street = [p["addr:street"], p["addr:housenumber"]].filter(Boolean).join(" ");
    if (street) lines.push(escapeHtml(street));
    var city = p["addr:city"] || "";
    var pc = p["addr:postcode"] || "";
    if (city || pc) lines.push(escapeHtml([city, pc].filter(Boolean).join(" — ")));
    if (p.website && /^https?:\/\//i.test(String(p.website).trim()))
      lines.push(
        '<a href="' +
          String(p.website)
            .trim()
            .replace(/"/g, "") +
          '" target="_blank" rel="noopener noreferrer">Sito web</a>'
      );
    var ot = p.osm_type || "node";
    var oid = p.osm_id;
    if (oid != null)
      lines.push(
        '<small><a href="https://www.openstreetmap.org/' +
          escapeHtml(ot) +
          "/" +
          encodeURIComponent(String(oid)) +
          '" target="_blank" rel="noopener">Apri su OpenStreetMap</a></small>'
      );
    return lines.join("<br/>");
  }

  /** Distanza approssimata tra due punto WGS84 (metri). */
  function haversineMeters(lat1, lon1, lat2, lon2) {
    var r = 6371000;
    var p = Math.PI / 180;
    var a =
      0.5 -
      Math.cos((lat2 - lat1) * p) / 2 +
      (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
    return 2 * r * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  }

  function formatLatLngPair(lat, lng) {
    return lat.toFixed(5) + ", " + lng.toFixed(5);
  }

  function googleStreetViewUrl(lat, lng) {
    return (
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng
    );
  }

  /** Coordinate + link Google Street View (HTML sicuro tranne href numerico). */
  function mapPointCoordsAndStreetViewHtml(lat, lng) {
    var pair = formatLatLngPair(lat, lng);
    var sv = googleStreetViewUrl(lat, lng);
    return (
      escapeHtml(pair) +
      ' <small>(WGS84)</small><br/><a href="' +
      sv +
      '" target="_blank" rel="noopener noreferrer">Apri in Google Street View</a>'
    );
  }

  /** Solo http/https per collegamenti disegni utente (GeoJSON). */
  function sanitizeUserDrawingHref(raw) {
    if (!raw || typeof raw !== "string") return "";
    var u = raw.trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";
      u = "https://" + u;
    }
    try {
      var parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (eHref) {
      return "";
    }
  }

  function reverseGeocodePhoton(lat, lng) {
    var url =
      "https://photon.komoot.io/reverse?lat=" +
      encodeURIComponent(lat) +
      "&lon=" +
      encodeURIComponent(lng);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("photon " + r.status);
        return r.json();
      })
      .then(function (data) {
        var f = data && data.features && data.features[0];
        if (!f || !f.properties) return null;
        return f.properties;
      });
  }

  function streetNameFromPhotonProps(p) {
    if (!p) return "";
    var st = (p.street || "").trim();
    if (st) return st;
    if (p.osm_key === "highway" && p.name) return String(p.name).trim();
    if (p.type === "street" || p.type === "house") return (p.name || "").trim();
    return (p.name || "").trim();
  }

  /** Blocco HTML strada / città / comune da proprietà Photon (OSM). */
  function addressLinesHtmlFromPhotonProps(p) {
    if (!p) {
      return "<p><em>Indirizzo non trovato.</em></p>";
    }
    var street = streetNameFromPhotonProps(p);
    var comune = (p.city || p.town || p.village || "").trim();
    var out = [];
    out.push(
      "<div><strong>Strada:</strong> " +
        (street ? escapeHtml(street) : "<span>—</span>") +
        "</div>"
    );
    out.push(
      "<div><strong>Comune:</strong> " +
        (comune ? escapeHtml(comune) : "<span>—</span>") +
        "</div>"
    );
    return '<div class="map-popup-address">' + out.join("") + "</div>";
  }

  /** Blocco indirizzo + coordinate + Street View (come click sulla mappa vuota). */
  function mapContextBlockHtml(latlng, photonProps, phase) {
    var head = "<strong>Punto sulla mappa</strong>";
    var addr = "";
    if (phase === "loading") {
      addr = "<p><em>Caricamento indirizzo…</em></p>";
    } else if (phase === "addrfail") {
      addr = "<p><em>Indirizzo non disponibile.</em></p>";
    } else {
      addr = addressLinesHtmlFromPhotonProps(photonProps);
    }
    var coords = mapPointCoordsAndStreetViewHtml(latlng.lat, latlng.lng);
    var attr =
      '<small class="map-popup-photon-attrib">Dati indirizzo: <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> / OpenStreetMap.</small>';
    return head + addr + "<br/>" + coords + "<br/>" + attr;
  }

  function mapClickPopupHtml(latlng, photonProps, phase) {
    return mapContextBlockHtml(latlng, photonProps, phase);
  }

  /** Titolo, descrizione e link utente (senza contesto mappa). */
  function userDrawingDetailsHtml(props) {
    if (!props || typeof props !== "object") props = {};
    var titolo =
      props.titolo != null && String(props.titolo).trim()
        ? String(props.titolo).trim()
        : props.title != null && String(props.title).trim()
          ? String(props.title).trim()
          : "";
    var desc =
      props.descrizione != null
        ? String(props.descrizione)
        : props.description != null
          ? String(props.description)
          : "";
    desc = desc.trim();
    var linkHref = sanitizeUserDrawingHref(
      props.href != null ? String(props.href) : props.url != null ? String(props.url) : ""
    );
    if (!titolo && !desc && !linkHref) return "";
    var head = titolo ? escapeHtml(titolo) : "Disegno";
    var html = "<strong>" + head + "</strong>";
    if (desc)
      html +=
        "<br/><span class=\"map-draw-user-desc\">" +
        escapeHtml(desc).replace(/\n/g, "<br/>") +
        "</span>";
    if (linkHref)
      html +=
        '<br/><a class="map-draw-user-link" href="' +
        escapeHtml(linkHref) +
        '" target="_blank" rel="noopener noreferrer">Apri il collegamento</a>';
    return html;
  }

  function userDrawingFullPopupHtml(latlng, props, phase, photonProps) {
    var userPart = userDrawingDetailsHtml(props);
    var sep = userPart ? '<hr class="map-popup-sep" />' : "";
    return userPart + sep + mapContextBlockHtml(latlng, photonProps, phase);
  }

  /** Testi Leaflet.draw in italiano (mutazione di L.drawLocal). */
  function applyLeafletDrawItalian() {
    if (typeof L === "undefined" || !L.drawLocal) return;
    var d = L.drawLocal;
    d.draw.toolbar.actions.title = "Annulla il disegno";
    d.draw.toolbar.actions.text = "Annulla";
    d.draw.toolbar.finish.title = "Termina il disegno";
    d.draw.toolbar.finish.text = "Termina";
    d.draw.toolbar.undo.title = "Elimina l’ultimo punto";
    d.draw.toolbar.undo.text = "Elimina ultimo punto";
    d.draw.toolbar.buttons.polyline = "Disegna una polilinea";
    d.draw.toolbar.buttons.polygon = "Disegna un poligono";
    d.draw.toolbar.buttons.rectangle = "Disegna un rettangolo";
    d.draw.toolbar.buttons.circle = "Disegna un cerchio";
    d.draw.toolbar.buttons.marker = "Aggiungi un punto";
    d.draw.toolbar.buttons.circlemarker = "Aggiungi un cerchio piccolo";
    d.draw.handlers.polyline.error =
      "<strong>Errore:</strong> i lati della forma non possono incrociarsi.";
    d.draw.handlers.polyline.tooltip.start = "Clic per iniziare la linea.";
    d.draw.handlers.polyline.tooltip.cont = "Clic per aggiungere un punto.";
    d.draw.handlers.polyline.tooltip.end =
      "Doppio clic sul punto finale o «Termina» per chiudere la linea.";
    d.draw.handlers.polygon.tooltip.start = "Clic per iniziare il poligono.";
    d.draw.handlers.polygon.tooltip.cont = "Clic per continuare.";
    d.draw.handlers.polygon.tooltip.end = "Clic sul primo punto per chiudere.";
    d.draw.handlers.marker.tooltip.start = "Clic sulla mappa per posizionare il punto.";
    d.draw.handlers.simpleshape.tooltip.end = "Rilascia il mouse per completare.";
    d.edit.toolbar.actions.save.title = "Salva le modifiche";
    d.edit.toolbar.actions.save.text = "Salva";
    d.edit.toolbar.actions.cancel.title = "Annulla le modifiche";
    d.edit.toolbar.actions.cancel.text = "Annulla";
    d.edit.toolbar.actions.clearAll.title = "Rimuovi tutti gli elementi disegnati";
    d.edit.toolbar.actions.clearAll.text = "Rimuovi tutto";
    d.edit.toolbar.buttons.edit = "Modifica i disegni";
    d.edit.toolbar.buttons.editDisabled = "Nessun disegno da modificare";
    d.edit.toolbar.buttons.remove = "Elimina disegni";
    d.edit.toolbar.buttons.removeDisabled = "Nessun disegno da eliminare";
    d.edit.handlers.edit.tooltip.text = "Trascina i vertici o i punti per modificare.";
    d.edit.handlers.edit.tooltip.subtext = "Annulla per ripristinare.";
    d.edit.handlers.remove.tooltip.text = "Clic su un elemento da eliminare.";
  }

  /** Nasconde la colonna testuale: la mappa occupa tutta la riga; ripristino con lo stesso pulsante. */
  function setupLayoutTextPanelToggle(map) {
    var btn = document.getElementById("text-panel-toggle");
    if (!btn) return;
    var STORAGE_KEY = "fiabheatmap_text_panel_hidden";
    var labelEl = btn.querySelector(".text-panel-toggle__label");
    function apply(hidden) {
      document.body.classList.toggle("body--text-panel-hidden", hidden);
      btn.setAttribute("aria-pressed", hidden ? "true" : "false");
      if (hidden) {
        btn.setAttribute(
          "aria-label",
          "Mostra di nuovo il pannello testuale accanto alla mappa"
        );
        btn.title =
          "Mostra il testo: su schermi piccoli torna anche il blocco sopra la mappa";
        if (labelEl) labelEl.textContent = "Mostra testo";
      } else {
        btn.setAttribute(
          "aria-label",
          "Nascondi il pannello testuale per far occupare alla mappa tutta la riga"
        );
        btn.title = "Nascondi il testo e usa tutta la riga per la mappa";
        if (labelEl) labelEl.textContent = "Nascondi testo";
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
      } catch (e) {}
      setTimeout(function () {
        if (map && map.invalidateSize) map.invalidateSize();
      }, 50);
      setTimeout(function () {
        if (map && map.invalidateSize) map.invalidateSize();
      }, 350);
    }
    function readStoredHidden() {
      try {
        return sessionStorage.getItem(STORAGE_KEY) === "1";
      } catch (e) {
        return false;
      }
    }
    apply(readStoredHidden());
    btn.addEventListener("click", function () {
      apply(!document.body.classList.contains("body--text-panel-hidden"));
    });
  }

  function initMap(geo, osmCycle, osmPed, schoolsPoi) {
    var mapEl = document.getElementById(MAP_ID);
    if (!mapEl || typeof L === "undefined") {
      return;
    }

    var map = L.map(MAP_ID, {
      scrollWheelZoom: true,
      zoomControl: true,
    });

    map.createPane(PANE_SCHOOL_MARKERS);
    map.getPane(PANE_SCHOOL_MARKERS).style.zIndex = 670;
    map.createPane(PANE_AIR_MARKERS);
    map.getPane(PANE_AIR_MARKERS).style.zIndex = 660;

    var attrOsm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    var osmStandard = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: attrOsm,
    });
    var esriSat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, e contributori GIS',
      }
    );
    osmStandard.addTo(map);

    var baseMaps = {
      "Carta stradale (OpenStreetMap)": osmStandard,
      "Vista satellite": esriSat,
    };

    var FIAB = {
      blue: "#006aa7",
      blueDark: "#003f66",
      blueMid: "#2d74ac",
      gold: "#f1c40f",
      green: "#aed957",
      orange: "#f7a134",
      bufferStroke: "rgba(0, 106, 167, 0.52)",
      bufferFill: "rgba(0, 106, 167, 0.12)",
    };

    var schoolGroups = {};
    SCHOOL_CAT_ORDER.forEach(function (item) {
      schoolGroups[item.id] = L.layerGroup();
    });

    var criticalGroup = L.layerGroup();
    var cycleGroup = L.layerGroup();
    var pedestrianGroup = L.layerGroup();
    var airGroup = L.layerGroup();
    var bounds = L.latLngBounds([]);
    var heatPoints = [];

    var schoolSites = [];
    (schoolsPoi.features || []).forEach(function (f) {
      var geom = f.geometry;
      var p = f.properties || {};
      if (!geom || geom.type !== "Point" || p.kind !== "school_poi") return;
      var lat = geom.coordinates[1];
      var lon = geom.coordinates[0];
      schoolSites.push({ lat: lat, lon: lon, latlng: L.latLng(lat, lon), cat: p.category || "non_classificata", p: p });
    });

    var bufferDiameter = BUFFER_M * 2;

    function schoolHeatIntensityAtSchool(idx) {
      var s = schoolSites[idx];
      var w = 0.38;
      var k;
      for (k = 0; k < schoolSites.length; k++) {
        if (k === idx) continue;
        var o = schoolSites[k];
        var d = haversineMeters(s.lat, s.lon, o.lat, o.lon);
        if (d >= bufferDiameter || d < 1e-6) continue;
        var overlap = (bufferDiameter - d) / bufferDiameter;
        w += overlap * 0.34;
        if (d < BUFFER_M) {
          w += (1 - d / BUFFER_M) * 0.1;
        }
      }
      return Math.min(1.18, w);
    }

    function pushHeatIfDistinct(lat, lon, intensity, minDistToExisting) {
      var md = minDistToExisting == null ? 28 : minDistToExisting;
      var j;
      for (j = 0; j < heatPoints.length; j++) {
        var hp = heatPoints[j];
        if (haversineMeters(lat, lon, hp[0], hp[1]) < md) {
          if (intensity > hp[2]) hp[2] = intensity;
          return;
        }
      }
      heatPoints.push([lat, lon, intensity]);
    }

    var si;
    for (si = 0; si < schoolSites.length; si++) {
      var site = schoolSites[si];
      var cat = site.cat;
      if (!schoolGroups[cat]) schoolGroups[cat] = L.layerGroup();
      var st = SCHOOL_POINT_STYLE[cat] || SCHOOL_POINT_STYLE.non_classificata;
      var latlng = site.latlng;
      bounds.extend(latlng);
      heatPoints.push([latlng.lat, latlng.lng, schoolHeatIntensityAtSchool(si)]);

      schoolGroups[cat].addLayer(
        L.circle(latlng, {
          radius: BUFFER_M,
          color: FIAB.bufferStroke,
          weight: 2,
          fillColor: FIAB.bufferFill,
          fillOpacity: 1,
          interactive: false,
        })
      );
      var mk = L.circleMarker(latlng, {
        radius: st.r,
        fillColor: st.fill,
        color: st.stroke,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.92,
        pane: PANE_SCHOOL_MARKERS,
      });
      mk.bindPopup(schoolPoiPopup(site.p));
      schoolGroups[cat].addLayer(mk);
    }

    for (si = 0; si < schoolSites.length; si++) {
      var sj;
      for (sj = si + 1; sj < schoolSites.length; sj++) {
        var a = schoolSites[si];
        var b = schoolSites[sj];
        var d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        if (d <= 0 || d >= bufferDiameter) continue;
        var midLat = (a.lat + b.lat) / 2;
        var midLon = (a.lon + b.lon) / 2;
        var t = (bufferDiameter - d) / bufferDiameter;
        var hub = 0.36 * t * t;
        var nNear = 2;
        for (var sk = 0; sk < schoolSites.length; sk++) {
          if (sk === si || sk === sj) continue;
          var c = schoolSites[sk];
          var da = haversineMeters(a.lat, a.lon, c.lat, c.lon);
          var db = haversineMeters(b.lat, b.lon, c.lat, c.lon);
          if (da < bufferDiameter && db < bufferDiameter) nNear += 1;
        }
        hub *= 1 + 0.22 * (nNear - 2);
        pushHeatIfDistinct(midLat, midLon, Math.min(1.05, hub), 22);
      }
    }

    geo.features.forEach(function (f) {
      var geom = f.geometry;
      var p = f.properties || {};
      if (!geom) return;

      if (p.kind === "critical_segment") {
        var lines =
          geom.type === "LineString"
            ? [geom.coordinates]
            : geom.type === "MultiLineString"
              ? geom.coordinates
              : null;
        if (!lines) return;
        var criticalBaseHtml =
          "<strong>" +
          escapeHtml(p.name || "") +
          "</strong><br/>" +
          escapeHtml(p.risk || "") +
          (p.notes ? "<br/><small>" + escapeHtml(p.notes) + "</small>" : "");
        var li;
        for (li = 0; li < lines.length; li++) {
          var latlngs = lines[li].map(function (c) {
            return [c[1], c[0]];
          });
          latlngs.forEach(function (ll) {
            bounds.extend(ll);
            heatPoints.push([ll[0], ll[1], 0.35]);
          });
          var pl = L.polyline(latlngs, {
            color: FIAB.orange,
            weight: 5,
            opacity: 0.9,
          });
          pl.on("click", function (e) {
            var html =
              criticalBaseHtml +
              "<br/><br/>" +
              mapPointCoordsAndStreetViewHtml(e.latlng.lat, e.latlng.lng);
            L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
          });
          criticalGroup.addLayer(pl);
        }
      }
    });

    if (osmCycle && osmCycle.features && osmCycle.features.length) {
      osmCycle.features.forEach(function (feat) {
        var g = feat.geometry;
        if (g && g.type === "LineString" && g.coordinates) {
          g.coordinates.forEach(function (c) {
            bounds.extend([c[1], c[0]]);
          });
        }
      });
      cycleGroup.addLayer(
        L.geoJSON(osmCycle, {
          style: function () {
            return { color: "#5a8f2a", weight: 4, opacity: 0.85 };
          },
          onEachFeature: function (feat, layer) {
            layer.bindPopup(osmLinePopup(feat.properties || {}));
          },
        })
      );
    }

    if (osmPed && osmPed.features && osmPed.features.length) {
      osmPed.features.forEach(function (feat) {
        var g = feat.geometry;
        if (g && g.type === "LineString" && g.coordinates) {
          g.coordinates.forEach(function (c) {
            bounds.extend([c[1], c[0]]);
          });
        }
      });
      pedestrianGroup.addLayer(
        L.geoJSON(osmPed, {
          style: function () {
            return { color: "#6586b4", weight: 3, opacity: 0.8, dashArray: "6 4" };
          },
          onEachFeature: function (feat, layer) {
            layer.bindPopup(osmLinePopup(feat.properties || {}));
          },
        })
      );
    }

    criticalGroup.addTo(map);
    cycleGroup.addTo(map);
    pedestrianGroup.addTo(map);

    SCHOOL_CAT_ORDER.forEach(function (item) {
      var g = schoolGroups[item.id];
      if (g && g.getLayers().length) g.addTo(map);
    });

    var heatLayer = null;
    if (typeof L.heatLayer === "function" && heatPoints.length) {
      heatLayer = L.heatLayer(heatPoints, {
        radius: 44,
        blur: 24,
        maxZoom: 16,
        max: 0.92,
        gradient: {
          0.28: FIAB.blue,
          0.42: FIAB.blueMid,
          0.55: FIAB.gold,
          0.68: FIAB.orange,
          0.82: "#ea6485",
          0.93: "#e53935",
          1: "#b71c1c",
        },
      });
      heatLayer.addTo(map);
      if (heatLayer._canvas) {
        heatLayer._canvas.style.pointerEvents = "none";
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    } else {
      map.setView([39.31, 16.24], 12);
    }

    loadAirQualityLayer(map, airGroup, PANE_AIR_MARKERS).then(function () {});

    var overlays = {};
    SCHOOL_CAT_ORDER.forEach(function (item) {
      var g = schoolGroups[item.id];
      if (g && g.getLayers().length) overlays[item.overlay] = g;
    });
    overlays["Itinerario critico"] = criticalGroup;
    overlays["Piste e corsie ciclabili"] = cycleGroup;
    overlays["Percorsi pedonali e attraversamenti"] = pedestrianGroup;
    overlays["Qualità dell’aria (stima modello)"] = airGroup;
    if (heatLayer) overlays["Priorità geografiche (heatmap)"] = heatLayer;

    var layersControl = L.control
      .layers(baseMaps, overlays, { collapsed: false, position: "topright" })
      .addTo(map);

    (function setupMapCoordsReadoutAndClickStreetView() {
      var CoordReadout = L.Control.extend({
        options: { position: "bottomleft" },
        onAdd: function () {
          var div = L.DomUtil.create("div", "map-coords-readout");
          div.setAttribute("role", "status");
          div.title =
            "Coordinate WGS84 (latitudine, longitudine) aggiornate al movimento del puntatore";
          div.textContent = "—";
          return div;
        },
      });
      var coordCtrl = new CoordReadout().addTo(map);
      var coordEl = coordCtrl.getContainer();
      var mapRoot = map.getContainer();
      function onRootMouseMove(domEv) {
        var ll = map.mouseEventToLatLng(domEv);
        coordEl.textContent = formatLatLngPair(ll.lat, ll.lng);
      }
      function onRootMouseLeave() {
        coordEl.textContent = "—";
      }
      mapRoot.addEventListener("mousemove", onRootMouseMove);
      mapRoot.addEventListener("mouseleave", onRootMouseLeave);
      map.on("click", function (e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        var popup = L.popup()
          .setLatLng(e.latlng)
          .setContent(mapClickPopupHtml(e.latlng, null, "loading"))
          .openOn(map);
        reverseGeocodePhoton(lat, lng)
          .then(function (props) {
            if (!popup || !map.hasLayer(popup)) return;
            popup.setContent(
              mapClickPopupHtml(e.latlng, props, props ? "loaded" : "addrfail")
            );
          })
          .catch(function () {
            if (!popup || !map.hasLayer(popup)) return;
            popup.setContent(mapClickPopupHtml(e.latlng, null, "addrfail"));
          });
      });
    })();

    (function setupUserDrawingTools() {
      if (typeof L.Control.Draw === "undefined") {
        return;
      }
      applyLeafletDrawItalian();

      var STORAGE_KEY = "fiabheatmap_user_drawings_v1";
      var USER_DRAW_PANE = "userDrawings";
      var ioStatusEl = null;
      map.createPane(USER_DRAW_PANE);
      map.getPane(USER_DRAW_PANE).style.zIndex = "640";

      var drawnItems = L.featureGroup().addTo(map);
      var nextDrawingIdSeq = 0;

      function ensureDrawingId(layer) {
        if (!layer || layer._fiabDrawId != null) return;
        layer._fiabDrawId = ++nextDrawingIdSeq;
      }

      function layerDrawingLabel(layer) {
        var p = (layer.feature && layer.feature.properties) || {};
        var t =
          p.titolo != null && String(p.titolo).trim()
            ? String(p.titolo).trim()
            : p.title != null && String(p.title).trim()
              ? String(p.title).trim()
              : "";
        if (t) return t;
        if (layer instanceof L.Marker) return "Punto";
        if (layer instanceof L.Polygon) return "Poligono";
        if (layer instanceof L.Polyline) return "Linea";
        return "Disegno";
      }

      function setLayerDrawingVisible(layer, visible) {
        if (!layer) return;
        layer._fiabDrawingVisible = !!visible;
        var el = typeof layer.getElement === "function" ? layer.getElement() : null;
        if (el) {
          el.style.display = visible ? "" : "none";
          el.style.pointerEvents = visible ? "" : "none";
        }
      }

      function geoJsonToFeatureCollection(data) {
        if (!data || typeof data !== "object") return null;
        if (data.type === "FeatureCollection") return data;
        if (data.type === "Feature") {
          return { type: "FeatureCollection", features: [data] };
        }
        return null;
      }

      function layerToGeoJSONFeatureCollection(layer) {
        if (!layer || typeof layer.toGeoJSON !== "function") return null;
        var gj = layer.toGeoJSON();
        if (!gj || typeof gj !== "object") return null;
        if (gj.type === "FeatureCollection") return gj;
        if (gj.type === "Feature") {
          return { type: "FeatureCollection", features: [gj] };
        }
        if (gj.coordinates !== undefined || gj.geometries !== undefined) {
          return {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: (layer.feature && layer.feature.properties) || {},
                geometry: gj,
              },
            ],
          };
        }
        return null;
      }

      function slugForDrawingFilename(label) {
        var raw = String(label || "").trim();
        var s = raw
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "");
        if (!s) s = "disegno";
        return s.length > 48 ? s.slice(0, 48) : s;
      }

      function bindUserDrawingPopup(layer) {
        ensureDrawingId(layer);
        if (typeof layer.unbindPopup === "function") {
          layer.unbindPopup();
        }
        if (layer._fiabDrawPopupClick) {
          layer.off("click", layer._fiabDrawPopupClick);
          layer._fiabDrawPopupClick = null;
        }
        layer._fiabDrawPopupClick = function (e) {
          if (e && typeof L !== "undefined" && L.DomEvent && L.DomEvent.stopPropagation) {
            L.DomEvent.stopPropagation(e);
          } else if (e && e.originalEvent && e.originalEvent.stopPropagation) {
            e.originalEvent.stopPropagation();
          }
          var latlng = e.latlng;
          var props = (layer.feature && layer.feature.properties) || {};
          var popup = L.popup({ maxWidth: 320 })
            .setLatLng(latlng)
            .setContent(userDrawingFullPopupHtml(latlng, props, "loading", null))
            .openOn(map);
          reverseGeocodePhoton(latlng.lat, latlng.lng)
            .then(function (photonProps) {
              if (!popup || !map.hasLayer(popup)) return;
              popup.setContent(
                userDrawingFullPopupHtml(
                  latlng,
                  props,
                  photonProps ? "loaded" : "addrfail",
                  photonProps
                )
              );
            })
            .catch(function () {
              if (!popup || !map.hasLayer(popup)) return;
              popup.setContent(userDrawingFullPopupHtml(latlng, props, "addrfail", null));
            });
        };
        layer.on("click", layer._fiabDrawPopupClick);
      }

      function setDrawingFeatureProps(layer, titolo, descrizione, href) {
        if (!layer.feature) layer.feature = {};
        layer.feature.type = "Feature";
        layer.feature.properties = layer.feature.properties || {};
        layer.feature.properties.titolo = titolo.trim();
        layer.feature.properties.descrizione = (descrizione || "").trim();
        var hrefNorm = sanitizeUserDrawingHref(href || "");
        if (hrefNorm) layer.feature.properties.href = hrefNorm;
        else delete layer.feature.properties.href;
        bindUserDrawingPopup(layer);
      }

      function openDrawingMetadataModal(map, onConfirm, onAbort) {
        var root = map.getContainer();
        var overlay = document.createElement("div");
        overlay.className = "map-draw-meta-backdrop";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "map-draw-meta-heading");

        var panel = document.createElement("div");
        panel.className = "map-draw-meta-panel";

        var h = document.createElement("h2");
        h.id = "map-draw-meta-heading";
        h.className = "map-draw-meta-heading";
        h.textContent = "Dettaglio disegno";

        var err = document.createElement("p");
        err.className = "map-draw-meta-error";
        err.setAttribute("role", "alert");
        err.hidden = true;

        var lblT = document.createElement("label");
        lblT.className = "map-draw-meta-label";
        lblT.setAttribute("for", "map-draw-meta-titolo");
        lblT.textContent = "Titolo";
        var inpT = document.createElement("input");
        inpT.id = "map-draw-meta-titolo";
        inpT.type = "text";
        inpT.className = "map-draw-meta-input";
        inpT.setAttribute("autocomplete", "off");
        inpT.setAttribute("maxlength", "200");

        var lblD = document.createElement("label");
        lblD.className = "map-draw-meta-label";
        lblD.setAttribute("for", "map-draw-meta-desc");
        lblD.textContent = "Descrizione";
        var taD = document.createElement("textarea");
        taD.id = "map-draw-meta-desc";
        taD.className = "map-draw-meta-textarea";
        taD.rows = 4;
        taD.setAttribute("maxlength", "4000");

        var lblU = document.createElement("label");
        lblU.className = "map-draw-meta-label";
        lblU.setAttribute("for", "map-draw-meta-href");
        lblU.textContent = "Collegamento (indirizzo web, opzionale)";
        var inpU = document.createElement("input");
        inpU.id = "map-draw-meta-href";
        inpU.type = "url";
        inpU.className = "map-draw-meta-input";
        inpU.setAttribute("autocomplete", "off");
        inpU.setAttribute("maxlength", "2000");
        inpU.setAttribute("placeholder", "https://…");

        var btnRow = document.createElement("div");
        btnRow.className = "map-draw-meta-actions";
        var btnCancel = document.createElement("button");
        btnCancel.type = "button";
        btnCancel.className = "map-draw-meta-btn map-draw-meta-btn--secondary";
        btnCancel.textContent = "Annulla";
        var btnOk = document.createElement("button");
        btnOk.type = "button";
        btnOk.className = "map-draw-meta-btn map-draw-meta-btn--primary";
        btnOk.textContent = "Salva disegno";

        function cleanup(committed) {
          document.removeEventListener("keydown", onDocKey);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (!committed && typeof onAbort === "function") onAbort();
        }

        function onDocKey(ev) {
          if (ev.key === "Escape") {
            ev.preventDefault();
            cleanup(false);
          }
        }

        function trySave() {
          var t = inpT.value.trim();
          if (!t) {
            err.textContent = "Inserisci un titolo.";
            err.hidden = false;
            inpT.focus();
            return;
          }
          var hrefRaw = inpU.value.trim();
          if (hrefRaw) {
            var hrefNorm = sanitizeUserDrawingHref(hrefRaw);
            if (!hrefNorm) {
              err.textContent = "Indirizzo web non valido: usa https://… (o http://…).";
              err.hidden = false;
              inpU.focus();
              return;
            }
            hrefRaw = hrefNorm;
          } else {
            hrefRaw = "";
          }
          err.hidden = true;
          onConfirm(t, taD.value, hrefRaw);
          cleanup(true);
        }

        btnCancel.addEventListener("click", function () {
          cleanup(false);
        });
        btnOk.addEventListener("click", trySave);
        inpT.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            trySave();
          }
        });

        overlay.addEventListener("click", function (ev) {
          if (ev.target === overlay) cleanup(false);
        });
        document.addEventListener("keydown", onDocKey);

        panel.appendChild(h);
        panel.appendChild(err);
        panel.appendChild(lblT);
        panel.appendChild(inpT);
        panel.appendChild(lblD);
        panel.appendChild(taD);
        panel.appendChild(lblU);
        panel.appendChild(inpU);
        btnRow.appendChild(btnCancel);
        btnRow.appendChild(btnOk);
        panel.appendChild(btnRow);
        overlay.appendChild(panel);
        root.appendChild(overlay);

        setTimeout(function () {
          inpT.focus();
        }, 0);
      }

      function addGeoJsonToDrawn(fc) {
        if (!fc || !fc.features || !fc.features.length) return 0;
        var n = 0;
        L.geoJSON(fc, {
          pane: USER_DRAW_PANE,
          onEachFeature: function (feat, lyr) {
            bindUserDrawingPopup(lyr);
          },
        }).eachLayer(function (ly) {
          drawnItems.addLayer(ly);
          ensureDrawingId(ly);
          if (ly._fiabDrawingVisible === false) setLayerDrawingVisible(ly, false);
          n += 1;
        });
        return n;
      }

      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          var fc = geoJsonToFeatureCollection(parsed);
          if (fc) addGeoJsonToDrawn(fc);
        }
      } catch (eLoad) {
        /* ignore */
      }

      var saveTimer = null;
      function persistDrawingsNow() {
        try {
          var gj = drawnItems.toGeoJSON();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(gj));
          if (ioStatusEl) {
            var c = drawnItems.getLayers().length;
            ioStatusEl.textContent =
              c > 0
                ? "Salvato nel browser (" + c + " element" + (c === 1 ? "o" : "i") + ")."
                : "Nessun disegno: salvataggio vuoto nel browser.";
          }
        } catch (e) {
          if (e && e.name === "QuotaExceededError") {
            if (ioStatusEl)
              ioStatusEl.textContent =
                "Spazio nel browser insufficiente: esporta e svuota i disegni.";
          } else if (ioStatusEl) ioStatusEl.textContent = "Salvataggio locale non riuscito.";
        }
      }

      function schedulePersistDrawings() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persistDrawingsNow, 450);
      }

      function openDrawingsManagerPanel() {
        var root = map.getContainer();
        if (root.querySelector(".map-draw-list-backdrop")) return;

        var backdrop = document.createElement("div");
        backdrop.className = "map-draw-list-backdrop";
        backdrop.setAttribute("role", "dialog");
        backdrop.setAttribute("aria-modal", "true");
        backdrop.setAttribute("aria-labelledby", "map-draw-list-title");

        var panel = document.createElement("div");
        panel.className = "map-draw-list-panel";

        var head = document.createElement("div");
        head.className = "map-draw-list-head";
        var h = document.createElement("h2");
        h.id = "map-draw-list-title";
        h.className = "map-draw-list-title";
        h.textContent = "Disegni sulla mappa";
        head.appendChild(h);

        var bulk = document.createElement("div");
        bulk.className = "map-draw-list-bulk";
        var btnAllOn = document.createElement("button");
        btnAllOn.type = "button";
        btnAllOn.className = "map-draw-list-bulk-btn";
        btnAllOn.textContent = "Mostra tutti";
        var btnAllOff = document.createElement("button");
        btnAllOff.type = "button";
        btnAllOff.className = "map-draw-list-bulk-btn";
        btnAllOff.textContent = "Nascondi tutti";
        bulk.appendChild(btnAllOn);
        bulk.appendChild(btnAllOff);
        head.appendChild(bulk);

        var listBody = document.createElement("div");
        listBody.className = "map-draw-list-body";

        var foot = document.createElement("div");
        foot.className = "map-draw-list-foot";
        var btnClose = document.createElement("button");
        btnClose.type = "button";
        btnClose.className = "map-draw-meta-btn map-draw-meta-btn--secondary";
        btnClose.textContent = "Chiudi";
        foot.appendChild(btnClose);

        function closePanel() {
          document.removeEventListener("keydown", onEsc);
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        }

        function onEsc(ev) {
          if (ev.key === "Escape") {
            ev.preventDefault();
            closePanel();
          }
        }

        function rebuildList() {
          listBody.innerHTML = "";
          var layers = drawnItems.getLayers().slice();
          if (!layers.length) {
            var empty = document.createElement("p");
            empty.className = "map-draw-list-empty";
            empty.textContent = "Nessun disegno salvato.";
            listBody.appendChild(empty);
            return;
          }
          layers.forEach(function (ly) {
            ensureDrawingId(ly);
            var row = document.createElement("div");
            row.className = "map-draw-list-row";

            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "map-draw-list-cb";
            cb.checked = ly._fiabDrawingVisible !== false;
            cb.title = "Mostra o nascondi sulla mappa";
            cb.setAttribute("aria-label", "Visibile sulla mappa: " + layerDrawingLabel(ly));
            cb.addEventListener("change", function () {
              setLayerDrawingVisible(ly, cb.checked);
              if (ioStatusEl)
                ioStatusEl.textContent = cb.checked ? "Disegno visibile sulla mappa." : "Disegno nascosto sulla mappa.";
            });

            var lab = document.createElement("span");
            lab.className = "map-draw-list-row-label";
            lab.textContent = layerDrawingLabel(ly);

            var btnExport = document.createElement("button");
            btnExport.type = "button";
            btnExport.className = "map-draw-list-row-export";
            btnExport.setAttribute(
              "aria-label",
              "Esporta GeoJSON: " + layerDrawingLabel(ly)
            );
            btnExport.title = "Scarica solo questo disegno come file .geojson";
            btnExport.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12"/></svg>';
            btnExport.addEventListener("click", function () {
              var fc = layerToGeoJSONFeatureCollection(ly);
              if (!fc) {
                if (ioStatusEl)
                  ioStatusEl.textContent = "Esportazione GeoJSON non disponibile per questo elemento.";
                return;
              }
              var base = slugForDrawingFilename(layerDrawingLabel(ly));
              var fname = "disegno-" + base + ".geojson";
              var blob = new Blob([JSON.stringify(fc, null, 2)], {
                type: "application/geo+json;charset=utf-8",
              });
              var url = URL.createObjectURL(blob);
              var a = document.createElement("a");
              a.href = url;
              a.download = fname;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              if (ioStatusEl)
                ioStatusEl.textContent = "Esportato un file GeoJSON per «" + layerDrawingLabel(ly) + "».";
            });

            var btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.className = "map-draw-list-row-del";
            btnDel.setAttribute("aria-label", "Elimina " + layerDrawingLabel(ly));
            btnDel.title = "Elimina questo disegno";
            btnDel.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M9 7V5h6v2m-5 4v7m4-7v7M10 11h4"/></svg>';
            btnDel.addEventListener("click", function () {
              if (
                !window.confirm(
                  "Eliminare il disegno «" + layerDrawingLabel(ly) + "» dalla mappa e dal salvataggio locale?"
                )
              ) {
                return;
              }
              if (ly._fiabDrawPopupClick) {
                ly.off("click", ly._fiabDrawPopupClick);
                ly._fiabDrawPopupClick = null;
              }
              drawnItems.removeLayer(ly);
              schedulePersistDrawings();
              if (ioStatusEl) ioStatusEl.textContent = "Disegno eliminato.";
              rebuildList();
            });

            row.appendChild(cb);
            row.appendChild(lab);
            row.appendChild(btnExport);
            row.appendChild(btnDel);
            listBody.appendChild(row);
          });
        }

        btnAllOn.addEventListener("click", function () {
          drawnItems.eachLayer(function (ly) {
            setLayerDrawingVisible(ly, true);
          });
          rebuildList();
          if (ioStatusEl) ioStatusEl.textContent = "Tutti i disegni sono visibili.";
        });
        btnAllOff.addEventListener("click", function () {
          drawnItems.eachLayer(function (ly) {
            setLayerDrawingVisible(ly, false);
          });
          rebuildList();
          if (ioStatusEl) ioStatusEl.textContent = "Tutti i disegni sono nascosti sulla mappa.";
        });

        btnClose.addEventListener("click", closePanel);
        backdrop.addEventListener("click", function (ev) {
          if (ev.target === backdrop) closePanel();
        });
        document.addEventListener("keydown", onEsc);

        panel.appendChild(head);
        panel.appendChild(listBody);
        panel.appendChild(foot);
        backdrop.appendChild(panel);
        root.appendChild(backdrop);

        rebuildList();
      }

      var drawControl = new L.Control.Draw({
        position: "topleft",
        draw: {
          polyline: {
            shapeOptions: {
              color: "#b71c1c",
              weight: 4,
              opacity: 0.92,
            },
          },
          polygon: {
            shapeOptions: {
              color: "#b71c1c",
              weight: 2,
              fillColor: "#b71c1c",
              fillOpacity: 0.18,
            },
          },
          marker: true,
          rectangle: false,
          circle: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      });
      map.addControl(drawControl);

      var IoBar = L.Control.extend({
        options: { position: "topleft" },
        onAdd: function () {
          var wrap = L.DomUtil.create("div", "leaflet-bar leaflet-control map-draw-io");
          wrap.setAttribute("role", "toolbar");
          wrap.setAttribute(
            "aria-label",
            "Salvataggio disegni nel browser, esporta, importa ed elenco disegni"
          );
          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.disableScrollPropagation(wrap);

          var svgNs = "http://www.w3.org/2000/svg";
          function iconSvg(pathInner) {
            return (
              '<svg xmlns="' +
              svgNs +
              '" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
              pathInner +
              "</svg>"
            );
          }
          var icons = {
            info: iconSvg(
              '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'
            ),
            list: iconSvg(
              '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h1v1h-1zm0 6h1v1h-1zm0 6h1v1h-1z"/>'
            ),
            download: iconSvg(
              '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12"/>'
            ),
            upload: iconSvg(
              '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 9l-5-5-5 5M12 4v12"/>'
            ),
          };

          function mkIconBtn(svgHtml, ariaLabel, title) {
            var b = L.DomUtil.create("button", "map-draw-io__btn map-draw-io__btn--icon", wrap);
            b.type = "button";
            b.innerHTML = svgHtml;
            b.setAttribute("aria-label", ariaLabel);
            b.title = title;
            return b;
          }

          var n0 = drawnItems.getLayers().length;
          mkIconBtn(
            icons.info,
            "Informazioni su salvataggio locale, export GeoJSON, elenco disegni e strumenti di modifica.",
            "Disegni salvati solo in questo browser. Esporta / importa GeoJSON; elenco per mostrare, nascondere o eliminare. Modifica disegni: barra strumenti sopra (anche elimina singoli elementi)."
          );

          var fileInput = L.DomUtil.create("input", "map-draw-io__file");
          fileInput.type = "file";
          fileInput.accept = ".geojson,.json,application/geo+json";
          fileInput.setAttribute("aria-hidden", "true");
          fileInput.tabIndex = -1;
          fileInput.addEventListener("change", function () {
            var f = fileInput.files && fileInput.files[0];
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
              try {
                var j = JSON.parse(reader.result);
                var fcImp = geoJsonToFeatureCollection(j);
                if (!fcImp || !fcImp.features || !fcImp.features.length) {
                  if (ioStatusEl) ioStatusEl.textContent = "File GeoJSON non valido o vuoto.";
                  return;
                }
                var added = addGeoJsonToDrawn(fcImp);
                schedulePersistDrawings();
                if (ioStatusEl)
                  ioStatusEl.textContent =
                    added > 0
                      ? "Importati " +
                        added +
                        " element" +
                        (added === 1 ? "o" : "i") +
                        " e salvato nel browser."
                      : "Nessun livello importabile dal file.";
              } catch (eImp) {
                if (ioStatusEl)
                  ioStatusEl.textContent = "Impossibile leggere il file (JSON non valido).";
              }
            };
            reader.onerror = function () {
              if (ioStatusEl) ioStatusEl.textContent = "Lettura file non riuscita.";
            };
            reader.readAsText(f, "UTF-8");
          });

          mkIconBtn(
            icons.download,
            "Esporta GeoJSON",
            "Scarica un file .geojson con tutti i disegni sulla mappa"
          ).addEventListener("click", function () {
            var gj = drawnItems.toGeoJSON();
            var blob = new Blob([JSON.stringify(gj, null, 2)], {
              type: "application/geo+json;charset=utf-8",
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "disegni-mappa-fiab.geojson";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (ioStatusEl) ioStatusEl.textContent = "File GeoJSON scaricato.";
          });

          mkIconBtn(
            icons.upload,
            "Importa GeoJSON",
            "Aggiungi geometrie da un file GeoJSON (si uniscono ai disegni già presenti)"
          ).addEventListener("click", function () {
            fileInput.value = "";
            fileInput.click();
          });

          mkIconBtn(
            icons.list,
            "Elenco disegni",
            "Elenco di tutti i disegni: mostra o nascondi sulla mappa, elimina singoli elementi"
          ).addEventListener("click", function () {
            openDrawingsManagerPanel();
          });

          /* Dopo i pulsanti: input file fuori dal flusso (position absolute). */
          wrap.appendChild(fileInput);

          ioStatusEl = L.DomUtil.create("div", "map-draw-io__sr", wrap);
          ioStatusEl.setAttribute("aria-live", "polite");
          ioStatusEl.setAttribute("aria-atomic", "true");
          ioStatusEl.textContent =
            n0 > 0
              ? "Ripristinati " + n0 + " element" + (n0 === 1 ? "o" : "i") + " dal browser."
              : "Barra disegni: salvataggio automatico in questo browser; esporta e importa GeoJSON.";

          return wrap;
        },
      });
      map.addControl(new IoBar());

      map.on(L.Draw.Event.CREATED, function (e) {
        var layer = e.layer;
        if (layer && layer.options) {
          layer.options.pane = USER_DRAW_PANE;
        }
        openDrawingMetadataModal(
          map,
          function (titolo, descrizione, href) {
            setDrawingFeatureProps(layer, titolo, descrizione, href);
            drawnItems.addLayer(layer);
            schedulePersistDrawings();
          },
          function () {
            /* Annulla: non aggiungere il disegno alla mappa. */
          }
        );
      });
      map.on(L.Draw.Event.EDITED, schedulePersistDrawings);
      map.on(L.Draw.Event.DELETED, schedulePersistDrawings);
    })();

    (function setupOverlayCategoriesBulkToggle() {
      var root = layersControl.getContainer();
      if (!root) return;
      var section = root.querySelector(".leaflet-control-layers-list");
      var overlayList = root.querySelector(".leaflet-control-layers-overlays");
      if (!section || !overlayList) return;
      if (root.querySelector(".leaflet-overlay-bulk-toggle-wrap")) return;

      function getOverlayInputs() {
        return Array.prototype.slice.call(
          overlayList.querySelectorAll('input[type="checkbox"].leaflet-control-layers-selector')
        );
      }

      function enabledOverlayInputs() {
        return getOverlayInputs().filter(function (inp) {
          return !inp.disabled;
        });
      }

      function allEnabledOverlaysOn() {
        var list = enabledOverlayInputs();
        if (!list.length) return true;
        return list.every(function (inp) {
          return inp.checked;
        });
      }

      function applyAllOverlays(turnOn) {
        var list = enabledOverlayInputs();
        if (!list.length) return;
        list.forEach(function (inp) {
          inp.checked = turnOn;
        });
        /* Non usare .click() sul primo checkbox: il browser invertirebbe solo quello dopo
         * aver impostato .checked a mano. _onInputClick legge tutti gli stati e aggiorna la mappa. */
        if (typeof layersControl._onInputClick === "function") {
          layersControl._onInputClick();
        }
      }

      var wrap = document.createElement("div");
      wrap.className = "leaflet-overlay-bulk-toggle-wrap";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "Selezione rapida categorie overlay");

      var bulkBtn = document.createElement("button");
      bulkBtn.type = "button";
      bulkBtn.className = "leaflet-overlay-bulk-toggle";

      function syncBulkBtn() {
        var on = allEnabledOverlaysOn();
        bulkBtn.textContent = on ? "Deseleziona tutte" : "Seleziona tutte";
        bulkBtn.title = on
          ? "Nascondi tutti i livelli (scuole, itinerario critico, piste, pedonalità, aria, heatmap)"
          : "Mostra tutti i livelli disponibili nel pannello";
        bulkBtn.setAttribute("aria-pressed", on ? "true" : "false");
      }

      bulkBtn.addEventListener("click", function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
        applyAllOverlays(!allEnabledOverlaysOn());
        syncBulkBtn();
      });

      wrap.appendChild(bulkBtn);
      section.insertBefore(wrap, overlayList);
      syncBulkBtn();
      map.on("overlayadd overlayremove", syncBulkBtn);
    })();

    (function setupLayersPanelToggle() {
      var wrap = document.getElementById("map-wrap");
      var btn = document.getElementById("layers-panel-toggle");
      if (!wrap || !btn) return;
      function syncUi(hidden) {
        btn.setAttribute("aria-pressed", hidden ? "false" : "true");
        if (hidden) {
          btn.setAttribute(
            "aria-label",
            "Apri Elenco Dati e Mappe: tipo di carta, scuole, itinerario critico, piste, pedonalità, aria e heatmap"
          );
          btn.title =
            "Apri il riquadro Elenco Dati e Mappe (tipo di carta, scuole, itinerario critico, piste, pedonalità, aria, priorità geografiche)";
        } else {
          btn.setAttribute(
            "aria-label",
            "Comprimi il riquadro con tipo di carta, scuole, percorsi e altri livelli"
          );
          btn.title =
            "Comprimi il riquadro Elenco Dati e Mappe (tipo di carta, scuole, itinerario critico, piste, pedonalità, aria, priorità geografiche)";
        }
      }
      btn.addEventListener("click", function () {
        var hidden = wrap.classList.toggle("map-wrap--layers-hidden");
        syncUi(hidden);
        setTimeout(function () {
          map.invalidateSize();
        }, 0);
      });
      syncUi(wrap.classList.contains("map-wrap--layers-hidden"));
      setTimeout(function () {
        map.invalidateSize();
      }, 0);
    })();

    (function setupLegendToggle() {
      var btn = document.getElementById("legend-toggle-btn");
      var panel = document.getElementById("map-legend-panel");
      var stack = btn && btn.closest ? btn.closest(".map-legend-stack") : null;
      if (!btn || !panel || !stack) return;
      var legendLabel = btn.querySelector(".legend-toggle-btn__label");
      function setOpen(open) {
        if (open) {
          panel.removeAttribute("hidden");
          btn.setAttribute("aria-expanded", "true");
          if (legendLabel) legendLabel.textContent = "Nascondi legenda";
          else btn.textContent = "Nascondi legenda";
          stack.classList.add("legend-open");
        } else {
          panel.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", "false");
          if (legendLabel) legendLabel.textContent = "Mostra legenda";
          else btn.textContent = "Mostra legenda";
          stack.classList.remove("legend-open");
        }
      }
      btn.addEventListener("click", function () {
        setOpen(panel.hasAttribute("hidden"));
      });
    })();

    map.attributionControl.addAttribution(
      'Dati lineari: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap ODbL</a>'
    );
    map.attributionControl.addAttribution(
      'Aria: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)'
    );

    setupLayoutTextPanelToggle(map);

    setTimeout(function () {
      map.invalidateSize();
    }, 100);
  }

  function run() {
    var contentEl = document.getElementById(CONTENT_ID);
    if (!contentEl) return;

    Promise.all([
      fetch("content.md").then(function (r) {
        if (!r.ok) throw new Error("Impossibile leggere content.md (" + r.status + ").");
        return r.text();
      }),
      fetchJSON(URLS.overlays),
      tryFetchJSON(URLS.osmCycle),
      tryFetchJSON(URLS.osmPed),
      tryFetchJSON(URLS.schoolsPoi),
    ])
      .then(function (results) {
        var md = results[0];
        var geo = results[1];
        var cyc = results[2];
        var ped = results[3];
        var schools = results[4];
        contentEl.classList.remove("loading");
        contentEl.innerHTML = renderMarkdown(md);
        initMap(geo, cyc, ped, schools);
      })
      .catch(function (err) {
        contentEl.classList.remove("loading");
        contentEl.innerHTML =
          "<h2>Errore di caricamento</h2><p>" +
          (err && err.message ? err.message : String(err)) +
          "</p>" +
          "<p>Istruzioni per avviare il progetto in locale: vedi <strong>README.md</strong> nella cartella del repository " +
          "(serve un server HTTP, non <code>file://</code>).</p>";
        showFetchError(
          "Per leggere Markdown e GeoJSON via fetch serve HTTP. Consulta README.md nella root del progetto."
        );
        if (typeof L !== "undefined") {
          initMap(
            { type: "FeatureCollection", features: [] },
            { features: [] },
            { features: [] },
            { features: [] }
          );
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();

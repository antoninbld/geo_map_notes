// countries-overlay.js
// Overlay pays (GeoJSON) — filtre par ADM0_A3 et renvoie {center,bounds}

(function () {
  let mapRef = null;
  let ready = false;

  // IDs attendus par ton HTML
  const SRC_ID = "country-overlay-src";
  const FILL_ID = "country-overlay-fill";
  const OUTLINE_ID = "country-overlay-outline";

  // Où est servi le GeoJSON ?
  const DATA_URL = "data/countries.geojson"; // ← mets ton fichier ici (renomme “countries (1).geojson”)

  // Index mémoire pour résoudre noms/ISO2 -> ISO3 et pour bbox
  let _features = [];
  const iso2ToIso3 = new Map();
  const nameToIso3 = new Map();

  const slug = (s) =>
    String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  async function buildIndex(json) {
    _features = json.features || [];
    for (const f of _features) {
      const p = f.properties || {};
      const iso3 = p.ADM0_A3 || p.ISO_A3 || p.SOV_A3;
      if (!iso3) continue;
      if (p.ISO_A2) iso2ToIso3.set(String(p.ISO_A2).toUpperCase(), iso3);
      const names = [
        p.NAME_EN, p.NAME_FR, p.ADMIN, p.BRK_NAME, p.SOVEREIGNT,
        p.FORMAL_EN, p.FORMAL_FR
      ].filter(Boolean);
      for (const n of names) nameToIso3.set(slug(n), iso3);
      nameToIso3.set(slug(iso3), iso3); // "usa", "fra"…
    }
    // alias FR utiles
    nameToIso3.set("etats-unis", "USA");
    nameToIso3.set("egypte", "EGY");
    nameToIso3.set("israel", "ISR");
    // alias URSS -> Russie
    [
      "urss",
      "u.r.s.s.",
      "ussr",
      "union-sovietique",
      "union-des-republiques-socialistes-sovietiques",
      "soviet-union",
      "union-of-soviet-socialist-republics"
    ].forEach(k => nameToIso3.set(k, "RUS"));
      }

  async function ensureLoaded(map) {
    if (ready && mapRef === map) return true;
    mapRef = map;

    // source (affichage)
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: "geojson", data: DATA_URL });
    }
    // index (résolution noms -> ISO3 + bbox)
    if (_features.length === 0) {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      const json = await res.json();
      await buildIndex(json);
    }

    if (!map.getLayer(FILL_ID)) {
      map.addLayer({
        id: FILL_ID,
        type: "fill",
        source: SRC_ID,
        filter: ["==", ["get", "ADM0_A3"], "__NONE__"],
        layout: { visibility: "none" },
        paint: { "fill-color": "#60a5fa", "fill-opacity": 0.25 }
      });
    }
    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID,
        type: "line",
        source: SRC_ID,
        filter: ["==", ["get", "ADM0_A3"], "__NONE__"],
        layout: { visibility: "none" },
        paint: { "line-color": "#3b82f6", "line-width": 1.5 }
      });
    }
    try { map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); } catch {}

    ready = true;
    return true;
  }

  function resolveIso3(anyId) {
    if (!anyId) return null;
    let tok = String(anyId).trim();
    if (tok.toLowerCase().startsWith("ent-country-")) tok = tok.slice("ent-country-".length);

    const up = tok.toUpperCase();
    if (/^[A-Z]{3}$/.test(up)) return up; // ISO3 direct
    if (/^[A-Z]{2}$/.test(up)) return iso2ToIso3.get(up) || null; // ISO2

    return nameToIso3.get(slug(tok)) || null; // nom FR/EN
  }

  function computeBboxAndCenter(feat) {
    const g = feat?.geometry; if (!g) return null;
    const coords = g.type === "MultiPolygon" ? g.coordinates.flat(2)
                 : g.type === "Polygon"      ? g.coordinates.flat()
                 : null;
    if (!coords || !coords.length) return null;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const [x,y] of coords) { if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
    const center=[(minX+maxX)/2, (minY+maxY)/2];
    const bounds=[[minX,minY],[maxX,maxY]];
    return { center, bounds };
  }

  function getFeatureByIso3(iso3) {
    return _features.find(f => f?.properties?.ADM0_A3 === iso3) || null;
  }

  async function show(map, entLike) {
    await ensureLoaded(map);
    const iso3 = resolveIso3(entLike);
    if (!iso3) return null;

    try {
      map.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], iso3]);
      map.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], iso3]);
      map.setLayoutProperty(FILL_ID, "visibility", "visible");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "visible");
    } catch {}

    const feat = getFeatureByIso3(iso3);
    return computeBboxAndCenter(feat);
  }

  function hide(map) {
    try {
      map.setLayoutProperty(FILL_ID, "visibility", "none");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "none");
      map.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
      map.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
    } catch {}
  }

  function bringToFront() {
    try { mapRef?.moveLayer(FILL_ID); mapRef?.moveLayer(OUTLINE_ID); } catch {}
  }

  window.CountryOverlay = {
    init: async (map) => { await ensureLoaded(map); },
    show: async (map, entLike) => show(map, entLike),  // → {center,bounds} | null
    hide: (map) => hide(map),
    bringToFront
  };
})();

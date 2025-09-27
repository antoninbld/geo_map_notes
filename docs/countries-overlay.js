// countries-overlay.js
// Overlay des pays (GeoJSON) + centrage. Compatible avec ton HTML : window.CountryOverlay.{init,show,hide,bringToFront}

(function () {
  let mapRef = null;
  let ready = false;

  // IDs attendus par le HTML existant
  const SRC_ID = "country-overlay-src";
  const FILL_ID = "country-overlay-fill";
  const OUTLINE_ID = "country-overlay-outline";

  // ← adapte ce chemin si besoin
  const DATA_URL = "data/countries.geojson";

  // Index mémoire pour résoudre noms/ISO2 -> ISO3 et calculer bbox
  let _features = [];
  const iso2ToIso3 = new Map();
  const nameToIso3 = new Map();

  const slug = (s) =>
    String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  async function buildIndex(json) {
    _features = json?.features || [];
    for (const f of _features) {
      const p = f.properties || {};
      // Jeux de propriétés possibles selon la source (Natural Earth / autres)
      const iso3 = p.ADM0_A3 || p.ISO_A3 || p.SOV_A3 || p.GU_A3 || p.ISO3 || p.ISO_3 || p.ISO3_CODE;
      const iso2 = p.ISO_A2 || p.ISO2 || p.ISO_2;
      if (!iso3) continue;

      if (iso2) iso2ToIso3.set(String(iso2).toUpperCase(), String(iso3).toUpperCase());

      const names = [
        p.NAME, p.NAME_EN, p.NAME_FR, p.NAME_LONG,
        p.ADMIN, p.BRK_NAME, p.SOVEREIGNT, p.FORMAL_EN, p.FORMAL_FR
      ].filter(Boolean);

      for (const n of names) nameToIso3.set(slug(n), String(iso3).toUpperCase());
      nameToIso3.set(slug(String(iso3)), String(iso3).toUpperCase()); // "usa", "fra", etc.
    }

    // Alias FR/EN pratiques
    nameToIso3.set("etats-unis", "USA");
    nameToIso3.set("russie", "RUS");

    // ——— ALIAS URSS → Russie ———
    [
      "urss",
      "u-r-s-s",
      "u.r.s.s.",
      "union-sovietique",
      "union-des-republiques-socialistes-sovietiques",
      "union-des-republiques-socialistes-soviets", // variantes fréquentes
      "soviet-union",
      "union-of-soviet-socialist-republics",
      "ussr"
    ].forEach(k => nameToIso3.set(k, "RUS"));
  }

  async function ensureLoaded(map) {
    if (ready && mapRef === map) return true;
    mapRef = map;

    // 1) Source GeoJSON utilisée par les layers
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: "geojson", data: DATA_URL });
    }

    // 2) Index (lecture du même fichier pour résoudre noms/ISO3 + bbox)
    if (_features.length === 0) {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        const json = await res.json();
        await buildIndex(json);
      } catch (e) {
        console.warn("[CountryOverlay] Impossible de charger l’index via fetch:", e);
      }
    }

    // 3) Layers overlay (invisibles par défaut)
    if (!map.getLayer(FILL_ID)) {
      map.addLayer({
        id: FILL_ID,
        type: "fill",
        source: SRC_ID,
        // Filtre multi-propriétés (selon ton GeoJSON)
        filter: ["in", ["get", "ADM0_A3"], ["literal", ["__NONE__"]]],
        layout: { visibility: "none" },
        paint: { "fill-color": "#60a5fa", "fill-opacity": 0.25 }
      });
    }
    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID,
        type: "line",
        source: SRC_ID,
        filter: ["in", ["get", "ADM0_A3"], ["literal", ["__NONE__"]]],
        layout: { visibility: "none" },
        paint: { "line-color": "#3b82f6", "line-width": 1.5 }
      });
    }

    // Toujours remonter au-dessus des autres
    try { map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); } catch {}

    ready = true;
    return true;
  }

  function resolveIso3(anyId) {
    if (!anyId) return null;
    let tok = String(anyId).trim();

    // ent-country-xxx → xxx
    if (tok.toLowerCase().startsWith("ent-country-")) tok = tok.slice("ent-country-".length);

    const up = tok.toUpperCase();
    // ISO3 direct
    if (/^[A-Z]{3}$/.test(up)) return up;
    // ISO2 direct
    if (/^[A-Z]{2}$/.test(up)) return iso2ToIso3.get(up) || null;

    // Nom / alias
    const key = slug(tok);
    return nameToIso3.get(key) || null;
  }

  // Filtre “multi-clés” : certains fichiers n’ont pas ADM0_A3 ; on essaie plusieurs propriétés.
  function setIsoFilter(map, layerId, iso3) {
    const props = ["ADM0_A3", "ISO_A3", "SOV_A3", "GU_A3", "ISO3", "ISO_3", "ISO3_CODE"];
    // Construire: ["any", ["==", ["get","ADM0_A3"], iso3], ["==", ["get","ISO_A3"], iso3], ...]
    const anyClauses = ["any"];
    for (const p of props) anyClauses.push(["==", ["get", p], iso3]);
    map.setFilter(layerId, anyClauses);
  }

  function computeBboxAndCenter(feat) {
    const g = feat?.geometry;
    if (!g) return null;
    const coords =
      g.type === "MultiPolygon" ? g.coordinates.flat(2) :
      g.type === "Polygon" ? g.coordinates.flat() : null;
    if (!coords || !coords.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of coords) {
      const x = pt[0], y = pt[1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    const bounds = [[minX, minY], [maxX, maxY]];
    return { center, bounds };
  }

  function getFeatureByIso3(iso3) {
    return _features.find(f => {
      const p = f.properties || {};
      return (
        p.ADM0_A3 === iso3 || p.ISO_A3 === iso3 || p.SOV_A3 === iso3 ||
        p.GU_A3 === iso3 || p.ISO3 === iso3 || p.ISO_3 === iso3 || p.ISO3_CODE === iso3
      );
    }) || null;
  }

  async function show(map, entLike) {
    await ensureLoaded(map);
    const iso3 = resolveIso3(entLike);
    if (!iso3) {
      console.debug("[CountryOverlay] Pays introuvable pour:", entLike);
      return null;
    }

    try {
      setIsoFilter(map, FILL_ID, iso3);
      setIsoFilter(map, OUTLINE_ID, iso3);
      map.setLayoutProperty(FILL_ID, "visibility", "visible");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "visible");
      try { map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); } catch {}
    } catch (e) {
      console.warn("[CountryOverlay] setFilter/visibility a échoué:", e);
    }

    // centroïde + bbox depuis l’index en mémoire (fiable même hors viewport)
    const feat = getFeatureByIso3(iso3);
    return computeBboxAndCenter(feat);
  }

  function hide(map) {
    try {
      map.setLayoutProperty(FILL_ID, "visibility", "none");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "none");
      // Filtre neutre
      map.setFilter(FILL_ID, ["in", ["get", "ADM0_A3"], ["literal", ["__NONE__"]]]);
      map.setFilter(OUTLINE_ID, ["in", ["get", "ADM0_A3"], ["literal", ["__NONE__"]]]);
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

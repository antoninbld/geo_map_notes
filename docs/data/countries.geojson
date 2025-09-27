// countries-overlay.js
// Overlay pays avec VRAIES géométries (GeoJSON local). Aucune tuile externe.

window.CountryOverlay = (function () {
  const SRC_ID = 'country-overlay';
  const FILL_ID = 'country-overlay-fill';
  const OUTLINE_ID = 'country-overlay-outline';
  const EMPTY_FC = { type: 'FeatureCollection', features: [] };

  let world = null;            // GeoJSON monde
  let byISO3 = new Map();      // ISO3 -> [features...]
  let byName = new Map();      // nom normalisé -> [features...]
  let layersReady = false;

  // ——— utilitaires ———
  const norm = s => String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim();

  function iso3Of(feat) {
    const p = feat && feat.properties || {};
    return p.ISO_A3 || p.ADM0_A3 || p.iso3 || null;
  }
  function nameOf(feat) {
    const p = feat && feat.properties || {};
    return p.NAME_FR || p.NAME || p.NAME_EN || p.ADMIN || p.name || null;
  }

  function indexWorld(geojson) {
    byISO3.clear(); byName.clear();
    (geojson.features || []).forEach(f => {
      const i3 = iso3Of(f);
      const nm = nameOf(f);
      if (i3) {
        const arr = byISO3.get(i3) || [];
        arr.push(f); byISO3.set(i3, arr);
      }
      if (nm) {
        const key = norm(nm);
        const arr = byName.get(key) || [];
        arr.push(f); byName.set(key, arr);
      }
    });
  }

  async function ensureWorldLoaded() {
    if (world) return world;
    const res = await fetch('data/countries.geojson', { cache: 'no-store' });
    if (!res.ok) throw new Error('countries.geojson introuvable');
    world = await res.json();
    indexWorld(world);
    return world;
  }

  function ensureLayers(map) {
    if (layersReady) return true;
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: 'geojson', data: EMPTY_FC });
    }
    if (!map.getLayer(FILL_ID)) {
      map.addLayer({
        id: FILL_ID,
        type: 'fill',
        source: SRC_ID,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': '#60a5fa',
          'fill-opacity': 0.25
        }
      });
    }
    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID,
        type: 'line',
        source: SRC_ID,
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 1.5
        }
      });
    }
    layersReady = true;
    return true;
  }

  function hide(map) {
    try {
      const src = map.getSource(SRC_ID);
      if (src) src.setData(EMPTY_FC);
      if (map.getLayer(FILL_ID))    map.setLayoutProperty(FILL_ID, 'visibility', 'none');
      if (map.getLayer(OUTLINE_ID)) map.setLayoutProperty(OUTLINE_ID, 'visibility', 'none');
    } catch {}
  }

  // entId -> code ISO3 + fallback noms de correspondance
  function entToISO3(entId) {
    const LUT = {
      'ent-country-usa': 'USA',
      'ent-country-france': 'FRA',
      'ent-country-royaume-uni': 'GBR',
      'ent-country-inde': 'IND',
      'ent-country-pakistan': 'PAK',
      'ent-country-egypte': 'EGY',
      'ent-country-israel': 'ISR',
      'ent-country-chili': 'CHL',
      'ent-country-cuba': 'CUB',
      'ent-country-algerie': 'DZA',
      'ent-country-suriname': 'SUR',
      'ent-country-rwanda': 'RWA',
      'ent-country-honduras': 'HND',
      'ent-country-salvador': 'SLV',
      // URSS n’existe plus dans les jeux modernes : à toi de choisir un proxy
      'ent-country-urss': 'RUS'
    };
    return LUT[entId] || null;
  }

  function featuresForCountry(iso3, fallbackName = null) {
    // priorité ISO3
    if (iso3 && byISO3.has(iso3)) return byISO3.get(iso3);
    // fallback par nom
    if (fallbackName) {
      const arr = byName.get(norm(fallbackName));
      if (arr && arr.length) return arr;
    }
    return null;
  }

  // Affiche le pays pour entId. Renvoie { center, bounds } pour fitBounds éventuel
  async function show(map, entId) {
    await ensureWorldLoaded();
    ensureLayers(map);

    const iso3 = entToISO3(entId);
    let feats = null;

    // tentative par ISO3 puis par quelques alias de noms simples (ex: États-Unis/United States)
    if (iso3) feats = featuresForCountry(iso3);
    if (!feats) {
      const aliases = {
        'ent-country-usa': ['États-Unis', 'United States of America', 'United States'],
        'ent-country-egypte': ['Égypte', 'Egypt'],
        'ent-country-israel': ['Israël', 'Israel'],
      }[entId] || [];
      for (const nm of aliases) { feats = featuresForCountry(null, nm); if (feats) break; }
    }

    if (!feats || !feats.length) {
      console.warn('[CountryOverlay] pays introuvable pour', entId, '(ISO3=', iso3, ')');
      hide(map);
      return null;
    }

    const fc = { type: 'FeatureCollection', features: feats };
    const src = map.getSource(SRC_ID);
    if (src) src.setData(fc);

    map.setLayoutProperty(FILL_ID,    'visibility', 'visible');
    map.setLayoutProperty(OUTLINE_ID, 'visibility', 'visible');

    // centre/bounds depuis les géométries
    let bounds = null, center = null;
    try {
      if (window.turf && turf.bbox && turf.centroid) {
        const bb = turf.bbox(fc); // [minX,minY,maxX,maxY]
        bounds = new maplibregl.LngLatBounds([bb[0], bb[1]], [bb[2], bb[3]]);
        const c = turf.centroid(fc).geometry.coordinates; // [lon,lat]
        center = [c[0], c[1]];
      }
    } catch {}
    // fallback: bbox manuelle
    if (!bounds) {
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      feats.forEach(f => {
        const geom = f.geometry;
        const loop = (coords) => coords.forEach(ring => ring.forEach(([x,y]) => {
          if (x < bb[0]) bb[0] = x;
          if (y < bb[1]) bb[1] = y;
          if (x > bb[2]) bb[2] = x;
          if (y > bb[3]) bb[3] = y;
        }));
        if (geom.type === 'Polygon') loop(geom.coordinates);
        if (geom.type === 'MultiPolygon') geom.coordinates.forEach(loop);
      });
      bounds = new maplibregl.LngLatBounds([bb[0], bb[1]], [bb[2], bb[3]]);
      center = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    }
    return { center, bounds };
  }

  return { show, hide };
})();


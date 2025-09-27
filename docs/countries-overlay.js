// countries-overlay.js
// Overlay pays (GeoJSON) + centrage (centerOfMass + overrides) + focus pratique.
// API publique : window.CountryOverlay.{ init, show, hide, bringToFront, getOriginForCountry, setColors, focus }

(function () {
  let mapRef = null;
  let ready = false;

  // IDs MapLibre
  const SRC_ID     = "country-overlay-src";
  const FILL_ID    = "country-overlay-fill";
  const OUTLINE_ID = "country-overlay-outline";

  // URL du GeoJSON (adapte si besoin)
  const DATA_URL = "data/countries.geojson";

  // Style overlay (modifiable à chaud via setColors)
  let COUNTRY_OVERLAY_STYLE = {
    fill: "#db6402",   // demandé
    fillOpacity: 0.30,
    outline: "#db6402",
    outlineWidth: 1.6
  };

  // ======= TES OVERRIDES (ordre [lon, lat]) =======
  const COUNTRY_ORIGIN_OVERRIDES = new Map([
    ["RUS", [60.64540, 56.84309]],   // Iekaterinbourg
    ["USA", [-104.82119, 41.13474]], // Cheyenne
    ["CAN", [-113.49373, 53.54616]], // Edmonton
    ["AUS", [133.88074, -23.69804]], // Alice Springs
    ["IDN", [117.28500, -2.54890]],
    ["CHL", [-70.66926, -33.44888]], // Santiago
    ["GRL", [-41.00000, 74.00000]],
    ["NOR", [15.47000, 64.50000]]
  ]);
  // ================================================

  // Index mémoire (pour résolution nom/ISO et calculs)
  let _features = [];
  const iso2ToIso3 = new Map();
  const nameToIso3 = new Map();

  const slug = (s) =>
    String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  function log() { try { console.debug.apply(console, ["[CountryOverlay]"].concat([].slice.call(arguments))); } catch {} }

  async function buildIndex(json) {
    _features = json?.features || [];
    for (const f of _features) {
      const p = f.properties || {};
      const iso3 = (p.ADM0_A3 || p.ISO_A3 || p.SOV_A3 || p.GU_A3 || p.ISO3 || p.ISO_3 || p.ISO3_CODE || "").toUpperCase();
      const iso2 = (p.ISO_A2  || p.ISO2   || p.ISO_2  || "").toUpperCase();
      if (!iso3) continue;

      if (iso2) iso2ToIso3.set(iso2, iso3);

      const names = [p.NAME_FR, p.NAME_EN, p.NAME_LONG, p.NAME, p.ADMIN, p.BRK_NAME, p.SOVEREIGNT, p.FORMAL_EN, p.FORMAL_FR].filter(Boolean);
      for (const n of names) nameToIso3.set(slug(n), iso3);
      nameToIso3.set(slug(iso3), iso3);
    }

    // Alias utiles
    nameToIso3.set("etats-unis", "USA");
    nameToIso3.set("russie", "RUS");
    // Alias URSS → RUS
    ["urss","u-r-s-s","u.r.s.s.","union-sovietique","union-soviétique",
     "union-des-republiques-socialistes-sovietiques","union-des-republiques-socialistes-soviets",
     "soviet-union","union-of-soviet-socialist-republics","ussr"
    ].forEach(k => nameToIso3.set(slug(k), "RUS"));
  }

  async function ensureLoaded(map) {
    if (ready && mapRef === map) return true;
    mapRef = map;

    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: "geojson", data: DATA_URL });
    }

    if (_features.length === 0) {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        const json = await res.json();
        await buildIndex(json);
        log("Index ready. features=", _features.length);
      } catch (e) {
        console.warn("[CountryOverlay] fetch index failed:", e);
      }
    }

    const coalesceProp = ["coalesce",
      ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]
    ];

    if (!map.getLayer(FILL_ID)) {
      map.addLayer({
        id: FILL_ID, type: "fill", source: SRC_ID,
        filter: ["==", coalesceProp, "__NONE__"],
        layout: { visibility: "none" },
        paint: {
          "fill-color": COUNTRY_OVERLAY_STYLE.fill,
          "fill-opacity": COUNTRY_OVERLAY_STYLE.fillOpacity
        }
      });
    } else {
      map.setPaintProperty(FILL_ID, "fill-color", COUNTRY_OVERLAY_STYLE.fill);
      map.setPaintProperty(FILL_ID, "fill-opacity", COUNTRY_OVERLAY_STYLE.fillOpacity);
    }

    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID, type: "line", source: SRC_ID,
        filter: ["==", coalesceProp, "__NONE__"],
        layout: { visibility: "none" },
        paint: {
          "line-color": COUNTRY_OVERLAY_STYLE.outline,
          "line-width": COUNTRY_OVERLAY_STYLE.outlineWidth
        }
      });
    } else {
      map.setPaintProperty(OUTLINE_ID, "line-color", COUNTRY_OVERLAY_STYLE.outline);
      map.setPaintProperty(OUTLINE_ID, "line-width", COUNTRY_OVERLAY_STYLE.outlineWidth);
    }

    try { map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); } catch {}
    ready = true;
    return true;
  }

  function resolveIso3(anyId) {
    if (!anyId) return null;
    let tok = String(anyId).trim();
    if (/^ent-country-/i.test(tok)) tok = tok.slice("ent-country-".length);
    if (/urss|ussr|soviet/i.test(tok)) return "RUS";
    const up = tok.toUpperCase();
    if (/^[A-Z]{3}$/.test(up)) return up;
    if (/^[A-Z]{2}$/.test(up)) return iso2ToIso3.get(up) || null;
    return nameToIso3.get(slug(tok)) || null;
  }

  function computeGeometryInfo(feat) {
    if (!feat || !feat.geometry) return null;

    // Turf préféré : centerOfMass + bbox
    try {
      if (typeof turf !== "undefined" && turf) {
        const bb = turf.bbox(feat);
        let c   = turf.centerOfMass(feat);
        if (!c?.geometry?.coordinates) c = turf.pointOnFeature(feat);
        return {
          bounds: [[bb[0], bb[1]], [bb[2], bb[3]]],
          center: c?.geometry?.coordinates || null
        };
      }
    } catch (e) { console.warn("[CountryOverlay] turf.centerOfMass/pointOnFeature error:", e); }

    // Fallback manuel
    const g = feat.geometry;
    const flat = g.type === "MultiPolygon" ? g.coordinates.flat(2)
               : g.type === "Polygon"      ? g.coordinates.flat()
               : null;
    if (!flat || !flat.length) return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const [x,y] of flat) { if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    return { center:[(minX+maxX)/2,(minY+maxY)/2], bounds:[[minX,minY],[maxX,maxY]] };
  }

  function getFeatureByIso3(iso3) {
    return _features.find(f => {
      const p = f.properties || {};
      const code = (p.ADM0_A3 || p.ISO_A3 || p.SOV_A3 || p.GU_A3 || p.ISO3 || p.ISO_3 || p.ISO3_CODE || "").toUpperCase();
      return code === iso3;
    }) || null;
  }

  async function getOriginForCountry(map, entLike) {
    await ensureLoaded(map);
    const iso3 = resolveIso3(entLike);
    if (!iso3) return null;

    const feat = getFeatureByIso3(iso3);
    const info = computeGeometryInfo(feat) || {};

    let origin = info.center || null;
    if (COUNTRY_ORIGIN_OVERRIDES.has(iso3)) {
      origin = COUNTRY_ORIGIN_OVERRIDES.get(iso3);
    }
    return { iso3, origin, bounds: info.bounds || null };
  }

  function setIsoFilter(map, layerId, iso3) {
    const prop = ["coalesce",
      ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]
    ];
    map.setFilter(layerId, ["==", prop, iso3]);
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
      // (ré)appliquer les couleurs
      map.setPaintProperty(FILL_ID, "fill-color", COUNTRY_OVERLAY_STYLE.fill);
      map.setPaintProperty(FILL_ID, "fill-opacity", COUNTRY_OVERLAY_STYLE.fillOpacity);
      map.setPaintProperty(OUTLINE_ID, "line-color", COUNTRY_OVERLAY_STYLE.outline);
      map.setPaintProperty(OUTLINE_ID, "line-width", COUNTRY_OVERLAY_STYLE.outlineWidth);
      try { map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); } catch {}
    } catch (e) {
      console.warn("[CountryOverlay] setFilter/visibility failed:", e);
    }

    const info = await getOriginForCountry(map, iso3);
    return info ? { center: info.origin, bounds: info.bounds } : null;
  }

  function hide(map) {
    try {
      map.setLayoutProperty(FILL_ID, "visibility", "none");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "none");
      const prop = ["coalesce",
        ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]
      ];
      map.setFilter(FILL_ID, ["==", prop, "__NONE__"]);
      map.setFilter(OUTLINE_ID, ["==", prop, "__NONE__"]);
    } catch {}
  }

  function bringToFront() { try { mapRef?.moveLayer(FILL_ID); mapRef?.moveLayer(OUTLINE_ID); } catch {} }

  function setCountryOverlayColors(opts = {}) {
    COUNTRY_OVERLAY_STYLE = { ...COUNTRY_OVERLAY_STYLE, ...opts };
    try {
      if (mapRef?.getLayer(FILL_ID)) {
        if (opts.fill        !== undefined) mapRef.setPaintProperty(FILL_ID, "fill-color", opts.fill);
        if (opts.fillOpacity !== undefined) mapRef.setPaintProperty(FILL_ID, "fill-opacity", opts.fillOpacity);
      }
      if (mapRef?.getLayer(OUTLINE_ID)) {
        if (opts.outline      !== undefined) mapRef.setPaintProperty(OUTLINE_ID, "line-color", opts.outline);
        if (opts.outlineWidth !== undefined) mapRef.setPaintProperty(OUTLINE_ID, "line-width", opts.outlineWidth);
      }
    } catch {}
  }

  // -------- Focus helper (centrage/zoom selon override ou fitBounds pays) --------
  function computeRightPadding(map, { rightPanelPx = 420, marginRight = 12 } = {}) {
    const w = map.getContainer().clientWidth || 800;
    let rightPad = Math.round(rightPanelPx * 1.15) + marginRight + 8;
    return Math.min(rightPad, Math.max(0, w - 120)); // clamp pour éviter l'erreur "cannot fit"
  }

  async function focus(map, entLike, {
    zoom = 5.2,           // zoom utilisé si override (centre défini)
    duration = 700,
    curve = 1.42,
    rightPanelPx = 420,   // largeur de ton panneau latéral (px)
    marginRight = 12
  } = {}) {
    // 1) Afficher l’overlay + récupérer un centre/bounds pertinents
    const info = await show(map, entLike);
    if (!info) return;

    // 2) Origin prenant en compte overrides
    const originInfo = await getOriginForCountry(map, entLike);
    const hasOverride = !!(originInfo && originInfo.origin && originInfo.iso3 && COUNTRY_ORIGIN_OVERRIDES.has(originInfo.iso3));
    const origin = originInfo?.origin || info.center || null;

    // 3) Focus
    if (hasOverride && origin) {
      map.easeTo({ center: origin, zoom, duration, curve });
    } else if (info.bounds) {
      const rightPad = computeRightPadding(map, { rightPanelPx, marginRight });
      try {
        map.fitBounds(info.bounds, {
          padding: { top: 40, left: 40, bottom: 40, right: rightPad },
          duration,
          curve
        });
      } catch {
        if (origin) map.easeTo({ center: origin, zoom: Math.max(map.getZoom(), zoom), duration, curve });
      }
    } else if (origin) {
      map.easeTo({ center: origin, zoom, duration, curve });
    }
  }
  // -------------------------------------------------------------------------------

  window.CountryOverlay = {
    init: async (map) => { await ensureLoaded(map); },
    show: async (map, entLike) => show(map, entLike),
    hide: (map) => hide(map),
    bringToFront,
    getOriginForCountry: async (map, entLike) => getOriginForCountry(map, entLike),
    setColors: (opts) => setCountryOverlayColors(opts),
    focus: async (map, entLike, opts) => focus(map, entLike, opts)
  };
})();

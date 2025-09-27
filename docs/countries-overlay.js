// countries-overlay.js
// Overlay GeoJSON local pour afficher la géométrie réelle d’un pays via son ISO3
(function () {
  let mapRef = null;
  let isReady = false;

  // Harmonisation avec le HTML (ids utilisés par bringCountryOverlayToFront)
  const SRC_ID = "country-overlay-src";
  const FILL_ID = "country-overlay-fill";
  const OUTLINE_ID = "country-overlay-outline";

  // table ISO2 -> ISO3 (complète si besoin)
  const ISO2_TO_ISO3 = { FR:"FRA", GB:"GBR", US:"USA", DE:"DEU", IT:"ITA", ES:"ESP", RU:"RUS", EG:"EGY", IL:"ISR" };
  const toISO3 = (code) => {
    if (!code) return null;
    const c = String(code).trim().toUpperCase();
    return c.startsWith("ent-country-")
      ? c.replace(/^ent-country-/, "").toUpperCase() // ent-country-FRA -> FRA (si tu encodes déjà ISO3)
      : (c.length === 2 ? (ISO2_TO_ISO3[c] || null) : c);
  };

  async function ensureLoaded(map) {
    if (isReady && mapRef === map) return true;
    mapRef = map;

    // IMPORTANT : adapte ce chemin à ton déploiement (idéalement "data/countries.geojson")
    // Le fichier doit contenir un champ propriété "ADM0_A3" (Natural Earth)
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: "geojson", data: "data/countries.geojson" });
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
    isReady = true;
    return true;
  }

  // Renvoie { center:[lon,lat], bounds:[[minX,minY],[maxX,maxY]] } pour aider au centrage
  function show(map, isoLike) {
    if (!mapRef) mapRef = map;
    const iso3 = toISO3(isoLike);
    if (!iso3) return null;

    try {
      mapRef.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], iso3]);
      mapRef.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], iso3]);
      mapRef.setLayoutProperty(FILL_ID, "visibility", "visible");
      mapRef.setLayoutProperty(OUTLINE_ID, "visibility", "visible");
    } catch {}

    // Tente d’extraire bbox + centroïde depuis la source pour renvoyer à l’appelant
    try {
      const src = mapRef.getSource(SRC_ID);
      const data = src?._data || src?.serialize?.().data; // maplibre n’expose pas toujours les features
      // Si pas accessible, renvoie juste null (le fit sera géré autrement)
      if (!data || !data.features) return null;

      const feat = data.features.find(f => f?.properties?.ADM0_A3 === iso3);
      if (!feat) return null;

      // bbox "maison"
      const coords = (feat.geometry.type === "MultiPolygon")
        ? feat.geometry.coordinates.flat(2)
        : (feat.geometry.type === "Polygon"
            ? feat.geometry.coordinates.flat()
            : null);

      if (!coords || !coords.length) return null;

      let minX=+Infinity, minY=+Infinity, maxX=-Infinity, maxY=-Infinity;
      for (const [x,y] of coords) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
      const center=[(minX+maxX)/2, (minY+maxY)/2];
      const bounds=[[minX,minY],[maxX,maxY]];

      return { center, bounds };
    } catch { return null; }
  }

  function hide(map) {
    if (!mapRef) mapRef = map;
    try {
      mapRef.setLayoutProperty(FILL_ID, "visibility", "none");
      mapRef.setLayoutProperty(OUTLINE_ID, "visibility", "none");
      mapRef.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
      mapRef.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
    } catch {}
  }

  function bringToFront() {
    try { mapRef?.moveLayer(FILL_ID); mapRef?.moveLayer(OUTLINE_ID); } catch {}
  }

  // Expose une API qui colle à ton HTML
  window.CountryOverlay = {
    init: ensureLoaded, // optionnel : tu peux appeler init au chargement
    show: async (map, isoLike) => { await ensureLoaded(map); return show(map, isoLike); },
    hide: (map) => hide(map),
    bringToFront
  };
})();

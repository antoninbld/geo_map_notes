// countries-overlay.js
// Overlay GeoJSON local pour afficher la vraie géométrie d’un pays via son ISO3.

(function () {
  let mapRef = null;
  let ready = false;

  // Ids de la source et des couches
  const SRC_ID = "co-src";
  const FILL_ID = "co-fill";
  const OUTLINE_ID = "co-outline";

  // Petite table de correspondance optionnelle (si tu utilises parfois des codes ISO2)
  const ISO2_TO_ISO3 = {
    FR: "FRA", GB: "GBR", US: "USA", DE: "DEU", IT: "ITA", ES: "ESP",
    RU: "RUS", EG: "EGY", IL: "ISR" // complète si besoin
  };

  function toISO3(code) {
    if (!code) return null;
    const c = String(code).trim().toUpperCase();
    return c.length === 2 ? (ISO2_TO_ISO3[c] || null) : c;
  }

  async function ensureLoaded(map) {
    if (ready && mapRef === map) return true;
    mapRef = map;

    // Ajoute la source GeoJSON locale
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, {
        type: "geojson",
        // IMPORTANT : ton fichier est dans /data/countries.geojson
        data: "data/countries.geojson"
      });
    }

    // Calque de remplissage (caché par défaut)
    if (!map.getLayer(FILL_ID)) {
      map.addLayer({
        id: FILL_ID,
        type: "fill",
        source: SRC_ID,
        filter: ["==", ["get", "ADM0_A3"], "__NONE__"],
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#60a5fa",
          "fill-opacity": 0.25
        }
      });
    }

    // Calque de contour
    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID,
        type: "line",
        source: SRC_ID,
        filter: ["==", ["get", "ADM0_A3"], "__NONE__"],
        layout: { visibility: "none" },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 1.5
        }
      });
    }

    // Option : remonter au-dessus des traits/liens si tu en as
    try {
      map.moveLayer(FILL_ID);
      map.moveLayer(OUTLINE_ID);
    } catch (_) {}

    ready = true;
    return true;
  }

  function show(iso) {
    if (!mapRef) return;
    const iso3 = toISO3(iso);
    if (!iso3) return;

    try {
      mapRef.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], iso3]);
      mapRef.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], iso3]);
      mapRef.setLayoutProperty(FILL_ID, "visibility", "visible");
      mapRef.setLayoutProperty(OUTLINE_ID, "visibility", "visible");
    } catch (_) {}
  }

  function hide() {
    if (!mapRef) return;
    try {
      mapRef.setLayoutProperty(FILL_ID, "visibility", "none");
      mapRef.setLayoutProperty(OUTLINE_ID, "visibility", "none");
      mapRef.setFilter(FILL_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
      mapRef.setFilter(OUTLINE_ID, ["==", ["get", "ADM0_A3"], "__NONE__"]);
    } catch (_) {}
  }

  // API publique
  window.initCountryOverlay = async function initCountryOverlay(map) {
    await ensureLoaded(map);
    return { show, hide };
  };
})();

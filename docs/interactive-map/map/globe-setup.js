// ======================================================
// MODULE — CARTE / STYLES / GLOBE / TERRAIN / ROTATION
//
// Rôle :
//   - Créer la carte MapLibre (variable globale `map`)
//   - Gérer les styles MapTiler (streets / light / dark)
//   - Configurer le globe (projection, fog)
//   - Réinitialiser le terrain
//   - Gérer la rotation automatique du globe + bouton 🔄
//
// Utilisé par :
//   - interactive-map.js (recentrage, filtres, contrôles, panneaux)
//   - map/markers-and-clusters.js (zoom, padding, constantes zoom/centre)
// ======================================================

// ========= STYLES & CARTE =========

const STYLES = {
  streets: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
  light:   `https://api.maptiler.com/maps/basic/style.json?key=${MAPTILER_KEY}`,
  dark:    `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
};

let CURRENT_BASEMAP = 'streets';

function getStyleURL(base) {
  return STYLES[base] || STYLES.streets;
}

/**
* GLOBE SETUP — paramètres centraux pour l’apparence du globe. C’est ici que tu modifies le zoom, le centre, l’inclinaison, etc.*/

// ======== Vue initiale du globe =========

// Centre du globe (longitude, latitude)
export const GLOBE_CENTER = [0, 20];

// Zoom d’arrivée au chargement
// 👉 Augmente pour zoomer davantage sur le globe
// 👉 Diminue pour l'éloigner
export const GLOBE_ZOOM = 2.65;

// Inclinaison de la caméra (tilt)
export const GLOBE_PITCH = 25;


// ======== Vue Europe =========

// Centre du preset “Recentrer Europe”
export const EUROPE_CENTER = [10, 50];

// Zoom utilisé pour la vue Europe
export const EUROPE_ZOOM = 3.8;


// ======== Création de la carte =========

export const map = new maplibregl.Map({
  container: 'map',
  style: getStyleURL(CURRENT_BASEMAP),
  center: GLOBE_CENTER,
  zoom: GLOBE_ZOOM,
  pitch: GLOBE_PITCH,
  bearing: 0,
  projection: 'globe',
  renderWorldCopies: false
});

// ========= ROTATION GLOBE =========

// État interne de la rotation
let __npRotateOn  = false;
let __npRotateRAF = null;
let __npUserInteracting = false;

// Vitesse de rotation en degrés par seconde
const __npTEST_SPEED_DEG_PER_SEC = 7;

// Récupère le bouton de rotation dans le DOM
function getRotateBtn() {
  return document.getElementById('npRotateBtn');
}

// Met à jour l'apparence / l'ARIA du bouton selon l'état
function __npUpdateRotateBtn() {
  const btn = getRotateBtn();
  if (!btn) return;

  if (__npRotateOn) {
    btn.classList.add('is-on');
    btn.title = 'Arrêter la rotation';
    btn.setAttribute('aria-label', 'Arrêter la rotation du globe');
  } else {
    btn.classList.remove('is-on');
    btn.title = 'Rotation automatique';
    btn.setAttribute('aria-label', 'Activer la rotation du globe');
  }
}

// Une "frame" de rotation
function __npRotateStep(ts) {
  if (!__npRotateOn) {
    __npRotateRAF = null;
    return;
  }

  if (!__npUserInteracting) {
    const now = ts || performance.now();
    const dt  = (now - (__npRotateStep._lastTs || now));
    __npRotateStep._lastTs = now;

    const center = map.getCenter();
    let lon = center.lng;

    lon += __npTEST_SPEED_DEG_PER_SEC * (dt / 1000);
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    map.setCenter([lon, 0]);
  }

  __npRotateRAF = requestAnimationFrame(__npRotateStep);
}

// Toggle public appelé par le bouton 🔄
function npToggleRotation() {
  __npRotateOn = !__npRotateOn;

  if (__npRotateOn) {
    __npRotateStep._lastTs = undefined;
    if (!__npRotateRAF) {
      __npRotateRAF = requestAnimationFrame(__npRotateStep);
    }
  } else {
    if (__npRotateRAF) cancelAnimationFrame(__npRotateRAF);
    __npRotateRAF = null;
  }

  __npUpdateRotateBtn();
}

// On "freeze" la rotation pendant les interactions utilisateur
['dragstart', 'rotatestart', 'pitchstart', 'zoomstart'].forEach(ev =>
  map.on(ev, () => { __npUserInteracting = true; })
);

['dragend', 'rotateend', 'pitchend', 'zoomend'].forEach(ev =>
  map.on(ev, () => {
    __npUserInteracting = false;
    if (__npRotateOn) {
      const c = map.getCenter();
      map.easeTo({ center: [c.lng, 0], duration: 300 });
    }
  })
);

// Appelé après que le bouton a été créé
function updateRotateButtonVisibility() {
  const btn = getRotateBtn();
  if (!btn) return;
  btn.style.display = 'flex';
}

// ========= GLOBE & TERRAIN =========

// Projection "globe" + fog agréable
function setupGlobe() {
  try {
    map.setProjection({ type: 'globe' });
  } catch (e) {
    // certaines versions de MapLibre peuvent ne pas supporter la projection
  }

  if (typeof map.setFog === 'function') {
    try {
      map.setFog({
        range: [0.5, 10],
        color: 'rgba(160,190,220,0.9)',
        'horizon-blend': 0.25
      });
    } catch (e) {
      // fog non critique
    }
  }
}

// Terrain : on nettoie toujours (globe-only, pas de DEM ici)
function ensureTerrain() {
  try { map.setTerrain(null); } catch {}

  try {
    if (map.getLayer('terrain-hillshade')) {
      map.removeLayer('terrain-hillshade');
    }
  } catch {}

  try {
    if (map.getSource('terrain-dem-hs')) {
      map.removeSource('terrain-dem-hs');
    }
  } catch {}

  try {
    if (map.getSource('terrain-dem')) {
      map.removeSource('terrain-dem');
    }
  } catch {}
}

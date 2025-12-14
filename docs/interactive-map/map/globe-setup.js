// ======================================================
// MODULE — MAP / STYLES / GLOBE / ROTATION
// ======================================================
// Responsabilités :
// - Créer et exporter UNE instance MapLibre
// - Centraliser les constantes de navigation (globe / Europe)
// - Gérer projection globe + fog
// - Gérer la rotation automatique
// ======================================================


// ========= CONSTANTES DE VUE =========

// Globe (vue par défaut)
export const GLOBE_CENTER = [0, 20];
export const GLOBE_ZOOM   = 2.65;
export const GLOBE_PITCH  = 25;

// Europe (preset navigation)
export const EUROPE_CENTER = [10, 50];
export const EUROPE_ZOOM   = 3.8;


// ========= STYLES =========

const STYLES = {
  streets: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
  light:   `https://api.maptiler.com/maps/basic/style.json?key=${MAPTILER_KEY}`,
  dark:    `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
};

let CURRENT_BASEMAP = 'streets';

export function getStyleURL(name = CURRENT_BASEMAP) {
  return STYLES[name] || STYLES.streets;
}

export function setBasemap(name) {
  CURRENT_BASEMAP = name;
  map.setStyle(getStyleURL(name));
}


// ========= CRÉATION DE LA CARTE =========

export const map = new maplibregl.Map({
  container: 'map',
  style: getStyleURL(),
  center: GLOBE_CENTER,
  zoom: GLOBE_ZOOM,
  pitch: GLOBE_PITCH,
  bearing: 0,
  projection: 'globe',
  renderWorldCopies: false,
  antialias: true
});

// Expose la map pour les scripts non-modules (note-panel, links-layer, etc.)
window.map = map;

// ========= GLOBE =========

export function setupGlobe() {
  try {
    map.setProjection({ type: 'globe' });
  } catch {}

  if (typeof map.setFog === 'function') {
    try {
      map.setFog({
        range: [0.5, 10],
        color: 'rgba(160,190,220,0.9)',
        'horizon-blend': 0.25
      });
    } catch {}
  }
}


// ========= ROTATION AUTOMATIQUE =========

let rotateOn = false;
let rafId = null;
let userInteracting = false;

const ROTATION_SPEED_DEG_PER_SEC = 7;

function rotateStep(ts) {
  if (!rotateOn) {
    rafId = null;
    return;
  }

  if (!userInteracting) {
    const now = ts || performance.now();
    const dt = now - (rotateStep._lastTs || now);
    rotateStep._lastTs = now;

    const { lng } = map.getCenter();
    let nextLng = lng + ROTATION_SPEED_DEG_PER_SEC * (dt / 1000);

    if (nextLng > 180) nextLng -= 360;
    if (nextLng < -180) nextLng += 360;

    map.setCenter([nextLng, 0]);
  }

  rafId = requestAnimationFrame(rotateStep);
}

export function toggleGlobeRotation(forceState) {
  rotateOn = typeof forceState === 'boolean'
    ? forceState
    : !rotateOn;

  if (rotateOn) {
    rotateStep._lastTs = undefined;
    if (!rafId) rafId = requestAnimationFrame(rotateStep);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}


// ========= GESTION INTERACTIONS UTILISATEUR =========

['dragstart', 'rotatestart', 'pitchstart', 'zoomstart'].forEach(ev =>
  map.on(ev, () => { userInteracting = true; })
);

['dragend', 'rotateend', 'pitchend', 'zoomend'].forEach(ev =>
  map.on(ev, () => {
    userInteracting = false;
    if (rotateOn) {
      const { lng } = map.getCenter();
      map.easeTo({ center: [lng, 0], duration: 300 });
    }
  })
);


// ========= NETTOYAGE TERRAIN =========
// (sécurité si un style injecte du DEM)

export function ensureNoTerrain() {
  try { map.setTerrain(null); } catch {}

  ['terrain-dem', 'terrain-dem-hs'].forEach(id => {
    try { if (map.getSource(id)) map.removeSource(id); } catch {}
  });

  try {
    if (map.getLayer('terrain-hillshade')) {
      map.removeLayer('terrain-hillshade');
    }
  } catch {}
}

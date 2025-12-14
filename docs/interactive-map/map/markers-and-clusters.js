// ======================================================
// MODULE — MARKERS & CLUSTERS (ES MODULE)
// ======================================================
// Rôle :
// - Source "notes" + clusters
// - Interactions (clic / hover)
// - Ouverture du panel
// - Centrage strict sur le point + zoom fixe
// - Décalage de la MAP (conteneur) pour ne pas passer sous le panel
// ======================================================

import { map } from './globe-setup.js';

// ========= CONSTANTES =========
const NOTES_SOURCE_ID = 'notes';

const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
const EVENTS_BASE   = NOTE_RAW_BASE;
const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;

const INTERACTIVE_LAYERS = ['clusters', 'cluster-count', 'unclustered-point'];

// Zoom/pitch “au clic” (très dézoomé comme demandé)
const CLICK_VIEW = {
  zoom: 1.9,    // ✅ beaucoup plus dézoomé (baisse encore si besoin: 1.6)
  pitch: 10,    // doux
  duration: 900
};

// ========= ÉTAT =========
let selectedId = null;
let interactionsBound = false;


// ========= SOURCE + COUCHES =========
export async function ensureNotesSourceAndLayers() {
  await loadDataFromJSON();

  const features = (allData || []).map(item => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
    properties: { id: item.id, title: item.title }
  }));

  const geojson = { type: 'FeatureCollection', features };

  const src = map.getSource(NOTES_SOURCE_ID);
  if (!src) {
    map.addSource(NOTES_SOURCE_ID, {
      type: 'geojson',
      data: geojson,
      promoteId: 'id',
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });
  } else {
    src.setData(geojson);
  }

  ensureLayers();
  bindInteractionsOnce();
}


// ========= COUCHES =========
function ensureLayers() {
  if (!map.getLayer('clusters')) {
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: NOTES_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#ba274f',
        'circle-radius': 20
      }
    });
  }

  if (!map.getLayer('cluster-count')) {
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: NOTES_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': ['interpolate', ['linear'], ['zoom'], 0, 12, 6, 14, 10, 16],
        'text-anchor': 'center',
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#050404',
        'text-halo-color': '#050404',
        'text-halo-width': 0.3
      }
    });
  }

  if (!map.getLayer('unclustered-point')) {
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: NOTES_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#37cc12',
          '#ff2d2d'
        ],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 10,
          6
        ],
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'dim'], false], 0.25,
          1
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#7a0000'
      }
    });
  }
}


// ========= URL NOTES =========
export function resolveNoteURL(noteId) {
  const id = String(noteId);

  if (!id.startsWith('ent-')) {
    return `${EVENTS_BASE}/${encodeURIComponent(id)}.md`;
  }

  let sub = '';
  if (id.startsWith('ent-country-')) sub = 'countries';
  else if (id.startsWith('ent-org-')) sub = 'orgs';
  else if (id.startsWith('ent-person-')) sub = 'person';

  return `${ENTITIES_BASE}/${sub}/${encodeURIComponent(id)}.md`;
}


// ========= LAYOUT : “décaler la map” sans déplacer le point =========
// On ne touche PAS au contenu (pas d'offset/padding). On réduit la largeur du conteneur.
// => le point reste centré, et le panel ne recouvre plus la map.
function applyMapLayoutForPanel(isOpen) {
  const mapEl = document.getElementById('map');
  const panelEl = document.getElementById('notePanel');
  if (!mapEl || !panelEl) return;

  if (!mapEl.dataset.fullWidth) {
    // mémorise la largeur initiale (au cas où)
    mapEl.dataset.fullWidth = mapEl.style.width || '';
  }

  if (isOpen) {
    const panelW = panelEl.getBoundingClientRect().width || 0;
    const panelM = Number(window.UI_CONFIG?.panel?.marginRight ?? 10);
    const extra = 10;

    const cut = Math.max(0, Math.round(panelW + panelM + extra));
    mapEl.style.width = `calc(100% - ${cut}px)`;
  } else {
    mapEl.style.width = mapEl.dataset.fullWidth || '';
  }

  try { map.resize(); } catch {}
}


// ========= INTERACTIONS =========
function bindInteractionsOnce() {
  if (interactionsBound) return;
  interactionsBound = true;

  map.on('click', onMapClick);
  map.on('mousemove', onMapHover);
}

function onMapClick(e) {
  const layers = INTERACTIVE_LAYERS.filter(id => map.getLayer(id));
  const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];

  // ✅ Clic dans le vide : on ne fait rien (on ne ferme pas le panel, pas d'auto zoom)
  if (!hits.length) return;

  const cluster = hits.find(f => f.properties?.cluster || f.properties?.point_count != null);
  if (cluster) {
    zoomCluster(cluster);
    return;
  }

  const point = hits.find(f => f.layer?.id === 'unclustered-point');
  if (point) selectPoint(point);
}

function onMapHover(e) {
  const layers = INTERACTIVE_LAYERS.filter(id => map.getLayer(id));
  let hits = [];
  if (layers.length) {
    try { hits = map.queryRenderedFeatures(e.point, { layers }); } catch {}
  }
  map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
}


// ========= ACTIONS =========
function selectPoint(feature) {
  const id = feature.properties.id;
  const coords = feature.geometry.coordinates;

  // 1) Visuel sélection
  if (selectedId !== null) {
    try { map.setFeatureState({ source: NOTES_SOURCE_ID, id: selectedId }, { selected: false }); } catch {}
  }
  try { map.setFeatureState({ source: NOTES_SOURCE_ID, id }, { selected: true }); } catch {}
  selectedId = id;

  // 2) Ouvrir le panel
  window.openSummaryInPanel?.(id);

  // 3) Décaler la MAP (conteneur) pour ne pas passer sous le panel
  applyMapLayoutForPanel(true);

  // 4) Centrage STRICT sur le point + zoom fixe (très dézoomé)
  try {
    map.easeTo({
      center: coords,                 // ✅ centre = coords strict
      zoom: CLICK_VIEW.zoom,          // ✅ zoom fixé
      pitch: CLICK_VIEW.pitch,
      bearing: map.getBearing(),
      duration: CLICK_VIEW.duration,
      essential: true
    });
  } catch {}
}

function zoomCluster(feature) {
  const src = map.getSource(NOTES_SOURCE_ID);
  const clusterId = feature.properties.cluster_id;
  const center = feature.geometry.coordinates;

  if (!src?.getClusterExpansionZoom) {
    map.easeTo({ center, zoom: map.getZoom() + 1, duration: 500, essential: true });
    return;
  }

  src.getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (err) return;
    map.easeTo({
      center,
      zoom: Math.min(zoom + 1, 18),
      duration: 600,
      essential: true
    });
  });
}

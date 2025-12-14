// ======================================================
// MODULE — MARKERS & CLUSTERS (ES MODULE)
// ======================================================
// Rôle :
// - Créer / maintenir la source GeoJSON "notes"
// - Gérer clusters + points isolés
// - Gérer interactions (clic / hover)
// - Recentrer la vue en tenant compte du panel (padding right)
// - Fournir resolveNoteURL()
// ======================================================

import { map } from './globe-setup.js';

// ========= CONSTANTES =========
const NOTES_SOURCE_ID = 'notes';

const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
const EVENTS_BASE   = NOTE_RAW_BASE;
const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;

// Layers manipulés par ce module (utile pour queryRenderedFeatures)
const INTERACTIVE_LAYERS = ['clusters', 'cluster-count', 'unclustered-point'];

// ========= ÉTAT =========
let selectedId = null;
let interactionsBound = false;

// ========= SOURCE + COUCHES =========
export async function ensureNotesSourceAndLayers() {
  // Dépendance existante dans ton projet : charge allData + idToItem
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
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 12,
          6, 14,
          10, 16
        ],
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
          ['boolean', ['feature-state', 'selected'], false],
          '#37cc12',
          '#ff2d2d'
        ],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          10,
          6
        ],
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'dim'], false],
          0.25,
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

// ========= INTERACTIONS =========
function bindInteractionsOnce() {
  if (interactionsBound) return;
  interactionsBound = true;

  map.on('click', onMapClick);
  map.on('mousemove', onMapHover);
}

function onMapClick(e) {
  // On interroge uniquement nos layers (évite de cliquer des overlays)
  const layers = INTERACTIVE_LAYERS.filter(id => map.getLayer(id));
  const hits = layers.length
    ? map.queryRenderedFeatures(e.point, { layers })
    : [];

  if (!hits.length) {
    // clic dans le vide -> optionnel : fermer le panel
    window.__closeNotePanel?.();
    return;
  }

  const cluster = hits.find(f => f.properties?.cluster || f.properties?.point_count != null);
  if (cluster) {
    zoomCluster(cluster);
    return;
  }

  const point = hits.find(f => f.layer?.id === 'unclustered-point');
  if (point) {
    selectPoint(point);
  }
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

  // 1) Feature-state selection (visuel)
  if (selectedId !== null) {
    try {
      map.setFeatureState({ source: NOTES_SOURCE_ID, id: selectedId }, { selected: false });
    } catch {}
  }
  try {
    map.setFeatureState({ source: NOTES_SOURCE_ID, id }, { selected: true });
  } catch {}
  selectedId = id;

  // 2) Ouvre le panel (script global)
  window.openSummaryInPanel?.(id);

  // 3) Recentre + décale (précis) + zoom maîtrisé
  try {
    // --- largeur réelle du panel (plus précis que UI_CONFIG) ---
    const panelEl = document.getElementById('notePanel');
    const panelW = panelEl ? panelEl.getBoundingClientRect().width : Number(window.UI_CONFIG?.panel?.width ?? 400) * 1.25;

    const panelM = Number(window.UI_CONFIG?.panel?.marginRight ?? 10);
    const extra = 24;

    // décalage : la moitié du panel suffit généralement
    const offsetX = Math.round((panelW + panelM + extra) / 2);

    // --- zoom/pitch maîtrisés ---
    const currentZoom = map.getZoom();

    // cible douce pour le globe (ajuste à ton goût)
    const desiredZoom = Number(window.ARRIVAL_ZOOM ?? 3.2);

    // clamp : évite zoom trop fort ou trop faible
    const minZoom = 2.6;
    const maxZoom = 4.0;
    const targetZoom = Math.min(maxZoom, Math.max(minZoom, Math.max(currentZoom, desiredZoom)));

    const currentPitch = map.getPitch();
    const desiredPitch = Number(window.BASE_PITCH ?? 18);
    const maxPitch = 35;
    const targetPitch = Math.min(maxPitch, Math.max(currentPitch, desiredPitch));

    // --- offset robuste en pixels ---
    const p = map.project(coords);
    const newCenter = map.unproject([p.x + offsetX, p.y]).toArray();

    map.easeTo({
      center: newCenter,
      zoom: targetZoom,
      pitch: targetPitch,
      bearing: map.getBearing(),
      duration: 850,
      essential: true
    });
  } catch {
    // fallback simple
    try { map.easeTo({ center: coords, zoom: 3.2, duration: 650, essential: true }); } catch {}
  }
}

function zoomCluster(feature) {
  const src = map.getSource(NOTES_SOURCE_ID);
  const clusterId = feature.properties.cluster_id;
  const center = feature.geometry.coordinates;

  if (!src?.getClusterExpansionZoom) {
    map.easeTo({ center, zoom: map.getZoom() + 2, duration: 500 });
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

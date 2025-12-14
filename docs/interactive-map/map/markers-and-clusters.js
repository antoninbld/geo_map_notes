// ======================================================
// MODULE — MARKERS & CLUSTERS (ES MODULE)
// ======================================================
// Rôle :
// - Créer / maintenir la source GeoJSON "notes"
// - Gérer clusters + points isolés
// - Gérer les interactions (clic / survol)
// - Fournir resolveNoteURL()
// ======================================================

import { map } from './globe-setup.js';


// ========= CONSTANTES =========

const NOTES_SOURCE_ID = 'notes';

const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
const EVENTS_BASE   = NOTE_RAW_BASE;
const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;


// ========= ÉTAT =========

let selectedId = null;
let interactionsBound = false;


// ========= SOURCE + COUCHES =========

export async function ensureNotesSourceAndLayers() {
  await loadDataFromJSON(); // allData, idToItem

  const features = allData.map(item => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [item.lon, item.lat]
    },
    properties: {
      id: item.id,
      title: item.title
    }
  }));

  const geojson = {
    type: 'FeatureCollection',
    features
  };

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
  const hits = map.queryRenderedFeatures(e.point);

  const cluster = hits.find(f =>
    f.properties?.cluster || f.properties?.point_count != null
  );

  if (cluster) {
    zoomCluster(cluster);
    return;
  }

  const point = hits.find(f => f.layer?.id === 'unclustered-point');
  if (point) {
    selectPoint(point);
    return;
  }

}

function onMapHover(e) {
  const layers = ['clusters', 'cluster-count', 'unclustered-point']
    .filter(id => map.getLayer(id));

  let hits = [];
  if (layers.length) {
    try {
      hits = map.queryRenderedFeatures(e.point, { layers });
    } catch {}
  }

  map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
}


// ========= ACTIONS =========

function selectPoint(feature) {
  const id = feature.properties.id;
  const coords = feature.geometry.coordinates;

  if (selectedId !== null) {
    map.setFeatureState({ source: NOTES_SOURCE_ID, id: selectedId }, { selected: false });
  }

  map.setFeatureState({ source: NOTES_SOURCE_ID, id }, { selected: true });
  selectedId = id;

  openSummaryInPanel(id);

  try {
    const panelW = UI_CONFIG?.panel?.width ?? 400;
    const panelM = UI_CONFIG?.panel?.marginRight ?? 10;

    map.easeTo({
      center: coords,
      zoom: ARRIVAL_ZOOM,
      padding: { top: 20, left: 20, bottom: 20, right: panelW + panelM + 10 },
      duration: 600,
      pitch: Math.max(map.getPitch(), BASE_PITCH)
    });
  } catch {}
}

function zoomCluster(feature) {
  const src = map.getSource(NOTES_SOURCE_ID);
  const id  = feature.properties.cluster_id;
  const center = feature.geometry.coordinates;

  if (!src?.getClusterExpansionZoom) {
    map.easeTo({ center, zoom: map.getZoom() + 2, duration: 500 });
    return;
  }

  src.getClusterExpansionZoom(id, (err, zoom) => {
    if (err) return;
    map.easeTo({ center, zoom: Math.min(zoom + 1, 18), duration: 600 });
  });
}

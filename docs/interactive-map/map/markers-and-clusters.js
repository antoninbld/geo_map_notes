// ======================================================
// MODULE — MARKERS & CLUSTERS
//
// Rôle :
//   - Transformer `allData` en GeoJSON pour la source "notes"
//   - Créer les couches : clusters, cluster-count, unclustered-point
//   - Gérer les clics sur points / clusters
//   - Fournir resolveNoteURL() pour charger les .md
//   - Gérer l'ID de la note sélectionnée : __selectedId
//
// Utilisé par :
//   - interactive-map.js (map.on('load' / 'style.load' -> ensureNotesSourceAndLayers)
//   - note-panel / openSummaryInPanel (resolveNoteURL, __selectedId)
// ======================================================

// ========= SOURCE + COUCHES DES NOTES =========

async function ensureNotesSourceAndLayers() {
  // 1. S'assurer que les données sont chargées en mémoire
  await loadDataFromJSON(); // remplit allData, idToItem, etc.

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

  const notesSourceId = 'notes';
  const existingSource = map.getSource(notesSourceId);

  // 2. Source "notes"
  if (!existingSource) {
    map.addSource(notesSourceId, {
      type: 'geojson',
      data: geojson,
      promoteId: 'id',
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });
  } else {
    existingSource.setData(geojson);
  }

  // 3. Couche "clusters"
  if (!map.getLayer('clusters')) {
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: notesSourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#ba274f',
        'circle-radius': 20
      }
    });
  }

  // 4. Couche "cluster-count"
  if (!map.getLayer('cluster-count')) {
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: notesSourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': [
          'Open Sans Regular',
          'Noto Sans Regular',
          'Arial Unicode MS Regular'
        ],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 12,
          6, 14,
          10, 16
        ],
        'text-anchor': 'center',
        'text-offset': [0, 0],
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#050404',
        'text-halo-color': '#050404',
        'text-halo-width': 0.2
      }
    });
  }

  // 5. Couche "unclustered-point"
  if (!map.getLayer('unclustered-point')) {
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: notesSourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#37cc12', // sélectionné
          '#ff2d2d'  // normal
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

// ========= NOTES / RÉSEAU (URL des .md) =========

const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
const EVENTS_BASE   = NOTE_RAW_BASE;
const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;

// Retourne l'URL brute GitHub du .md correspondant à une note
function resolveNoteURL(noteId) {
  const idStr = String(noteId);

  // Notes "évènements"
  if (!idStr.startsWith('ent-')) {
    return `${EVENTS_BASE}/${encodeURIComponent(idStr)}.md`;
  }

  // Notes "entités"
  let sub = '';
  if (idStr.startsWith('ent-country-'))      sub = 'countries';
  else if (idStr.startsWith('ent-org-'))    sub = 'orgs';
  else if (idStr.startsWith('ent-person-')) sub = 'person';

  return `${ENTITIES_BASE}/${sub}/${encodeURIComponent(idStr)}.md`;
}

// ========= INTERACTIONS MARKERS / CLUSTERS =========

// ID de la note actuellement sélectionnée (partagé avec openSummaryInPanel)
let __selectedId = null;

// Clic sur un point isolé (unclustered-point)
function onClickUnclustered(e) {
  const feature = e.features && e.features[0];
  if (!feature || !feature.properties || feature.properties.id == null) return;

  const id     = feature.properties.id;
  const coords = feature.geometry && feature.geometry.coordinates;

  // Désélection de l'ancien point sélectionné
  if (__selectedId != null) {
    try {
      map.setFeatureState({ source: 'notes', id: __selectedId }, { selected: false });
    } catch (err) {
      console.warn('setFeatureState deselect error:', err);
    }
  }

  // Sélection du nouveau point
  try {
    map.setFeatureState({ source: 'notes', id }, { selected: true });
  } catch (err) {
    console.warn('setFeatureState select error:', err);
  }
  __selectedId = id;

  // Ouvrir le panneau de la note
  openSummaryInPanel(id);

  // Recentrer la carte pour laisser de la place au panneau
  try {
    const panelWidth  = parseInt((UI_CONFIG.panel && UI_CONFIG.panel.width) || '400', 10);
    const panelMargin = parseInt((UI_CONFIG.panel && UI_CONFIG.panel.marginRight) || '10', 10);
    const rightPad    = panelWidth + panelMargin + 10;

    if (coords && Array.isArray(coords)) {
      map.easeTo({
        center: coords,
        zoom: ARRIVAL_ZOOM,
        padding: { top: 20, left: 20, bottom: 20, right: rightPad },
        duration: 600,
        pitch: Math.max(map.getPitch(), BASE_PITCH)
      });
    }
  } catch (err) {
    console.warn('easeTo error:', err);
  }
}

// Clic sur un cluster
function onClickAnyCluster(e) {
  const feature = e && e.features && e.features[0];
  if (!feature) return;

  const props      = feature.properties || {};
  const rawId      = (props.cluster_id ?? props.clusterId);
  const clusterId  = (typeof rawId === 'string') ? parseInt(rawId, 10) : rawId;
  const sourceId   = (feature.layer && feature.layer.source) ? feature.layer.source : 'notes';
  const src        = map.getSource(sourceId);
  const center     = (feature.geometry && feature.geometry.coordinates) || map.getCenter();
  const fallbackZoom = Math.min(map.getZoom() + 3, 18);

  if (!src || clusterId == null || !Array.isArray(center)) {
    map.easeTo({ center, zoom: fallbackZoom, duration: 600 });
    return;
  }

  let done = false;
  const finish = (mode) => {
    if (done) return;
    done = true;
    if (mode === 'fallback') {
      map.easeTo({ center, zoom: fallbackZoom, duration: 600 });
    }
  };

  const tm = setTimeout(() => finish('fallback'), 200);

  try {
    if (typeof src.getClusterExpansionZoom === 'function') {
      src.getClusterExpansionZoom(clusterId, (err, z) => {
        if (done) return;
        clearTimeout(tm);

        if (err || typeof z !== 'number') {
          finish('fallback');
          return;
        }

        const target = Math.min(z + 1, 18);
        done = true;
        map.easeTo({ center, zoom: target, duration: 600 });
      });
    } else {
      clearTimeout(tm);
      finish('fallback');
    }
  } catch (ex) {
    clearTimeout(tm);
    finish('fallback');
  }
}

// ========= GESTES GLOBAUX (clic + survol) =========

// Gestion des clics sur la carte (clusters / points / vide)
map.on('click', (e) => {
  const hits = map.queryRenderedFeatures(e.point);
  if (!hits.length) {
    if (typeof clearLinks === 'function') clearLinks();
    return;
  }

  // 1) Un cluster ?
  const clusterFeature = hits.find(ft => {
    const p = ft && ft.properties;
    return p && (p.cluster === true || p.cluster_id != null || p.point_count != null);
  });

  if (clusterFeature) {
    onClickAnyCluster({ features: [clusterFeature] });
    return;
  }

  // 2) Un point isolé ?
  const pointFeature = hits.find(ft => ft.layer && ft.layer.id === 'unclustered-point');
  if (pointFeature) {
    onClickUnclustered({ features: [pointFeature] });
    return;
  }

  if (typeof clearLinks === 'function') clearLinks();
});

// Curseur "main" au survol de clusters / points
map.on('mousemove', (e) => {
  const layerIds = ['clusters', 'cluster-count', 'unclustered-point']
    .filter(id => map.getLayer(id));

  let hits = [];
  if (layerIds.length) {
    try {
      hits = map.queryRenderedFeatures(e.point, { layers: layerIds });
    } catch (err) {
      console.warn('queryRenderedFeatures error:', err);
    }
  }

  map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
});


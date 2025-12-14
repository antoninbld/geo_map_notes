// ======================================================
// MODULE — INTERACTIVE MAP (ORCHESTRATEUR) — ES MODULE
// ======================================================

import {
  map,
  GLOBE_CENTER,
  GLOBE_ZOOM,
  GLOBE_PITCH,
  EUROPE_CENTER,
  EUROPE_ZOOM,
  setupGlobe,
  ensureNoTerrain,
  getStyleURL,
  setBasemap,
  toggleGlobeRotation
} from './map/globe-setup.js';

import { ensureNotesSourceAndLayers } from './map/markers-and-clusters.js';

// ✅ liens (module propre)
import {
  ensureLinksLayer,
  drawLinksFrom
} from './links/links-layer.js';


// ========= ENTITY FOCUS LAYERS =========

function ensureEntityFocusLayers() {
  if (!map.getSource('entity-focus')) {
    map.addSource('entity-focus', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  if (!map.getLayer('entity-focus-links')) {
    map.addLayer({
      id: 'entity-focus-links',
      type: 'line',
      source: 'entity-focus',
      filter: ['==', ['get', 'kind'], 'edge'],
      layout: { visibility: 'none' },
      paint: {
        'line-width': 2,
        'line-color': '#db6402',
        'line-opacity': 0.8,
        'line-dasharray': [1.5, 1.5]
      }
    }, 'clusters');
  }

  if (!map.getLayer('entity-focus-point')) {
    map.addLayer({
      id: 'entity-focus-point',
      type: 'circle',
      source: 'entity-focus',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 6,
        'circle-color': '#db6402',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    }, 'clusters');
  }

  // MissileArcsLayer est défini dans interactive-map/entities/constellations-and-arcs.js (script global)
  if (typeof window.MissileArcsLayer !== 'undefined' && !map.getLayer('entity-focus-arcs-3d')) {
    map.addLayer(window.MissileArcsLayer);
  }
}


// ========= BOOTSTRAP MAP =========

let baseInitialized = false;

map.on('load', async () => {
  if (baseInitialized) return;
  baseInitialized = true;

  // Globe + état initial (avant d'ajouter des layers, c'est ok)
  setupGlobe();
  ensureNoTerrain();

  // Notes (source + clusters)
  await ensureNotesSourceAndLayers();

  // Liens (source + layer)
  ensureLinksLayer();

  // Entity focus
  ensureEntityFocusLayers();

  // Vue initiale
  map.jumpTo({
    center: GLOBE_CENTER,
    zoom: GLOBE_ZOOM,
    pitch: GLOBE_PITCH,
    bearing: 0
  });

  // Overlay pays (script global)
  if (window.CountryOverlay?.init) {
    window.CountryOverlay.init(map).catch(console.error);
  }
});

map.on('style.load', async () => {
  // À chaque changement de style, les sources/layers sautent -> on remet tout
  setupGlobe();
  ensureNoTerrain();

  await ensureNotesSourceAndLayers();
  ensureLinksLayer();
  ensureEntityFocusLayers();

  // Pays focus (si présent)
  if (window.CURRENT_FOCUSED_COUNTRY && window.CountryOverlay?.show) {
    await window.CountryOverlay.show(map, window.CURRENT_FOCUSED_COUNTRY);
    if (typeof window.bringCountryOverlayToFront === 'function') {
      window.bringCountryOverlayToFront();
    }
  }

  // Redessiner liens si on avait un état
  if (window.__lastLinksState) {
    drawLinksFrom(window.__lastLinksState.id, window.__lastLinksState.links);
  }
});

map.on('error', e => {
  console.error('Map error:', (e && (e.error || e)) || e);
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');


// ========= UI CONTROLS =========

class FilterControl {
  onAdd(mapInstance) {
    this._map = mapInstance;

    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group filters-ctrl';

    const btn = document.createElement('button');
    btn.className = 'filters-btn';
    btn.type = 'button';
    btn.title = 'Filtres';
    btn.textContent = 'Filtres';

    btn.addEventListener('click', () => {
      const panel = document.getElementById('filtersPanel');
      if (!panel) return;
      panel.style.display = (!panel.style.display || panel.style.display === 'none') ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('filtersPanel');
      const button = document.querySelector('.filters-btn');
      if (!panel || !button) return;

      if (panel.style.display === 'block' && !panel.contains(e.target) && !button.contains(e.target)) {
        panel.style.display = 'none';
      }
    });

    container.appendChild(btn);
    this._container = container;
    return container;
  }

  onRemove() {
    this._container?.remove();
    this._map = undefined;
  }
}
map.addControl(new FilterControl(), 'top-right');


class RotateControl {
  onAdd(mapInstance) {
    this._map = mapInstance;

    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const btn = document.createElement('button');
    btn.id = 'npRotateBtn';
    btn.type = 'button';
    btn.title = 'Rotation automatique';
    btn.textContent = '🔄';
    btn.addEventListener('click', () => toggleGlobeRotation());

    container.appendChild(btn);
    this._container = container;
    return container;
  }

  onRemove() {
    this._container?.remove();
    this._map = undefined;
  }
}
map.addControl(new RotateControl(), 'top-right');


// ========= BASEMAP SWITCH =========

function updateMapBackgroundClass(basemap) {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  if (basemap === 'dark') mapDiv.classList.add('dark');
  else mapDiv.classList.remove('dark');
}

window.addEventListener('load', () => {
  const checked = document.querySelector('input[name="basemap"]:checked');
  const base = checked?.value || 'streets';
  updateMapBackgroundClass(base);
});

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const base = e.target.value;
    updateMapBackgroundClass(base);

    try {
      setBasemap(base);
    } catch {
      map.setStyle(getStyleURL(base));
    }
  });
});


// ========= NAVIGATION =========

function recenterEurope() {
  map.easeTo({
    center: EUROPE_CENTER,
    zoom: EUROPE_ZOOM,
    duration: 600
  });
}

function recenterWorld(opts = { animate: true }) {
  const target = {
    center: GLOBE_CENTER,
    zoom: GLOBE_ZOOM,
    bearing: 0,
    pitch: GLOBE_PITCH
  };
  if (opts?.animate === false) map.jumpTo(target);
  else map.easeTo({ ...target, duration: 800 });
}

document.getElementById('recenterEurope')?.addEventListener('click', recenterEurope);
document.getElementById('recenterWorld')?.addEventListener('click', recenterWorld);


// ========= INIT (scripts globaux restants) =========

// filters.js est encore en <script> (global)
if (typeof window.initFilters === 'function') window.initFilters();

// config-and-helpers.js (global)
if (typeof window.applyUIConfig === 'function') window.applyUIConfig();

console.log('[OK] interactive-map.js loaded (clean)');

// ======================================================
// MODULE — LINKS LAYER (ES MODULE, PROPRE)
// ======================================================

import { map } from '../map/globe-setup.js';

const SOURCE_ID = 'note-links';
const LAYER_ID  = 'note-links-line';


// ========= INIT LAYER =========

export function ensureLinksLayer() {
  if (!map.isStyleLoaded()) return;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  const L = window.UI_CONFIG?.links || {};

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': L.lineColor || '#ff0088',
        'line-width': L.lineWidth || 3.5,
        'line-opacity': L.lineOpacity ?? 0.95,
        ...(L.lineDasharray ? { 'line-dasharray': L.lineDasharray } : {})
      }
    });
  } else {
    map.setPaintProperty(LAYER_ID, 'line-color', L.lineColor || '#ff0088');
    map.setPaintProperty(LAYER_ID, 'line-width', L.lineWidth || 3.5);
    map.setPaintProperty(LAYER_ID, 'line-opacity', L.lineOpacity ?? 0.95);

    if (L.lineDasharray) {
      map.setPaintProperty(LAYER_ID, 'line-dasharray', L.lineDasharray);
    } else {
      try { map.setPaintProperty(LAYER_ID, 'line-dasharray', null); } catch {}
    }
  }

  try { map.moveLayer(LAYER_ID); } catch {}
}


// ========= COURBES =========

function bezierCurveCoords(from, to, strength = 0.25, steps = 64) {
  const p0 = [from.lon, from.lat];
  const p2 = [to.lon, to.lat];

  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];

  const nx = -vy, ny = vx;
  const len = Math.hypot(nx, ny) || 1;
  const amp = strength * Math.hypot(vx, vy);

  const cx = mx + (nx / len) * amp;
  const cy = my + (ny / len) * amp;

  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    coords.push([
      it * it * p0[0] + 2 * it * t * cx + t * t * p2[0],
      it * it * p0[1] + 2 * it * t * cy + t * t * p2[1]
    ]);
  }
  return coords;
}

function geodesicCoords(from, to, steps = 64) {
  if (!(window.turf?.greatCircle)) {
    return [[from.lon, from.lat], [to.lon, to.lat]];
  }
  const fc = turf.greatCircle(
    [from.lon, from.lat],
    [to.lon, to.lat],
    { npoints: Math.max(2, steps) }
  );
  return fc.geometry.coordinates;
}

function curveBetween(from, to) {
  const L = window.UI_CONFIG?.links || {};
  const style = L.curveStyle || 'bezier';
  const steps = L.curveSteps || 64;

  if (style === 'geodesic') return geodesicCoords(from, to, steps);
  return bezierCurveCoords(from, to, L.curveStrength ?? 0.25, steps);
}


// ========= API PUBLIQUE =========

export function drawLinksFrom(noteId, linkedIds = []) {
  ensureLinksLayer();

  const src = map.getSource(SOURCE_ID);
  if (!src) return;

  const from = window.idToItem?.get?.(noteId);
  if (!from) {
    clearLinks();
    return;
  }

  const features = linkedIds
    .map(id => {
      const to = window.idToItem?.get?.(id);
      if (!to) return null;
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: curveBetween(from, to)
        },
        properties: { from: noteId, to: id }
      };
    })
    .filter(Boolean);

  src.setData({ type: 'FeatureCollection', features });
}

export function clearLinks() {
  const src = map.getSource(SOURCE_ID);
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
}

// ========= SOURCE + COUCHES DES NOTES (FACTO) =========
async function ensureNotesSourceAndLayers() {
  // 1. S'assurer que les données sont chargées
  await loadDataFromJSON();

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

  // 2. Source "notes"
  const notesSourceId = 'notes';
  const existingSource = map.getSource(notesSourceId);

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
          '#37cc12',  // sélectionné
          '#ff2d2d'   // normal
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

// ========= NOTES / RÉSEAU =========
const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
const EVENTS_BASE = NOTE_RAW_BASE;
const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;

function resolveNoteURL(noteId) {
  const idStr = String(noteId);
  if (!idStr.startsWith('ent-')) {
    // Notes "évènements"
    return `${EVENTS_BASE}/${encodeURIComponent(idStr)}.md`;
  }

  // Notes "entités"
  let sub = '';
  if (idStr.startsWith('ent-country-')) sub = 'countries';
  else if (idStr.startsWith('ent-org-')) sub = 'orgs';
  else if (idStr.startsWith('ent-person-')) sub = 'person';

  return `${ENTITIES_BASE}/${sub}/${encodeURIComponent(idStr)}.md`;
}

// ========= INTERACTIONS =========
let __selectedId = null;

function onClickUnclustered(e) {
  const feature = e.features && e.features[0];
  if (!feature || !feature.properties || feature.properties.id == null) return;

  const id = feature.properties.id;
  const coords = feature.geometry && feature.geometry.coordinates;

  // Reset ancien "selected"
  if (__selectedId != null) {
    try {
      map.setFeatureState({ source: 'notes', id: __selectedId }, { selected: false });
    } catch (err) {
      console.warn('setFeatureState deselect error:', err);
    }
  }

  // Nouveau "selected"
  try {
    map.setFeatureState({ source: 'notes', id }, { selected: true });
  } catch (err) {
    console.warn('setFeatureState select error:', err);
  }
  __selectedId = id;

  // Ouvrir le panneau de la note
  openSummaryInPanel(id);

  // Recentrer avec padding pour le panneau
  try {
    const panelWidth = parseInt((UI_CONFIG.panel && UI_CONFIG.panel.width) || '400', 10);
    const panelMarginRight = parseInt((UI_CONFIG.panel && UI_CONFIG.panel.marginRight) || '10', 10);
    const rightPad = panelWidth + panelMarginRight + 10;

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

function onClickAnyCluster(e) {
  const feature = e && e.features && e.features[0];
  if (!feature) return;

  const props = feature.properties || {};
  const rawId = (props.cluster_id ?? props.clusterId);
  const clusterId = (typeof rawId === 'string') ? parseInt(rawId, 10) : rawId;

  const sourceId = (feature.layer && feature.layer.source) ? feature.layer.source : 'notes';
  const src = map.getSource(sourceId);

  const center = (feature.geometry && feature.geometry.coordinates) || map.getCenter();
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

// ========= CHARGEMENT CARTE =========
map.on('load', async () => {
  await CountryOverlay.init(map);
  await ensureNotesSourceAndLayers();

  ensureLinksLayer();

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

  if (!map.getLayer('entity-focus-arcs-3d')) {
    map.addLayer(MissileArcsLayer);
  }

  setupGlobe();
  ensureTerrain();

  map.jumpTo({
    center: WORLD_CENTER,
    zoom: ARRIVAL_ZOOM,
    pitch: BASE_PITCH,
    bearing: 0
  });

  updateRotateButtonVisibility();
});

map.on('style.load', async () => {
  await CountryOverlay.init(map);
  setupGlobe();
  ensureTerrain();

  await ensureNotesSourceAndLayers();
  ensureLinksLayer();

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

  if (!map.getLayer('entity-focus-arcs-3d')) {
    map.addLayer(MissileArcsLayer);
  }

  if (CURRENT_FOCUSED_COUNTRY && window.CountryOverlay) {
    await CountryOverlay.show(map, CURRENT_FOCUSED_COUNTRY);
    bringCountryOverlayToFront();
  }

  if (window.__lastLinksState) {
    drawLinksFrom(window.__lastLinksState.id, window.__lastLinksState.links);
  }

  updateRotateButtonVisibility();
});

map.on('error', e => {
  console.error('Map error:', (e && (e.error || e)) || e);
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

// ========= CONTRÔLES =========
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
      panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('filtersPanel');
      const button = document.querySelector('.filters-btn');
      if (!panel || !button) return;
      if (
        panel.style.display === 'block' &&
        !panel.contains(e.target) &&
        !button.contains(e.target)
      ) {
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
    btn.addEventListener('click', npToggleRotation);

    container.appendChild(btn);
    this._container = container;

    setTimeout(() => {
      __npUpdateRotateBtn();
      updateRotateButtonVisibility();
    }, 0);

    return container;
  }

  onRemove() {
    this._container?.remove();
    this._map = undefined;
  }
}
map.addControl(new RotateControl(), 'top-right');

function updateMapBackgroundClass() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;
  if (CURRENT_BASEMAP === 'dark') {
    mapDiv.classList.add('dark');
  } else {
    mapDiv.classList.remove('dark');
  }
}

window.addEventListener('load', updateMapBackgroundClass);

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    CURRENT_BASEMAP = e.target.value;
    updateMapBackgroundClass();
    map.setStyle(getStyleURL(CURRENT_BASEMAP));
  });
});

// ========= FILTRES (pays bbox) =========
let countriesBbox = {};

async function loadCountries() {
  try {
    const res = await fetch('countries-bbox.json', { cache: 'no-store' });
    countriesBbox = await res.json();
    buildCountrySelect();
  } catch (e) {
    console.error('countries-bbox error:', e);
  }
}

function buildCountrySelect() {
  const sel = document.getElementById('filterCountry');
  if (!sel) return;

  sel.innerHTML = '';

  Object.keys(countriesBbox)
    .sort((a, b) => a.localeCompare(b))
    .forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
}

const countrySel = document.getElementById('filterCountry');
if (countrySel) {
  countrySel.addEventListener('mousedown', (e) => {
    const opt = e.target;
    if (opt.tagName === 'OPTION') {
      e.preventDefault();
      opt.selected = !opt.selected;
      countrySel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function pointInBbox(lon, lat, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
}

function applyFilters() {
  const query = (document.getElementById('filterQuery')?.value || '')
    .toLowerCase()
    .trim();

  const selectedTags = Array
    .from(document.querySelectorAll('input[name="tag"]:checked'))
    .map(i => i.value);

  const sel = document.getElementById('filterCountry');
  const selectedCountries = sel
    ? Array.from(sel.selectedOptions).map(o => o.value)
    : [];

  console.log('TODO filters:', {
    query,
    selectedTags,
    selectedCountries
  });

  // TODO: filtrer allData / source "notes" en fonction de ces critères
}

function resetFilters() {
  const q = document.getElementById('filterQuery');
  if (q) q.value = '';

  document
    .querySelectorAll('input[name="tag"]:checked')
    .forEach(cb => { cb.checked = false; });

  const sel = document.getElementById('filterCountry');
  if (sel) {
    Array.from(sel.options).forEach(o => { o.selected = false; });
  }

  const panel = document.getElementById('filtersPanel');
  if (panel) panel.style.display = 'none';

  map.easeTo({
    center: EUROPE_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 600
  });
}

document.getElementById('applyFilters')?.addEventListener('click', () => {
  applyFilters();
  const panel = document.getElementById('filtersPanel');
  if (panel) panel.style.display = 'none';
});

document.getElementById('resetFilters')?.addEventListener('click', resetFilters);

document.getElementById('selectAllCountries')?.addEventListener('click', () => {
  const sel = document.getElementById('filterCountry');
  if (!sel) return;
  Array.from(sel.options).forEach(o => { o.selected = true; });
});

document.getElementById('clearAllCountries')?.addEventListener('click', () => {
  const sel = document.getElementById('filterCountry');
  if (!sel) return;
  Array.from(sel.options).forEach(o => { o.selected = false; });
});

// ========= NAVIG / PANEL =========
function recenterEurope() {
  map.easeTo({
    center: EUROPE_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 600
  });
}

function recenterWorld(opts = { animate: true }) {
  const target = {
    center: WORLD_CENTER,
    zoom: ARRIVAL_ZOOM,
    bearing: 0,
    pitch: 0
  };
  if (opts && opts.animate === false) {
    map.jumpTo(target);
  } else {
    map.easeTo({ ...target, duration: 800 });
  }
}

document.getElementById('recenterEurope')?.addEventListener('click', recenterEurope);
document.getElementById('recenterWorld')?.addEventListener('click', recenterWorld);

// ========= PANEL : chargement note + recap + résumé =========
async function openSummaryInPanel(noteId) {
  const item = idToItem.get(noteId);

  const $panel = document.getElementById('notePanel');
  const $title = document.getElementById('npTitle');
  const $place = document.getElementById('npPlace');
  const $dateText = document.getElementById('npDateText');
  const $sum = document.getElementById('npSummary');
  const $md = document.getElementById('npMd');
  const $links = document.getElementById('npLinks');
  const $fit = document.getElementById('npFit');
  const $recap = document.getElementById('npRecap');

  if (!$panel || !$title || !$place || !$sum || !$md || !$links || !$recap) {
    console.error('Note panel elements missing');
    return;
  }

  if (!item) {
    // Cas où l'ID n'est pas connu
    $title.textContent = noteId;
    $place.textContent = '';
    if ($dateText) $dateText.textContent = '';
    $recap.innerHTML = '';
    $sum.innerHTML = '';
    $md.innerHTML = '';
    $links.innerHTML = '';
    $panel.style.display = 'block';
    return;
  }

  // Remplir titre / lieu / recap
  $title.textContent = item.title || noteId;
  $place.textContent = item.locationName || '';
  if ($dateText) $dateText.textContent = '';

  // Recap court (data.json)
  setRecapText(item.recap || '');

  // Au départ, on vide le résumé et le corps de la note
  $sum.innerHTML = '';
  $md.innerHTML = '';

  // Si un jour tu ajoutes "summary" dans data.json, on l'affiche ici :
  if (item.summary) {
    $sum.innerHTML = renderWikiLinksInline(item.summary);
  }

  let links = [];

  try {
    const url = resolveNoteURL(noteId);
    const res = await fetch(url, { cache: 'no-store' });

    if (res.ok) {
      const mdRaw = await res.text();
      const { meta, body } = parseAndStripFrontMatter(mdRaw);

      // ---------- Extraction éventuelle de la section "## Résumé" ----------
      function splitSummarySection(mdText) {
        const lines = mdText.split('\n');
        let start = -1;

        for (let i = 0; i < lines.length; i++) {
          if (/^##\s+Résumé\b/i.test(lines[i].trim())) {
            start = i;
            break;
          }
        }
        if (start === -1) {
          return { summaryMd: '', bodyMd: mdText };
        }

        let end = lines.length;
        for (let j = start + 1; j < lines.length; j++) {
          if (/^#{1,6}\s+/.test(lines[j].trim())) {
            end = j;
            break;
          }
        }

        const summaryMd = lines.slice(start + 1, end).join('\n').trim();
        const bodyMd = lines.slice(0, start).concat(lines.slice(end)).join('\n').trim();

        return { summaryMd, bodyMd };
      }

      const { summaryMd, bodyMd } = splitSummarySection(body);

      // Si data.json n'avait pas de summary et que le .md a une section "## Résumé"
      if (!$sum.innerHTML && summaryMd) {
        // On rend le résumé dans npSummary
        $sum.innerHTML = marked.parse(transformWikiLinks(summaryMd));
      }

      // Entités (chips)
      let ents = Array.isArray(meta.entities) ? meta.entities : [];
      ents = ents.map(e => normalizeEntityLabelToId(e)).filter(Boolean);

      if (ents.length) {
        renderEntityChips(ents);
      } else {
        const box = document.getElementById('npEntities');
        if (box) box.innerHTML = '';
      }

      // Date (front-matter)
      if ($dateText && !$dateText.textContent && meta.date) {
        $dateText.textContent = formatDateByConfig(meta.date);
      }

      // Recap éventuel depuis le front-matter (fallback si jamais npRecap était vide)
      if (!$recap.innerHTML && meta.recap) {
        setRecapText(meta.recap);
      }

      // Liens sortants
      links = extractWikiLinks(mdRaw).filter(id => idToItem.has(id));

      // On affiche le corps de la note sans la section "## Résumé"
      const finalBody = bodyMd || body;
      $md.innerHTML = marked.parse(transformWikiLinks(finalBody));
    } else {
      $md.innerHTML = `<em style="color:#888;">Note complète indisponible (HTTP ${res.status})</em>`;
    }
  } catch (err) {
    console.error('Error loading note', err);
    $md.innerHTML = `<em style="color:#888;">Note complète indisponible</em>`;
  }

  // Liens sortants dans le panneau
  if (!links.length) {
    $links.innerHTML = '<div style="color:#888;">Aucun lien sortant</div>';
  } else {
    const itemsHtml = links.map(lid => {
      const it = idToItem.get(lid);
      const lbl = it?.title || lid;
      return `<li><a href="note.html?id=${encodeURIComponent(lid)}" class="internal-link">${lbl}</a></li>`;
    }).join('');

    $links.innerHTML = `<ul style="margin:0; padding-left:18px;">${itemsHtml}</ul>`;
  }

  // Afficher le panneau
  $panel.style.display = 'block';

  // Augmenter un peu la largeur du panneau
  try {
    const baseW = parseInt((UI_CONFIG?.panel?.width ?? 400), 10);
    $panel.style.width = Math.round(baseW * 1.25) + 'px';
  } catch (err) {
    console.warn('Panel width error:', err);
  }

  // Mettre en surbrillance le point sélectionné
  try {
    if (__selectedId != null && __selectedId !== noteId) {
      map.setFeatureState({ source: 'notes', id: __selectedId }, { selected: false });
    }
    map.setFeatureState({ source: 'notes', id: noteId }, { selected: true });
    __selectedId = noteId;
  } catch (err) {
    console.warn('setFeatureState in panel error:', err);
  }

  // Cliques internes sur les liens "note.html?id=XXX" dans le panneau
  $panel.querySelectorAll('a[href^="note.html?id="]').forEach(a => {
    a.classList.add('internal-link');
    a.addEventListener('click', (e) => {
      e.preventDefault();

      const href = a.getAttribute('href');
      const id = decodeURIComponent(href.split('id=')[1] || '');
      if (!id) return;

      openSummaryInPanel(id);

      try {
        if (__selectedId != null && __selectedId !== id) {
          map.setFeatureState({ source: 'notes', id: __selectedId }, { selected: false });
        }
        map.setFeatureState({ source: 'notes', id }, { selected: true });
        __selectedId = id;
      } catch (err2) {
        console.warn('setFeatureState internal link error:', err2);
      }

      getOutgoingLinks(id).then(lnk => {
        drawLinksFrom(id, lnk);
        window.__lastLinksState = { id, links: lnk };

        const from = idToItem.get(id);
        if (from) {
          const panelW = parseInt((UI_CONFIG?.panel?.width ?? 400), 10);
          const panelRight = parseInt((UI_CONFIG?.panel?.marginRight ?? 10), 10);
          const rightPad = Math.round(panelW * 1.25) + panelRight + 10;

          map.easeTo({
            center: [from.lon, from.lat],
            zoom: ARRIVAL_ZOOM,
            padding: { top: 20, left: 20, bottom: 20, right: rightPad },
            duration: 600,
            pitch: Math.max(map.getPitch(), BASE_PITCH)
          });
        }
      });
    });
  });

  // Bouton "ajuster la vue" (npFit)
  if ($fit) {
    $fit.onclick = () => {
      const bounds = new maplibregl.LngLatBounds();
      const from = idToItem.get(noteId);
      if (from) bounds.extend([from.lon, from.lat]);
      links.forEach(lid => {
        const t = idToItem.get(lid);
        if (t) bounds.extend([t.lon, t.lat]);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, duration: 650 });
      }
    };
  }

  // Dessiner les liens sur la carte
  drawLinksFrom(noteId, links);
  window.__lastLinksState = { id: noteId, links };
}

// ========= GESTES GLOBAUX =========
map.on('click', (e) => {
  const hits = map.queryRenderedFeatures(e.point);
  if (!hits.length) {
    if (typeof clearLinks === 'function') clearLinks();
    return;
  }

  // Un cluster ?
  const clusterFeature = hits.find(ft => {
    const p = ft && ft.properties;
    return p && (p.cluster === true || p.cluster_id != null || p.point_count != null);
  });

  if (clusterFeature) {
    onClickAnyCluster({ features: [clusterFeature] });
    return;
  }

  // Un point isolé ?
  const pointFeature = hits.find(ft => ft.layer && ft.layer.id === 'unclustered-point');
  if (pointFeature) {
    onClickUnclustered({ features: [pointFeature] });
    return;
  }

  if (typeof clearLinks === 'function') clearLinks();
});

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

// ========= FERMETURE PANNEAU NOTE =========
(function setupNotePanelClose() {
  const btn = document.getElementById('npClose');
  if (!btn) return;

  const closePanel = () => {
    const panel = document.getElementById('notePanel');
    if (panel) {
      panel.style.display = 'none';
      try {
        const baseW = parseInt((UI_CONFIG?.panel?.width ?? 400), 10);
        panel.style.width = baseW + 'px';
      } catch (err) {
        console.warn('reset panel width error:', err);
      }
    }

    if (typeof clearLinks === 'function') clearLinks();

    try {
      map.easeTo({
        center: WORLD_CENTER,
        zoom: ARRIVAL_ZOOM,
        padding: { top: 0, left: 0, bottom: 0, right: 0 },
        duration: 500
      });
    } catch (err2) {
      console.warn('easeTo on close error:', err2);
    }
  };

  btn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
})();

// ========= TOGGLE PANNEAU LATÉRAL (mapPanel) =========
(function setupMapPanelToggle() {
  const panel = document.getElementById('mapPanel');
  const toggle = document.getElementById('mapPanelToggle');
  const close = document.getElementById('mapPanelClose');

  if (!panel || !toggle || !close) return;

  const show = () => {
    panel.classList.remove('panel-hidden');
    toggle.setAttribute('aria-expanded', 'true');
  };

  const hide = () => {
    panel.classList.add('panel-hidden');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const opened = toggle.getAttribute('aria-expanded') === 'true';
    opened ? hide() : show();
  });

  close.addEventListener('click', hide);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  // Panneau caché par défaut
  hide();
})();

// ========= INIT =========
loadCountries();
applyUIConfig();

map.on('load', () => console.log('[OK] map load'));
map.on('style.load', () => console.log('[OK] style load'));

setTimeout(() => {
  console.log('[CHK] source notes =', !!map.getSource('notes'));
}, 1500);

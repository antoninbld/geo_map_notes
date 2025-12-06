// ======================================================
// MODULE — INTERACTIVE MAP (ORCHESTRATEUR)
//
// Rôle :
//   - Réagir aux événements de la map (load / style.load / error)
//   - Initialiser les couches "entity-focus" + arcs 3D
//   - Brancher les modules : CountryOverlay, links, markers, filters
//   - Gérer les contrôles UI (Filtres, Rotation, basemap)
//   - Gérer la navigation (recenter Europe / Monde)
//   - Gérer le panneau de note (openSummaryInPanel)
// ======================================================


// ========= FACTO : LAYERS ENTITY-FOCUS =========
// (utilisé à la fois dans map.on('load') et map.on('style.load'))

function ensureEntityFocusLayers() {
  // Source
  if (!map.getSource('entity-focus')) {
    map.addSource('entity-focus', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  // Liens
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

  // Point focus
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

  // Arcs 3D
  if (!map.getLayer('entity-focus-arcs-3d')) {
    map.addLayer(MissileArcsLayer);
  }
}


// ========= CHARGEMENT CARTE =========

// Flag pour éviter de rerun la grosse init si MapLibre relance "load"
let __mapBaseInitialized = false;

map.on('load', async () => {
  if (__mapBaseInitialized) return;
  __mapBaseInitialized = true;

  // 1) Points/clusters le plus vite possible
  await ensureNotesSourceAndLayers();
  ensureLinksLayer();

  // 2) Couches "entity-focus" (facto dans une fonction)
  ensureEntityFocusLayers();

  // 3) Globe + terrain + vue initiale
  setupGlobe();
  ensureTerrain();

  map.jumpTo({
    center: WORLD_CENTER,
    zoom: ARRIVAL_ZOOM,
    pitch: BASE_PITCH,
    bearing: 0
  });

  updateRotateButtonVisibility();

  // 4) Overlay pays en "arrière-plan" (on ne bloque pas l'affichage)
  CountryOverlay.init(map).catch(console.error);
});

map.on('style.load', async () => {
  // Changement de fond de carte (streets/light/dark)

  // Reprojeter en globe + nettoyer terrain
  setupGlobe();
  ensureTerrain();

  // Recréer les points/couches liés au style
  await ensureNotesSourceAndLayers();
  ensureLinksLayer();

  // Recréer/garantir les couches "entity-focus"
  ensureEntityFocusLayers();

  // Si un pays était déjà focus : on le remet
  if (CURRENT_FOCUSED_COUNTRY && window.CountryOverlay) {
    await CountryOverlay.show(map, CURRENT_FOCUSED_COUNTRY);
    bringCountryOverlayToFront();
  }

  // Si des liens étaient affichés : on les redessine
  if (window.__lastLinksState) {
    drawLinksFrom(window.__lastLinksState.id, window.__lastLinksState.links);
  }

  updateRotateButtonVisibility();
});

map.on('error', e => {
  console.error('Map error:', (e && (e.error || e)) || e);
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');


// ========= CONTRÔLES (Filtres / Rotation) =========

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
      panel.style.display = (panel.style.display === 'none' || !panel.style.display)
        ? 'block'
        : 'none';
    });

    // Fermeture auto du panneau si clic à l'extérieur
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

    // Laisser le temps au DOM d'insérer le bouton, puis le mettre à jour
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


// ========= BASCULE FOND DE CARTE =========

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


// ========= NAVIGATION (Monde / Europe) =========

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


// ========= OPTIMISATION : CACHE DES NOTES =========

// On évite de refetch la même note Markdown à chaque clic
const NOTE_CACHE = new Map();

// Extraction de la section "## Résumé" (déplacée hors de openSummaryInPanel
// pour éviter de recréer la fonction à chaque appel)
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

// Charge + parse une note, avec cache
async function fetchAndParseNote(noteId) {
  if (NOTE_CACHE.has(noteId)) {
    return NOTE_CACHE.get(noteId);
  }

  const url = resolveNoteURL(noteId);
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    // On ne met pas en cache les erreurs, pour permettre un retry
    return { error: res.status };
  }

  const mdRaw = await res.text();
  const { meta, body } = parseAndStripFrontMatter(mdRaw);
  const { summaryMd, bodyMd } = splitSummarySection(body);
  const links = extractWikiLinks(mdRaw).filter(id => idToItem.has(id));

  const parsed = { meta, body, summaryMd, bodyMd, links };
  NOTE_CACHE.set(noteId, parsed);
  return parsed;
}


// ========= PANEL : chargement note + recap + résumé =========

async function openSummaryInPanel(noteId) {
  const item = idToItem.get(noteId);

  const $panel  = document.getElementById('notePanel');
  const $title  = document.getElementById('npTitle');
  const $place  = document.getElementById('npPlace');
  const $dateText = document.getElementById('npDateText');
  const $sum    = document.getElementById('npSummary');
  const $md     = document.getElementById('npMd');
  const $links  = document.getElementById('npLinks');
  const $fit    = document.getElementById('npFit');
  const $recap  = document.getElementById('npRecap');

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
    const parsed = await fetchAndParseNote(noteId);

    if (parsed?.error) {
      $md.innerHTML = `<em style="color:#888;">Note complète indisponible (HTTP ${parsed.error})</em>`;
    } else if (parsed) {
      const { meta, summaryMd, bodyMd, body, links: noteLinks } = parsed;
      links = noteLinks || [];

      // Si data.json n'avait pas de summary et que le .md a une section "## Résumé"
      if (!$sum.innerHTML && summaryMd) {
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

      // On affiche le corps de la note sans la section "## Résumé"
      const finalBody = bodyMd || body;
      $md.innerHTML = marked.parse(transformWikiLinks(finalBody));
    } else {
      $md.innerHTML = `<em style="color:#888;">Note complète indisponible</em>`;
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
      const it  = idToItem.get(lid);
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
      const id   = decodeURIComponent(href.split('id=')[1] || '');
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
          const panelW   = parseInt((UI_CONFIG?.panel?.width ?? 400), 10);
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
  const panel  = document.getElementById('mapPanel');
  const toggle = document.getElementById('mapPanelToggle');
  const close  = document.getElementById('mapPanelClose');

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

initFilters();
applyUIConfig();

map.on('load', () => console.log('[OK] map load'));
map.on('style.load', () => console.log('[OK] style load'));

setTimeout(() => {
  console.log('[CHK] source notes =', !!map.getSource('notes'));
}, 1500);

// ======================================================
// MODULE — FILTRES (recherche, tags, pays)
//
// Rôle :
//   - Charger le fichier countries-bbox.json (bbox par pays)
//   - Remplir la liste des pays (#filterCountry)
//   - Gérer la multi-sélection de pays dans le <select>
//   - Gérer les boutons Appliquer / Réinitialiser / Tout sélectionner / Tout désélectionner
//   - Fournir initFilters() à appeler depuis interactive-map.js
//
// Ne fait PAS :
//   - La création de la carte (map, styles, globe… → globe-setup.js)
//   - La gestion des markers/clusters (→ map/markers-and-clusters.js)
//   - Le panneau de note (→ panel/note-panel.js / interactive-map.js)
// ======================================================

// ========= ÉTAT INTERNE =========
let countriesBbox = {};

// ========= CHARGEMENT DES PAYS & SELECT =========

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

// ========= MULTI-SÉLECTION DANS #filterCountry =========

function setupCountryMultiSelect() {
  const countrySel = document.getElementById('filterCountry');
  if (!countrySel) return;

  countrySel.addEventListener('mousedown', (e) => {
    const opt = e.target;
    if (opt.tagName === 'OPTION') {
      // Permet de (dé)sélectionner un pays sans maintenir Ctrl
      e.preventDefault();
      opt.selected = !opt.selected;
      countrySel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

// ========= UTILITAIRE GÉO (potentiellement utile plus tard) =========

function pointInBbox(lon, lat, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
}

// ========= LOGIQUE DE FILTRAGE (pour l'instant, seulement log) =========

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

  // TODO plus tard :
  //  - filtrer allData
  //  - mettre à jour la source "notes" via ensureNotesSourceAndLayers()
  //  - éventuellement recentrer la carte
}

// ========= RÉINITIALISATION DES FILTRES =========

function resetFilters() {
  // Champ recherche
  const q = document.getElementById('filterQuery');
  if (q) q.value = '';

  // Tags
  document
    .querySelectorAll('input[name="tag"]:checked')
    .forEach(cb => { cb.checked = false; });

  // Pays
  const sel = document.getElementById('filterCountry');
  if (sel) {
    Array.from(sel.options).forEach(o => { o.selected = false; });
  }

  // Fermer le panneau de filtres
  const panel = document.getElementById('filtersPanel');
  if (panel) panel.style.display = 'none';

  // Recentrer sur l’Europe (constantes globales fournies par globe-setup.js)
  map.easeTo({
    center: EUROPE_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 600
  });
}

// ========= BOUTONS (appliquer / reset / select all / clear all) =========

function setupFilterButtons() {
  // Bouton "Appliquer"
  document.getElementById('applyFilters')?.addEventListener('click', () => {
    applyFilters();
    const panel = document.getElementById('filtersPanel');
    if (panel) panel.style.display = 'none';
  });

  // Bouton "Réinitialiser"
  document.getElementById('resetFilters')?.addEventListener('click', resetFilters);

  // Bouton "Tout sélectionner" (pays)
  document.getElementById('selectAllCountries')?.addEventListener('click', () => {
    const sel = document.getElementById('filterCountry');
    if (!sel) return;
    Array.from(sel.options).forEach(o => { o.selected = true; });
  });

  // Bouton "Tout désélectionner" (pays)
  document.getElementById('clearAllCountries')?.addEventListener('click', () => {
    const sel = document.getElementById('filterCountry');
    if (!sel) return;
    Array.from(sel.options).forEach(o => { o.selected = false; });
  });
}

// ========= POINT D’ENTRÉE DU MODULE =========

function initFilters() {
  loadCountries();
  setupCountryMultiSelect();
  setupFilterButtons();
}

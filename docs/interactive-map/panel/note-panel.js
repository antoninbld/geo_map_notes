// ======================================================
// NOTE PANEL (script global, robuste)
// Dépendances attendues :
// - window.map (MapLibre Map)  <-- exposée dans globe-setup.js : window.map = map
// - marked (CDN)
// - idToItem, allData (data-loading-and-index.js) : peut être sur window OU variables globales
// - UI_CONFIG (config-and-helpers.js)
// ======================================================

(() => {
  const NOTE_RAW_BASE = 'https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
  const EVENTS_BASE = NOTE_RAW_BASE;
  const ENTITIES_BASE = `${NOTE_RAW_BASE}/entities`;

  const NOTES_SOURCE_ID = 'notes';

  const DEFAULT_PANEL_WIDTH = 400;
  const DEFAULT_PANEL_MARGIN_RIGHT = 10;

  const NOTE_CACHE = new Map();  // noteId -> parsed
  const LINKS_CACHE = new Map(); // noteId -> [ids]

  // ---------- DOM ----------
  const $id = (id) => document.getElementById(id);

  // ---------- Globals access (IMPORTANT) ----------
  // idToItem/allData peuvent être des "globals lexicaux" (const/let) => pas sur window.*
  function getIndex() {
    if (typeof idToItem !== 'undefined') return idToItem;
    return window.idToItem;
  }

  function getAllData() {
    if (typeof allData !== 'undefined') return allData;
    return window.allData;
  }

  function getPanelDims() {
    const w = parseInt((window.UI_CONFIG?.panel?.width ?? DEFAULT_PANEL_WIDTH), 10);
    const m = parseInt((window.UI_CONFIG?.panel?.marginRight ?? DEFAULT_PANEL_MARGIN_RIGHT), 10);
    return { w, m };
  }

  // ---------- Data lookup (robuste Map / objet / array, clés string/number) ----------
  function getItemById(noteId) {
    const idx = getIndex();

    const raw = noteId;
    const str = String(noteId);
    const num = Number.isFinite(Number(noteId)) ? Number(noteId) : null;

    // Map
    if (idx && typeof idx.get === 'function') {
      let v = idx.get(raw);
      if (v) return v;

      v = idx.get(str);
      if (v) return v;

      if (num !== null) {
        v = idx.get(num);
        if (v) return v;
      }
    }

    // Objet { [id]: item }
    if (idx && typeof idx === 'object' && idx !== null) {
      if (Object.prototype.hasOwnProperty.call(idx, str)) return idx[str];
    }

    // Fallback allData array
    const arr = getAllData();
    if (Array.isArray(arr)) {
      return arr.find(x => String(x?.id) === str) || null;
    }

    return null;
  }

  function hasId(id) {
    return !!getItemById(id);
  }

  // ---------- Wiki links [[id]] / [[id|label]] ----------
  function transformWikiLinks(md) {
    if (!md) return '';
    return String(md).replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (_m, id, label) => {
      const safeId = encodeURIComponent(String(id).trim());
      const text = (label ? String(label) : String(id)).trim();
      return `[${text}](note.html?id=${safeId})`;
    });
  }

  function renderInline(text) {
    if (!text) return '';
    return window.marked ? window.marked.parseInline(transformWikiLinks(text)) : String(text);
  }

  // ---------- Front-matter YAML minimal ----------
  function parseAndStripFrontMatter(mdRaw) {
    const s = String(mdRaw ?? '');
    if (!s.startsWith('---')) return { meta: {}, body: s };

    const end = s.indexOf('\n---', 3);
    if (end === -1) return { meta: {}, body: s };

    const fmBlock = s.slice(3, end).trim();
    const body = s.slice(end + '\n---'.length).trim();

    const meta = {};
    fmBlock.split('\n').forEach(line => {
      const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2];

      if (/^\[.*\]$/.test(val)) {
        val = val.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
      }
      meta[key] = val;
    });

    return { meta, body };
  }

  // ---------- Section "## Résumé" ----------
  function splitSummarySection(mdText) {
    const text = String(mdText ?? '');
    const lines = text.split('\n');
    let start = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Résumé\b/i.test(lines[i].trim())) { start = i; break; }
    }
    if (start === -1) return { summaryMd: '', bodyMd: text };

    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (/^#{1,6}\s+/.test(lines[j].trim())) { end = j; break; }
    }

    const summaryMd = lines.slice(start + 1, end).join('\n').trim();
    const bodyMd = lines.slice(0, start).concat(lines.slice(end)).join('\n').trim();
    return { summaryMd, bodyMd };
  }

  // ---------- URL note ----------
  function resolveNoteURL(noteId) {
    const idStr = String(noteId);

    if (!idStr.startsWith('ent-')) {
      return `${EVENTS_BASE}/${encodeURIComponent(idStr)}.md`;
    }

    let sub = '';
    if (idStr.startsWith('ent-country-')) sub = 'countries';
    else if (idStr.startsWith('ent-org-')) sub = 'orgs';
    else if (idStr.startsWith('ent-person-')) sub = 'person';

    return `${ENTITIES_BASE}/${sub}/${encodeURIComponent(idStr)}.md`;
  }

  // ---------- Outgoing links ----------
  function extractWikiLinks(mdText) {
    const found = new Set();
    const re = /\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g;
    let m;
    while ((m = re.exec(mdText)) !== null) {
      const id = String(m[1]).trim();
      if (id) found.add(id);
    }
    return Array.from(found);
  }

  async function getOutgoingLinks(noteId, mdRawMaybe) {
    if (LINKS_CACHE.has(noteId)) return LINKS_CACHE.get(noteId);

    let mdRaw = mdRawMaybe;
    if (!mdRaw) {
      const url = resolveNoteURL(noteId);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { LINKS_CACHE.set(noteId, []); return []; }
      mdRaw = await res.text();
    }

    const ids = extractWikiLinks(mdRaw).filter(hasId);
    LINKS_CACHE.set(noteId, ids);
    return ids;
  }

  // ---------- Dates ----------
  function parseDateSmart(s) {
    if (!s) return null;
    const str = String(s).trim();
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }

  function formatDateByConfig(s) {
    const d = parseDateSmart(s);
    if (!d) return s || '';
    const opt = window.UI_CONFIG?.header?.dateFormat || {};
    return new Intl.DateTimeFormat('fr-FR', opt).format(d);
  }

  // ---------- Recap UI ----------
  function updateRecapToggleLabel(collapsed) {
    const t = $id('npRecapToggle');
    if (!t) return;
    const H = window.UI_CONFIG?.header || {};
    t.textContent = collapsed ? (H.recapMoreLabel || ' […]') : (H.recapLessLabel || ' ↥ réduire');
  }

  function setupRecapToggle() {
    const wrap = $id('npRecap');
    const t = $id('npRecapToggle');
    if (!wrap || !t) return;

    const has = !!wrap.textContent.trim();
    t.style.display = has ? 'inline-block' : 'none';
    if (!has) return;

    wrap.classList.add('clamped');
    updateRecapToggleLabel(true);

    t.onclick = (e) => {
      e.preventDefault();
      const collapsed = wrap.classList.toggle('clamped');
      updateRecapToggleLabel(collapsed);
    };
  }

  function setRecapText(text) {
    const wrap = $id('npRecap');
    if (!wrap) return;
    wrap.innerHTML = text ? renderInline(text) : '';
    setupRecapToggle();
  }

  // ---------- Entities chips ----------
  function renderEntityChips(list) {
    const box = $id('npEntities');
    if (!box) return;
    box.innerHTML = '';

    (list || []).forEach(id => {
      const a = document.createElement('a');
      a.href = '#';
      a.dataset.entityChip = id;
      a.textContent = String(id).replace(/^ent-(country|org|person)-/, '');
      a.style.cssText =
        'padding:2px 6px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';

      a.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.showEntityConstellation === 'function') {
          await window.showEntityConstellation(id);
        }
      });

      box.appendChild(a);
    });
  }

  // ---------- Note parsing ----------
  async function fetchAndParseNote(noteId) {
    const key = String(noteId);
    if (NOTE_CACHE.has(key)) return NOTE_CACHE.get(key);

    const url = resolveNoteURL(key);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { error: res.status };

    const mdRaw = await res.text();
    const { meta, body } = parseAndStripFrontMatter(mdRaw);
    const { summaryMd, bodyMd } = splitSummarySection(body);
    const links = await getOutgoingLinks(key, mdRaw);

    const parsed = { meta, body, summaryMd, bodyMd, links, mdRaw };
    NOTE_CACHE.set(key, parsed);
    return parsed;
  }

  // ---------- OPEN PANEL (PUBLIC) ----------
  async function openSummaryInPanel(noteId) {
    const map = window.map;
    if (!map) {
      console.error('window.map is missing. Add: window.map = map in globe-setup.js');
      return;
    }

    const id = String(noteId);
    const item = getItemById(id);

    const $panel = $id('notePanel');
    const $title = $id('npTitle');
    const $place = $id('npPlace');
    const $dateTxt = $id('npDateText');
    const $sum = $id('npSummary');
    const $md = $id('npMd');
    const $links = $id('npLinks');
    const $fit = $id('npFit');

    if (!$panel || !$title || !$place || !$sum || !$md || !$links) {
      console.error('Note panel elements missing in DOM');
      return;
    }

    // reset UI
    $sum.innerHTML = '';
    $md.innerHTML = '';
    $links.innerHTML = '';
    renderEntityChips([]);

    // header from data.json
    $title.textContent = item?.title || id;
    $place.textContent = item?.locationName || '';
    if ($dateTxt) $dateTxt.textContent = '';

    // ✅ Recap depuis data.json
    setRecapText(item?.recap || '');

    // fetch md
    let parsed;
    try {
      parsed = await fetchAndParseNote(id);
    } catch (e) {
      console.error('Error loading note', e);
      $md.innerHTML = `<em style="color:#888;">Note complète indisponible</em>`;
      $panel.style.display = 'block';
      return;
    }

    let outgoing = [];

    if (parsed?.error) {
      $md.innerHTML = `<em style="color:#888;">Note complète indisponible (HTTP ${parsed.error})</em>`;
    } else {
      const { meta, summaryMd, bodyMd, body, links } = parsed;
      outgoing = links || [];

      if (summaryMd) {
        $sum.innerHTML = window.marked
          ? window.marked.parse(transformWikiLinks(summaryMd))
          : transformWikiLinks(summaryMd);
      }

      if ($dateTxt && meta?.date) $dateTxt.textContent = formatDateByConfig(meta.date);

      // fallback recap (front-matter) si data.json vide
      const recapWrap = $id('npRecap');
      if ((!recapWrap?.textContent?.trim()) && meta?.recap) setRecapText(meta.recap);

      const entsRaw = Array.isArray(meta?.entities) ? meta.entities : [];
      const ents = entsRaw
        .map(e => (typeof window.normalizeEntityLabelToId === 'function' ? window.normalizeEntityLabelToId(e) : e))
        .filter(Boolean);
      renderEntityChips(ents);

      const finalBody = bodyMd || body || '';
      $md.innerHTML = window.marked
        ? window.marked.parse(transformWikiLinks(finalBody))
        : transformWikiLinks(finalBody);
    }

    // outgoing list
    if (!outgoing.length) {
      $links.innerHTML = '<div style="color:#888;">Aucun lien sortant</div>';
    } else {
      const html = outgoing.map(toId => {
        const it = getItemById(toId);
        const label = it?.title || toId;
        return `<li><a href="note.html?id=${encodeURIComponent(toId)}" class="internal-link">${label}</a></li>`;
      }).join('');
      $links.innerHTML = `<ul style="margin:0; padding-left:18px;">${html}</ul>`;
    }

    // show panel
    $panel.style.display = 'block';
    try {
      const { w } = getPanelDims();
      $panel.style.width = Math.round(w * 1.25) + 'px';
    } catch {}

    // highlight
    try {
      const prev = window.__selectedId;
      if (prev != null && prev !== id) {
        map.setFeatureState({ source: NOTES_SOURCE_ID, id: prev }, { selected: false });
      }
      map.setFeatureState({ source: NOTES_SOURCE_ID, id }, { selected: true });
      window.__selectedId = id;
    } catch {}

    // internal links click
    $panel.querySelectorAll('a[href^="note.html?id="]').forEach(a => {
      a.classList.add('internal-link');
      a.onclick = (e) => {
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        const nextId = decodeURIComponent((href.split('id=')[1] || '').trim());
        if (nextId) openSummaryInPanel(nextId);
      };
    });

    // fit bounds (note + outgoing)
    if ($fit) {
      $fit.onclick = () => {
        const bounds = new maplibregl.LngLatBounds();

        const from = getItemById(id);
        if (from) bounds.extend([from.lon, from.lat]);

        outgoing.forEach(lid => {
          const t = getItemById(lid);
          if (t) bounds.extend([t.lon, t.lat]);
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 80, duration: 650 });
        }
      };
    }
  }

  // ---------- CLOSE ----------
  function closePanel() {
    const panel = $id('notePanel');
    if (panel) {
      panel.style.display = 'none';
      try {
        const { w } = getPanelDims();
        panel.style.width = w + 'px';
      } catch {}
    }
  }

  function bindCloseHandlers() {
    $id('npClose')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  // ---------- EXPOSE ----------
  window.openSummaryInPanel = openSummaryInPanel;
  window.__closeNotePanel = closePanel;

  bindCloseHandlers();
})();

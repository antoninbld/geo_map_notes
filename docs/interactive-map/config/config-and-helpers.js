// ======================================================
// MODULE 1 — CONFIG GLOBALE & HELPERS GÉNÉRIQUES
// (futur fichier : interactive-map/config/config-and-helpers.js)
// Contient :
//   - MAPTILER_KEY, UI_CONFIG
//   - fonctions d’habillage UI : setUIStyle, applyUIConfig
//   - helpers génériques : renderWikiLinksInline, transformWikiLinks,
//     parseAndStripFrontMatter, parseDateSmart, formatDateByConfig, etc.
// ======================================================

// ========= CONFIG =========
  const MAPTILER_KEY = "MLrpRZ0Wo2Dsvsj13UYN";

  const UI_CONFIG = {
    panel:{ width:"400px", marginRight:"10px", marginTop:"10px", background:"#fff", shadow:"0 8px 24px rgba(0,0,0,.18)", borderRadius:"12px"},
    header:{ background:"#facc15", textColor:"#000", titleSize:"16px", locationIcon:"📍", dateIcon:"🕓", metaIndent:"0px", dateIndent:"0px",
      dateFormat:{ day:"numeric", month:"long", year:"numeric" },
      recapFontSize:"12px", recapStyle:"font-weight:600; font-style:italic;", recapMaxLines:2, recapMoreLabel:" […]", recapLessLabel:" ↥ réduire"
    },
    card:{ background:"#fef9c3", border:"1px solid #0f172a22", borderRadius:"10px", outerPadding:"8px 10px", innerPadding:"10px", fontSize:"14px", lineHeight:"1.55" },
    links:{ sectionTitle:"Liens sortants", internalLinkColor:"#1e90ff", internalLinkUnderline:"dashed",
      lineColor:"#9e0909", lineWidth:2.5, lineOpacity:0.95, lineDasharray:null, casingColor:"#470303", casingWidth:0,
      curveStyle:"bezier", curveStrength:0.3, curveSteps:96
    }
  };

  // pays actuellement mis en avant (pour le restaurer après style.load)
  let CURRENT_FOCUSED_COUNTRY = null;
  
  function bringCountryOverlayToFront(){
    try { if (map.getLayer('country-overlay-outline')) map.moveLayer('country-overlay-outline'); } catch {}
    try { if (map.getLayer('country-overlay-fill'))    map.moveLayer('country-overlay-fill');    } catch {}
  }

  function setUIStyle(css){
    let tag=document.getElementById('ui-overrides');
    if(!tag){tag=document.createElement('style');tag.id='ui-overrides';document.head.appendChild(tag);}
    tag.textContent=css;
  }
  function applyUIConfig(){
    const P=UI_CONFIG.panel,H=UI_CONFIG.header,C=UI_CONFIG.card,L=UI_CONFIG.links;
    setUIStyle(`#notePanel{width:${P.width};right:${P.marginRight};top:${P.marginTop};background:${P.background};box-shadow:${P.shadow};border-radius:${P.borderRadius}}
      #npHeader{background:${H.background};color:${H.textColor}} #npTitle{font-size:${H.titleSize}}
      #npMeta{margin-left:${H.metaIndent}} #npDate{margin-left:${H.metaIndent}}
      #npRecap{${H.recapStyle};font-size:${H.recapFontSize||"13px"};width:100%;text-align:justify}
      #npWrapper{padding:${C.outerPadding}} #npCard{background:${C.background};border:${C.border};border-radius:${C.borderRadius};padding:${C.innerPadding};font-size:${C.fontSize};line-height:${C.lineHeight}}
      .internal-link{border-bottom:1px ${L.internalLinkUnderline} ${L.internalLinkColor};color:inherit}`);
    const icon=document.getElementById('npIcon'); if(icon) icon.textContent=H.locationIcon;
    const dateIcon=document.getElementById('npDateIcon'); if(dateIcon) dateIcon.textContent=H.dateIcon||'🕓';
    document.documentElement.style.setProperty('--recap-lines', String((UI_CONFIG.header && UI_CONFIG.header.recapMaxLines) || 2));
  }

  // ========= LIBS UTIL =========
  function renderWikiLinksInline(text){
    if(!text) return '';
    return text.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g,(m,rawId,label)=>{
      const id=String(rawId).trim();
      const txt=(label||id).trim();
      return `<a href="note.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener" class="internal-link">${txt}</a>`;
    });
  }
  function transformWikiLinks(md){
    return md.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g,(m,rawId,label)=>{
      const id=String(rawId||'').trim(); if(!id) return m;
      const txt=String(label||id).trim();
      return `[${txt}](note.html?id=${encodeURIComponent(id)})`;
    });
  }
  function parseAndStripFrontMatter(text){
    let meta={};
    if(text.startsWith('---')){
      const end=text.indexOf('\n---',3);
      if(end!==-1){
        const fm=text.slice(3,end).trim();
        text=text.slice(end+4).trimStart();
        fm.split('\n').forEach(line=>{
          const idx=line.indexOf(':'); if(idx>-1){
            const key=line.slice(0,idx).trim();
            let raw=line.slice(idx+1).trim();
            const unq=v=>((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))?v.slice(1,-1):v;
            if(raw.startsWith('[')&&raw.endsWith(']')){
              const inside=raw.slice(1,-1).trim();
              meta[key]=inside?inside.split(',').map(s=>unq(s.trim())).filter(Boolean):[];
            } else {
              if(/^(true|false)$/i.test(raw)) meta[key]=/^true$/i.test(raw);
              else if(/^-?\d+(\.\d+)?$/.test(raw)) meta[key]=Number(raw);
              else meta[key]=unq(raw);
            }
          }
        });
      }
    }
    return {meta,body:text};
  }

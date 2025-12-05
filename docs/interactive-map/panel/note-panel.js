  // ======================================================
  // MODULE 5 — PANNEAU DE NOTE & RÉCAP
  // (futur fichier : interactive-map/panel/note-panel.js)
  // Contient :
  //   - Gestion du résumé (recap) : setRecapText(), toggle "voir plus"
  //   - Affichage du panneau de note : openSummaryInPanel()
  //   - Rendu Markdown, liens internes, chips d’entités
  //   - Fermeture du panneau, recentrage de la carte
  // ======================================================

  // ========= RÉCAP + NOTE PANEL =========
  function updateRecapToggleLabel(collapsed){
    const t=document.getElementById('npRecapToggle'); if(!t) return;
    const H=UI_CONFIG.header||{};
    t.textContent = collapsed ? (H.recapMoreLabel||' […]') : (H.recapLessLabel||' ↥ réduire');
  }
  function setupRecapToggle(){
    const wrap=document.getElementById('npRecap');
    const t=document.getElementById('npRecapToggle');
    if(!wrap||!t) return;
    const has=!!wrap.textContent.trim();
    t.style.display=has?'inline-block':'none';
    if(!has) return;
    wrap.classList.add('clamped');
    updateRecapToggleLabel(true);
    t.onclick=(e)=>{
      e.preventDefault();
      const collapsed=wrap.classList.toggle('clamped');
      updateRecapToggleLabel(collapsed);
    };
  }
  function setRecapText(text){
    const wrap=document.getElementById('npRecap'); if(!wrap) return;
    wrap.innerHTML=text?renderWikiLinksInline(text):'';
    setupRecapToggle();
  }

  function renderEntityChips(list){
    const box=document.getElementById('npEntities'); if(!box) return;
    box.innerHTML='';
    (list||[]).forEach(id=>{
      const a=document.createElement('a'); a.href='#'; a.dataset.entityChip=id;
      a.textContent=id.replace(/^ent-(country|org|person)-/,'');
      a.style.cssText='padding:2px 6px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';
      a.addEventListener('click',async(e)=>{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        await showEntityConstellation(id);
      });
      box.appendChild(a);
    });
  }

  function parseDateSmart(s){
    if(!s) return null;
    const str=String(s).trim();
    let m=str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return new Date(+m[1],+m[2]-1,+m[3]);
    m=str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m) return new Date(+m[3],+m[2]-1,+m[1]);
    m=str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if(m) return new Date(+m[3],+m[2]-1,+m[1]);
    return null;
  }
  function formatDateByConfig(s){
    const d=parseDateSmart(s); if(!d) return s||'';
    return new Intl.DateTimeFormat('fr-FR',UI_CONFIG.header.dateFormat).format(d);
  }

  function extractWikiLinks(mdText){
    const found=new Set();
    const re=/\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g;
    let m;
    while((m=re.exec(mdText))!==null){
      const id=m[1].trim();
      if(id) found.add(id);
    }
    return Array.from(found);
  }
  async function getOutgoingLinks(noteId){
    if(linksCache.has(noteId)) return linksCache.get(noteId);
    const url=`${NOTE_RAW_BASE}/${encodeURIComponent(noteId)}.md`;
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok){linksCache.set(noteId,[]); return [];}
    const md=await res.text();
    const ids=extractWikiLinks(md).filter(id=>idToItem.has(id));
    linksCache.set(noteId,ids);
    return ids;
  }

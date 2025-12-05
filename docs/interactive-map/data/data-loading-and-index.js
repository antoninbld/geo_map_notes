  // ======================================================
  // MODULE 2 — DONNÉES & INDEX DES NOTES
  // (futur fichier : interactive-map/data/data-loading-and-index.js)
  // Contient :
  //   - Structures : allData, allTags, idToItem, linksCache
  //   - Fonctions : loadDataFromJSON(), buildTagCheckboxes()
  //   - Récupération des données depuis data.json et remplissage des tags
  // ======================================================

  // ========= DONNÉES =========
  let allData=[];
  let allTags=new Set();
  const idToItem=new Map();
  const linksCache=new Map();
  window.__lastLinksState=null;

  async function loadDataFromJSON(){
    if(allData.length===0){
      try{
        const res=await fetch('data.json',{cache:'no-store'});
        allData=await res.json();
      }catch(e){
        console.error('Erreur chargement data.json',e); return;
      }
    }
    idToItem.clear();
    allData.forEach(it=>{ if(it&&it.id) idToItem.set(it.id,it); });
    allTags.clear();
    allData.forEach(item=>{
      if(Array.isArray(item.tags)){
        item.tags.forEach(t=>{
          if(t&&String(t).trim()) allTags.add(String(t).trim());
        });
      }
    });
    buildTagCheckboxes();
  }
  function buildTagCheckboxes(){
    const box=document.getElementById('tagsBox'); if(!box) return;
    box.innerHTML='';
    if(allTags.size===0){
      box.innerHTML='<div style="color:#777;font-size:13px;">Aucun tag détecté</div>';
      return;
    }
    Array.from(allTags).sort((a,b)=>a.localeCompare(b)).forEach(tag=>{
      const label=document.createElement('label'); label.className='tag';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.name='tag'; cb.value=tag;
      const txt=document.createElement('span'); txt.textContent=tag;
      label.appendChild(cb); label.appendChild(txt); box.appendChild(label);
    });
  }

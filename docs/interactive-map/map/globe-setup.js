// ======================================================
  // MODULE 3 — CARTE, STYLES & CLUSTERS
  // (futur fichier : interactive-map/map/markers-and-clusters.js)
  // Contient :
  //   - Création de la map MapLibre, styles MapTiler
  //   - Vue globe, fog, terrain
  //   - Rotation automatique du globe
  //   - Sources & couches : 'notes', clusters, points
  //   - Gestion des clics sur clusters/points, navigation de base
  // ======================================================

  // ========= STYLE & CARTE =========
  const STYLES={
    streets:`https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
    light:  `https://api.maptiler.com/maps/basic/style.json?key=${MAPTILER_KEY}`,
    dark:   `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
  };
  let CURRENT_BASEMAP='streets';
  function getStyleURL(b){ return STYLES[b]||STYLES.streets; }

  const DEFAULT_ZOOM=3.8, EUROPE_CENTER=[10,50], WORLD_CENTER=[0,20], WORLD_ZOOM=2.2;
  const ARRIVAL_ZOOM=WORLD_ZOOM+0.45;
  const BASE_PITCH = 25; // angle de vue

  const map=new maplibregl.Map({
    container:'map',
    style:getStyleURL(CURRENT_BASEMAP),
    center:WORLD_CENTER,
    zoom:WORLD_ZOOM,
    projection:'globe',
    renderWorldCopies:false
  });

  // ========= ROTATION GLOBE =========
  let __npRotateOn=false, __npRotateRAF=null, __npUserInteracting=false;
  const __npTEST_SPEED_DEG_PER_SEC=7;

  function getRotateBtn(){return document.getElementById('npRotateBtn');}
  function __npUpdateRotateBtn(){
    const b=getRotateBtn(); if(!b) return;
    if(__npRotateOn){
      b.classList.add('is-on');
      b.title='Arrêter la rotation';
      b.setAttribute('aria-label','Arrêter la rotation du globe');
    }else{
      b.classList.remove('is-on');
      b.title='Rotation automatique';
      b.setAttribute('aria-label','Activer la rotation du globe');
    }
  }
  function __npRotateStep(ts){
    if(!__npRotateOn){__npRotateRAF=null;return;}
    if(!__npUserInteracting){
      const now=ts||performance.now();
      const dt=(now-(__npRotateStep._lastTs||now));
      __npRotateStep._lastTs=now;
      const c=map.getCenter();
      let lon=c.lng;
      lon+=__npTEST_SPEED_DEG_PER_SEC*(dt/1000);
      if(lon>180) lon-=360;
      if(lon<-180) lon+=360;
      map.setCenter([lon,0]);
    }
    __npRotateRAF=requestAnimationFrame(__npRotateStep);
  }
  function npToggleRotation(){
    __npRotateOn=!__npRotateOn;
    if(__npRotateOn){
      __npRotateStep._lastTs=undefined;
      if(!__npRotateRAF) __npRotateRAF=requestAnimationFrame(__npRotateStep);
    } else {
      if(__npRotateRAF) cancelAnimationFrame(__npRotateRAF);
      __npRotateRAF=null;
    }
    __npUpdateRotateBtn();
  }
  ['dragstart','rotatestart','pitchstart','zoomstart'].forEach(ev=>map.on(ev,()=>{__npUserInteracting=true;}));
  ['dragend','rotateend','pitchend','zoomend'].forEach(ev=>map.on(ev,()=>{
    __npUserInteracting=false;
    if(__npRotateOn){
      const c=map.getCenter();
      map.easeTo({center:[c.lng,0],duration:300});
    }
  }));
  function updateRotateButtonVisibility(){
    const b=getRotateBtn(); if(!b) return;
    b.style.display='flex';
  }

  // Fog + projection globe (simple)
  function setupGlobe(){
    try { map.setProjection({ type:'globe' }); } catch(e){}
    if(typeof map.setFog === 'function'){
      try{
        map.setFog({
          range:[0.5,10],
          color:'rgba(160,190,220,0.9)',
          'horizon-blend':0.25
        });
      }catch(e){}
    }
  }

  // Terrain : on nettoie toujours (globe-only)
  function ensureTerrain(){
    try{map.setTerrain(null);}catch{}
    try{if(map.getLayer('terrain-hillshade')) map.removeLayer('terrain-hillshade');}catch{}
    try{if(map.getSource('terrain-dem-hs')) map.removeSource('terrain-dem-hs');}catch{}
    try{if(map.getSource('terrain-dem')) map.removeSource('terrain-dem');}catch{}
  }


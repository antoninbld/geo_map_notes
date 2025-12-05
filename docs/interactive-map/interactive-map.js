
    // ========= SOURCE + COUCHES DES NOTES (FACTO) =========
    async function ensureNotesSourceAndLayers() {
      // 1. on s’assure que les données sont chargées
      await loadDataFromJSON();
  
      const features = allData.map(item => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
        properties: { id: item.id, title: item.title }
      }));
  
      // 2. source "notes"
      if (!map.getSource('notes')) {
        map.addSource('notes', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features
          },
          promoteId: 'id',
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        });
      } else {
        map.getSource('notes').setData({
          type: 'FeatureCollection',
          features
        });
      }
  
      // 3. couche "clusters"
      if (!map.getLayer('clusters')) {
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'notes',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#ba274f',
            'circle-radius': 20
          }
        });
      }
  
      // 4. couche "cluster-count"
      if (!map.getLayer('cluster-count')) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'notes',
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
  
      // 5. couche "unclustered-point"
      if (!map.getLayer('unclustered-point')) {
        map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'notes',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#37cc12',
              '#ff2d2d'
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

  // ========= NOTES / RÉSEAU =========
  const NOTE_RAW_BASE='https://raw.githubusercontent.com/antoninbld/geo_map_notes/main/docs/notes';
  const EVENTS_BASE=NOTE_RAW_BASE;
  const ENTITIES_BASE=`${NOTE_RAW_BASE}/entities`;
  function resolveNoteURL(noteId){
    if(!String(noteId).startsWith('ent-')) return `${EVENTS_BASE}/${encodeURIComponent(noteId)}.md`;
    let sub='';
    if(noteId.startsWith('ent-country-')) sub='countries';
    else if(noteId.startsWith('ent-org-')) sub='orgs';
    else if(noteId.startsWith('ent-person-')) sub='person';
    return `${ENTITIES_BASE}/${sub}/${encodeURIComponent(noteId)}.md`;
  }

  /* ==== Custom layer Three.js : arcs 3D “missiles” ==== */
  const MissileArcsLayer = (function () {
    let camera, scene, renderer, mapRef;
    const group = new THREE.Group();
    group.renderOrder = 9999; // dessiner après le globe
  
    function toWorld(lng, lat, altitudeM = 0) {
      const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
      const meterToUnit =
        (typeof mc.meterInMercatorCoordinateUnits === 'function')
          ? mc.meterInMercatorCoordinateUnits()
          : (typeof mc.metersInMercatorCoordinateUnits === 'function')
              ? mc.metersInMercatorCoordinateUnits()
              : 1.0;
      const z = altitudeM * meterToUnit;
      return new THREE.Vector3(mc.x, mc.y, z);
    }
  
    function makeArc3D(
      aLngLat, bLngLat,
      { heightFactor = 0.45, lateralFactor = 0.28, segments = 160, radius = 3500, color = 0xdb6402 } = {}
    ){
      const a = { lng: aLngLat[0], lat: aLngLat[1] };
      const b = { lng: bLngLat[0], lat: bLngLat[1] };
    
      const distKm  = Math.max(0.01, turf.distance(a, b));
      const bearing = turf.bearing(a, b);
      const mid     = turf.midpoint(a, b);
    
      const perpBearing = bearing + 90;
      const lateralKm   = distKm * lateralFactor;
    
      const line = turf.lineString([[a.lng, a.lat], [b.lng, b.lat]]);
      const p1g  = turf.along(line,  distKm / 3,     { units: 'kilometers' });
      const p2g  = turf.along(line, (2*distKm) / 3,  { units: 'kilometers' });
    
      const p1ll   = turf.destination(p1g,  lateralKm * 0.6, perpBearing);
      const p2ll   = turf.destination(p2g,  lateralKm * 0.6, perpBearing);
      const apexLL = turf.destination(mid,  lateralKm,       perpBearing);
    
      const altApex = Math.max(800_000, distKm * 10_000 * heightFactor);
      const altBase = Math.max(150_000, altApex * 0.18);
      const altP    = Math.max(300_000, altApex * 0.50);
    
      const A    = toWorld(a.lng, a.lat, altBase);
      const B    = toWorld(b.lng, b.lat, altBase);
      const P1   = toWorld(p1ll.geometry.coordinates[0],  p1ll.geometry.coordinates[1],  altP);
      const APEX = toWorld(apexLL.geometry.coordinates[0], apexLL.geometry.coordinates[1], altApex);
      const P2   = toWorld(p2ll.geometry.coordinates[0],  p2ll.geometry.coordinates[1],  altP);
    
      const curve = new THREE.CatmullRomCurve3([A, P1, APEX, P2, B]);
      const geom  = new THREE.TubeGeometry(curve, segments, radius, 10, false);
      const mat   = new THREE.MeshBasicMaterial({
        color: (typeof color === 'string') ? new THREE.Color(color) : color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 9999;
      return mesh;
    }
  
    return {
      id: 'entity-focus-arcs-3d',
      type: 'custom',
      renderingMode: '3d',
  
      onAdd(map, gl) {
        mapRef = map;
        camera = new THREE.Camera();
        scene  = new THREE.Scene();
        scene.add(group);
  
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true
        });
        renderer.autoClear = false;
      },
  
      render(gl, matrix) {
        camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        renderer.state.reset();
        renderer.clearDepth();
        renderer.render(scene, camera);
        mapRef.triggerRepaint();
      },

      clear() {
        for (const m of group.children.slice()) {
          group.remove(m);
          m.geometry?.dispose?.();
          m.material?.dispose?.();
        }
      },
  
      setArcs(pairs) {
        this.clear();
        for (const p of pairs) {
          const mesh = makeArc3D(p.from, p.to, {
            heightFactor:  p.heightFactor  ?? 0.35,
            lateralFactor: p.lateralFactor ?? 0.25,
            segments: 160,
            radius:   2200,
            color:    p.color ?? 0xdb6402
          });
          group.add(mesh);
        }
      }
    };
  })();






  // ======================================================
  // MODULE 4 — ENTITÉS, CONSTELLATIONS & ARCS 3D
  // (futur fichier : interactive-map/entities/constellations-and-arcs.js)
  // Contient :
  //   - Mapping noms d’entités -> IDs (ENTITY_NAME_TO_ID)
  //   - Indexation des entités dans les notes : ensureEntityIndexFilled()
  //   - Focus entité : showEntityConstellation(), clearEntityFocus()
  //   - Layer custom Three.js : MissileArcsLayer (arcs 3D)
  // ======================================================

  // ========= ENTITÉS =========
  const EVENTS_BY_ENTITY=new Map();
  const __scannedEventsForEntities=new Set();
  const ENTITY_NAME_TO_ID=new Map([
    ['anouar al sadate','ent-person-anouar-al-sadate'],['sadate','ent-person-anouar-al-sadate'],
    ['egypte','ent-country-egypte'],['israël','ent-country-israel'],['israel','ent-country-israel'],['usa','ent-country-usa'],['urss','ent-country-urss'],
    ['cia','ent-org-cia'],['kgb','ent-org-kgb']
  ]);
  function normalizeEntityLabelToId(label){
    if(!label) return null;
    if(String(label).startsWith('ent-')) return label;
    const key=String(label).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
    return ENTITY_NAME_TO_ID.get(key)||null;
  }

  async function ensureEntityIndexFilled(entityId){
    for(const it of allData){
      if(__scannedEventsForEntities.has(it.id)) continue;
      try{
        const url=resolveNoteURL(it.id);
        const res=await fetch(url,{cache:'no-store'});
        if(res.ok){
          const md=await res.text();
          const {meta}=parseAndStripFrontMatter(md);
          let ents=Array.isArray(meta.entities)?meta.entities:[];
          ents=ents.map(e=>normalizeEntityLabelToId(e)).filter(Boolean);
          ents.forEach(entId=>{
            if(!EVENTS_BY_ENTITY.has(entId)) EVENTS_BY_ENTITY.set(entId,new Set());
            EVENTS_BY_ENTITY.get(entId).add(it.id);
          });
        }
      }catch{}
      __scannedEventsForEntities.add(it.id);
    }
    return new Set(EVENTS_BY_ENTITY.get(entityId)||[]);
  }

  function setEntityFocusVisibility(visible){
    const vis=visible?'visible':'none';
    try{map.setLayoutProperty('entity-focus-links','visibility',vis);}catch{}
    try{map.setLayoutProperty('entity-focus-point','visibility',vis);}catch{}
  }

  function undimAll(){
    try{
      allData.forEach(it=>{
        if(it&&it.id!=null) map.setFeatureState({source:'notes',id:it.id},{dim:false});
      });
    }catch{}
  }

  function clearEntityFocus(){
    setEntityFocusVisibility(false);
  
    try {
      map.getSource('entity-focus')?.setData({ type:'FeatureCollection', features: [] });
    } catch {}
  
    try {
      allData.forEach(it => {
        if (it && it.id != null)
          map.setFeatureState({ source:'notes', id: it.id }, { dim: false });
      });
    } catch {}
  
    try {
      map.getSource('entity-focus-links')?.setData({ type:'FeatureCollection', features: [] });
    } catch {}
  
    try { undimAll(); } catch {}
  
    try {
      if (map.getLayer('entity-focus-arcs-3d') && typeof MissileArcsLayer.clear === 'function') {
        MissileArcsLayer.clear();
      }
    } catch {}
  
    try { map.setLayoutProperty('entity-focus-links', 'visibility', 'visible'); } catch {}
    try { window.CountryOverlay?.hide(map); } catch {}
  
    CURRENT_FOCUSED_COUNTRY = null;
  }
  document.getElementById('btnClearEntityFocus')?.addEventListener('click', clearEntityFocus);

  async function showEntityConstellation(entId){
    function ensureMissilePitch(minPitch = BASE_PITCH) {
      if (map.getPitch() < minPitch) {
        map.easeTo({ pitch: minPitch, duration: 0 });
      }
    }
    const linked = await ensureEntityIndexFilled(entId);
    if(!linked || !linked.size){
      CURRENT_FOCUSED_COUNTRY = null;
      clearEntityFocus();
      return;
    }
  
    function computeRightPad(){
      const pw = parseInt((UI_CONFIG?.panel?.width ?? 400), 10);
      const pr = parseInt((UI_CONFIG?.panel?.marginRight ?? 10), 10);
      const w  = map.getContainer().clientWidth || 800;
      let rightPad = Math.round(pw * 1.25) + pr + 10;
      return Math.min(rightPad, Math.max(0, w - 120));
    }
  
    let origin = null;
    let overlayDidFrame = false;
  
    if (entId.startsWith('ent-country-') && window.CountryOverlay){
      CURRENT_FOCUSED_COUNTRY = entId;
      try{
        await CountryOverlay.focus(map, entId, {
          zoom: 3,
          duration: 200,
          rightPanelPx: parseInt((UI_CONFIG?.panel?.width ?? 400), 10),
          marginRight: parseInt((UI_CONFIG?.panel?.marginRight ?? 10), 10)
        });
        overlayDidFrame = true;
        ensureMissilePitch(55);
      }catch{}
      try { CountryOverlay.bringToFront(); } catch {}
      try{
        const originInfo = await CountryOverlay.getOriginForCountry(map, entId);
        if (originInfo?.origin) origin = originInfo.origin;
      }catch{}
    } else {
      CURRENT_FOCUSED_COUNTRY = null;
      try { if (window.CountryOverlay) CountryOverlay.hide(map); } catch {}
    }
  
    if(!origin){
      const pts = Array.from(linked).map(id=>idToItem.get(id)).filter(Boolean);
      if(pts.length){
        const sx = pts.reduce((a,p)=>a+p.lon,0), sy = pts.reduce((a,p)=>a+p.lat,0);
        origin = [sx/pts.length, sy/pts.length];
      } else {
        origin = map.getCenter().toArray();
      }
    }
  
    const features=[]; 
    const bounds=new maplibregl.LngLatBounds().extend(origin);
    for(const eid of linked){
      const it=idToItem.get(eid); if(!it) continue;
      features.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates:[origin,[it.lon,it.lat]]},
        properties:{kind:'edge',entityId:entId,to:eid}
      });
      bounds.extend([it.lon,it.lat]);
    }
  
    try{
      const src = map.getSource('entity-focus');
      if(src && src.setData) src.setData({ type:'FeatureCollection', features });
      setEntityFocusVisibility(true);
    }catch{}

    try {
      if (map.getLayer('entity-focus-arcs-3d') && typeof MissileArcsLayer.setArcs === 'function') {
        const pairs = [];
        for (const eid of linked) {
          const it = idToItem.get(eid); if(!it) continue;
          pairs.push({
            from: origin,
            to: [it.lon, it.lat],
            color: '#db6402',
            heightFactor: 0.18
          });
        }
        MissileArcsLayer.setArcs(pairs);
        try { map.setLayoutProperty('entity-focus-links', 'visibility', 'none'); } catch {}
      }
    } catch {}
  
    try{
      allData.forEach(it=>{ if(it && it.id!=null) map.setFeatureState({source:'notes',id:it.id},{dim:true}); });
      Array.from(linked).forEach(id=>{ map.setFeatureState({source:'notes',id},{dim:false}); });
    }catch{}
  
    if(!overlayDidFrame && !bounds.isEmpty()){
      try{
        map.fitBounds(bounds, { padding:{ top:40, left:40, bottom:40, right: computeRightPad() }, duration:650 });
        ensureMissilePitch(55);
      }catch{
        map.easeTo({ center: origin, zoom: Math.max(map.getZoom(), 4.2), duration: 600 });
        ensureMissilePitch(55);
      }
    }
  }



  // ========= INTERACTIONS =========
  let __selectedId=null;
  function onClickUnclustered(e){
    const f=e.features && e.features[0];
    if(!f||!f.properties||f.properties.id==null) return;
    const id=f.properties.id;
    const coords=f.geometry&&f.geometry.coordinates;
    if(__selectedId!=null){
      try{map.setFeatureState({source:'notes',id:__selectedId},{selected:false});}catch{}
    }
    try{map.setFeatureState({source:'notes',id},{selected:true});}catch{}
    __selectedId=id;
    openSummaryInPanel(id);
    try{
      const pw=parseInt((UI_CONFIG.panel&&UI_CONFIG.panel.width)||'400',10);
      const pr=parseInt((UI_CONFIG.panel&&UI_CONFIG.panel.marginRight)||'10',10);
      const rightPad=pw+pr+10;
      if(coords&&Array.isArray(coords)){
        map.easeTo({
          center:coords,
          zoom:ARRIVAL_ZOOM,
          padding:{top:20,left:20,bottom:20,right:rightPad},
          duration:600,
          pitch: Math.max(map.getPitch(), BASE_PITCH)
        });
      }
    }catch{}
  }
  function onClickAnyCluster(e){
    const f=e && e.features && e.features[0]; if(!f){return;}
    const props=f.properties||{};
    const rawId=(props.cluster_id ?? props.clusterId);
    const clusterId=typeof rawId==='string'?parseInt(rawId,10):rawId;
    const sourceId=(f.layer&&f.layer.source)?f.layer.source:'notes';
    const src=map.getSource(sourceId);
    const center=(f.geometry&&f.geometry.coordinates)||map.getCenter();
    const fallbackZoom=Math.min(map.getZoom()+3,18);
    if(!src||clusterId==null||!Array.isArray(center)){
      map.easeTo({center,zoom:fallbackZoom,duration:600});
      return;
    }
    let done=false;
    const finish=(a)=>{
      if(done) return;
      done=true;
      if(a==='fallback'){
        map.easeTo({center,zoom:fallbackZoom,duration:600});
      }
    };
    const tm=setTimeout(()=>finish('fallback'),200);
    try{
      if(typeof src.getClusterExpansionZoom==='function'){
        src.getClusterExpansionZoom(clusterId,(err,z)=>{
          if(done) return;
          clearTimeout(tm);
          if(err||typeof z!=='number') return finish('fallback');
          const target=Math.min(z+1,18);
          done=true;
          map.easeTo({center,zoom:target,duration:600});
        });
      }else{
        clearTimeout(tm);
        finish('fallback');
      }
    }catch(ex){
      clearTimeout(tm);
      finish('fallback');
    }
  }

  // ========= CHARGEMENT CARTE =========
  map.on('load', async ()=>{
    await CountryOverlay.init(map); 
    await ensureNotesSourceAndLayers();

    ensureLinksLayer();

    if(!map.getSource('entity-focus')){
      map.addSource('entity-focus',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    }
    if(!map.getLayer('entity-focus-links')){
      map.addLayer({
        id:'entity-focus-links',
        type:'line',
        source:'entity-focus',
        filter:['==',['get','kind'],'edge'],
        layout:{ visibility:'none' },
        paint:{ 'line-width':2,'line-color':'#db6402','line-opacity':0.8,'line-dasharray':[1.5,1.5] }
      }, 'clusters');
    }
    if(!map.getLayer('entity-focus-point')){
      map.addLayer({
        id:'entity-focus-point',
        type:'circle',
        source:'entity-focus',
        layout:{ visibility:'none' },
        paint:{ 'circle-radius':6, 'circle-color':'#db6402', 'circle-stroke-width':2, 'circle-stroke-color':'#ffffff' }
      }, 'clusters');
    }

    if (!map.getLayer('entity-focus-arcs-3d')) {
      map.addLayer(MissileArcsLayer);
    }
    
    setupGlobe();
    ensureTerrain();

    map.jumpTo({ center: WORLD_CENTER, zoom: ARRIVAL_ZOOM, pitch: BASE_PITCH, bearing: 0 });

    updateRotateButtonVisibility();
  });

  map.on('style.load', async ()=>{
    await CountryOverlay.init(map);
    setupGlobe();
    ensureTerrain();
    
    await ensureNotesSourceAndLayers();
    ensureLinksLayer();

    if(!map.getSource('entity-focus')){
      map.addSource('entity-focus',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    }
    if(!map.getLayer('entity-focus-links')){
      map.addLayer({
        id:'entity-focus-links',
        type:'line',
        source:'entity-focus',
        filter:['==',['get','kind'],'edge'],
        layout:{ visibility:'none' },
        paint:{ 'line-width':2,'line-color':'#db6402','line-opacity':0.8,'line-dasharray':[1.5,1.5] }
      }, 'clusters');
    }
    if(!map.getLayer('entity-focus-point')){
      map.addLayer({
        id:'entity-focus-point',
        type:'circle',
        source:'entity-focus',
        layout:{ visibility:'none' },
        paint:{
          'circle-radius':6,
          'circle-color':'#db6402',
          'circle-stroke-width':2,
          'circle-stroke-color':'#ffffff'
        }
      }, 'clusters');
    }

    if (!map.getLayer('entity-focus-arcs-3d')) {
      map.addLayer(MissileArcsLayer);
    }
    
    if (CURRENT_FOCUSED_COUNTRY && window.CountryOverlay){
      await CountryOverlay.show(map, CURRENT_FOCUSED_COUNTRY);
      bringCountryOverlayToFront();
    }
  
    if(window.__lastLinksState){
      drawLinksFrom(window.__lastLinksState.id, window.__lastLinksState.links);
    }
    updateRotateButtonVisibility();
  });

  map.on('error', e=>console.error('Map error:', e && (e.error||e)));
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');

  // ========= CONTRÔLES =========
  class FilterControl{
    onAdd(map){
      this._map=map;
      const g=document.createElement('div');
      g.className='maplibregl-ctrl maplibregl-ctrl-group filters-ctrl';
      const btn=document.createElement('button');
      btn.className='filters-btn'; btn.type='button'; btn.title='Filtres'; btn.textContent='Filtres';
      btn.addEventListener('click',()=>{
        const p=document.getElementById('filtersPanel');
        p.style.display=(p.style.display==='none'||!p.style.display)?'block':'none';
      });
      document.addEventListener('click',(e)=>{
        const p=document.getElementById('filtersPanel');
        const b=document.querySelector('.filters-btn');
        if(!p||!b) return;
        if(p.style.display==='block' && !p.contains(e.target) && !b.contains(e.target)) p.style.display='none';
      });
      g.appendChild(btn);
      this._container=g;
      return g;
    }
    onRemove(){
      this._container.remove();
      this._map=undefined;
    }
  }
  map.addControl(new FilterControl(),'top-right');

  class RotateControl{
    onAdd(map){
      this._map=map;
      const g=document.createElement('div');
      g.className='maplibregl-ctrl maplibregl-ctrl-group';
      const btn=document.createElement('button');
      btn.id='npRotateBtn'; btn.type='button';
      btn.title='Rotation automatique'; btn.textContent='🔄';
      btn.addEventListener('click',npToggleRotation);
      g.appendChild(btn);
      this._container=g;
      setTimeout(()=>{
        __npUpdateRotateBtn();
        updateRotateButtonVisibility();
      },0);
      return g;
    }
    onRemove(){
      this._container?.remove();
      this._map=undefined;
    }
  }
  map.addControl(new RotateControl(),'top-right');

  function updateMapBackgroundClass(){
    const mapDiv=document.getElementById('map'); if(!mapDiv) return;
    if(CURRENT_BASEMAP==='dark') mapDiv.classList.add('dark');
    else mapDiv.classList.remove('dark');
  }
  window.addEventListener('load',updateMapBackgroundClass);

  document.querySelectorAll('input[name="basemap"]').forEach(r=>{
    r.addEventListener('change', (e)=>{
      CURRENT_BASEMAP=e.target.value;
      updateMapBackgroundClass();
      map.setStyle(getStyleURL(CURRENT_BASEMAP));
    });
  });

  // ========= FILTRES (pays bbox) =========
  let countriesBbox={};
  async function loadCountries(){
    try{
      const res=await fetch('countries-bbox.json',{cache:'no-store'});
      countriesBbox=await res.json();
      buildCountrySelect();
    }catch(e){console.error('countries-bbox',e);}
  }
  function buildCountrySelect(){
    const sel=document.getElementById('filterCountry'); if(!sel) return;
    sel.innerHTML='';
    Object.keys(countriesBbox).sort((a,b)=>a.localeCompare(b)).forEach(name=>{
      const opt=document.createElement('option');
      opt.value=name; opt.textContent=name;
      sel.appendChild(opt);
    });
  }
  const countrySel=document.getElementById('filterCountry');
  if(countrySel){
    countrySel.addEventListener('mousedown',(e)=>{
      const opt=e.target;
      if(opt.tagName==='OPTION'){
        e.preventDefault();
        opt.selected=!opt.selected;
        countrySel.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
  }
  function pointInBbox(lon,lat,b){
    const [minX,minY,maxX,maxY]=b;
    return lon>=minX && lon<=maxX && lat>=minY && lat<=maxY;
  }

  function applyFilters(){
    const q=(document.getElementById('filterQuery')?.value||'').toLowerCase().trim();
    const selected=Array.from(document.querySelectorAll('input[name="tag"]:checked')).map(i=>i.value);
    const sel=document.getElementById('filterCountry');
    const selectedCountries=sel?Array.from(sel.selectedOptions).map(o=>o.value):[];
    console.log('TODO filters:', {q, selected, selectedCountries});
  }
  function resetFilters(){
    const q=document.getElementById('filterQuery'); if(q) q.value='';
    document.querySelectorAll('input[name="tag"]:checked').forEach(cb=>cb.checked=false);
    const sel=document.getElementById('filterCountry');
    if(sel) Array.from(sel.options).forEach(o=>o.selected=false);
    const panel=document.getElementById('filtersPanel');
    if(panel) panel.style.display='none';
    map.easeTo({center:EUROPE_CENTER,zoom:DEFAULT_ZOOM,duration:600});
  }
  document.getElementById('applyFilters')?.addEventListener('click',()=>{
    applyFilters();
    document.getElementById('filtersPanel').style.display='none';
  });
  document.getElementById('resetFilters')?.addEventListener('click',resetFilters);
  document.getElementById('selectAllCountries')?.addEventListener('click',()=>{
    const sel=document.getElementById('filterCountry'); if(!sel) return;
    Array.from(sel.options).forEach(o=>o.selected=true);
  });
  document.getElementById('clearAllCountries')?.addEventListener('click',()=>{
    const sel=document.getElementById('filterCountry'); if(!sel) return;
    Array.from(sel.options).forEach(o=>o.selected=false);
  });

  // ========= NAVIG / PANEL =========
  function recenterEurope(){
    map.easeTo({center:EUROPE_CENTER, zoom:DEFAULT_ZOOM, duration:600});
  }
  function recenterWorld(opts={animate:true}){
    const target={center:WORLD_CENTER, zoom:ARRIVAL_ZOOM, bearing:0, pitch:0};
    if(opts&&opts.animate===false) map.jumpTo(target);
    else map.easeTo({...target, duration:800});
  }
  document.getElementById('recenterEurope').addEventListener('click',recenterEurope);
  document.getElementById('recenterWorld').addEventListener('click',recenterWorld);

  async function openSummaryInPanel(noteId){
    const item=idToItem.get(noteId);
    const $panel=document.getElementById('notePanel');
    const $title=document.getElementById('npTitle');
    const $place=document.getElementById('npPlace');
    const $dateText=document.getElementById('npDateText');
    const $sum=document.getElementById('npSummary');
    const $md=document.getElementById('npMd');
    const $links=document.getElementById('npLinks');
    const $fit=document.getElementById('npFit');

    if(!item){
      $title.textContent=noteId;
      $place.textContent='';
      if($dateText) $dateText.textContent='';
      document.getElementById('npRecap').innerHTML='';
      $sum.innerHTML=''; $md.innerHTML=''; $links.innerHTML='';
      $panel.style.display='block';
      return;
    }

    $title.textContent=item.title||noteId;
    $place.textContent=item.locationName||'';
    if($dateText) $dateText.textContent='';
    setRecapText(item.recap||'');
    $sum.innerHTML=item.summary ? renderWikiLinksInline(item.summary) : '';

    let links=[];
    try{
      const url=resolveNoteURL(noteId);
      const res=await fetch(url,{cache:'no-store'});
      if(res.ok){
        const mdRaw=await res.text();
        const {meta, body}=parseAndStripFrontMatter(mdRaw);
        let ents=Array.isArray(meta.entities)?meta.entities:[];
        ents=ents.map(e=>normalizeEntityLabelToId(e)).filter(Boolean);
        if(ents.length){
          renderEntityChips(ents);
        } else {
          const box=document.getElementById('npEntities');
          if(box) box.innerHTML='';
        }
        if($dateText && !$dateText.textContent && meta.date) $dateText.textContent=formatDateByConfig(meta.date);
        if(!document.getElementById('npRecap').innerHTML && meta.recap) setRecapText(meta.recap);
        links=extractWikiLinks(mdRaw).filter(id=>idToItem.has(id));
        $md.innerHTML=marked.parse(transformWikiLinks(body));
      }else{
        $md.innerHTML=`<em style="color:#888;">Note complète indisponible (HTTP ${res.status})</em>`;
      }
    }catch{
      $md.innerHTML=`<em style="color:#888;">Note complète indisponible</em>`;
    }

    if(!links.length){
      $links.innerHTML='<div style="color:#888;">Aucun lien sortant</div>';
    } else {
      $links.innerHTML=`<ul style="margin:0; padding-left:18px;">${
        links.map(lid=>{
          const it=idToItem.get(lid);
          const lbl=it?.title||lid;
          return `<li><a href="note.html?id=${encodeURIComponent(lid)}" class="internal-link">${lbl}</a></li>`;
        }).join('')
      }</ul>`;
    }

    $panel.style.display='block';
    try{
      const baseW=parseInt((UI_CONFIG?.panel?.width??400),10);
      $panel.style.width=Math.round(baseW*1.25)+'px';
    }catch{}
    try{
      if(__selectedId!=null && __selectedId!==noteId){
        map.setFeatureState({source:'notes',id:__selectedId},{selected:false});
      }
      map.setFeatureState({source:'notes',id:noteId},{selected:true});
      __selectedId=noteId;
    }catch{}

    $panel.querySelectorAll('a[href^="note.html?id="]').forEach(a=>{
      a.classList.add('internal-link');
      a.addEventListener('click',(e)=>{
        e.preventDefault();
        const href=a.getAttribute('href');
        const id=decodeURIComponent(href.split('id=')[1]||'');
        if(!id) return;
    
        openSummaryInPanel(id);
    
        try{
          if(__selectedId!=null && __selectedId!==id){
            map.setFeatureState({source:'notes',id:__selectedId},{selected:false});
          }
          map.setFeatureState({source:'notes',id},{selected:true});
          __selectedId=id;
        }catch{}
    
        getOutgoingLinks(id).then(lnk=>{
          drawLinksFrom(id,lnk);
          window.__lastLinksState={id,links:lnk};
    
          const from=idToItem.get(id);
          if(from){
            const pw=parseInt((UI_CONFIG?.panel?.width??400),10),
                  pr=parseInt((UI_CONFIG?.panel?.marginRight??10),10);
            const rightPad=Math.round(pw*1.25)+pr+10;
    
            map.easeTo({
              center:[from.lon,from.lat],
              zoom:ARRIVAL_ZOOM,
              padding:{top:20,left:20,bottom:20,right:rightPad},
              duration:600,
              pitch: Math.max(map.getPitch(), BASE_PITCH)
            });
          }
        });
      });
    });

    if($fit){
      $fit.onclick=()=>{
        const b=new maplibregl.LngLatBounds();
        const from=idToItem.get(noteId);
        if(from) b.extend([from.lon,from.lat]);
        links.forEach(lid=>{
          const t=idToItem.get(lid);
          if(t) b.extend([t.lon,t.lat]);
        });
        if(!b.isEmpty()) map.fitBounds(b,{padding:80,duration:650});
      };
    }
    drawLinksFrom(noteId, links);
    window.__lastLinksState={id:noteId,links};
  }

  // ========= GESTES GLOBAUX =========
  map.on('click',(e)=>{
    const hits=map.queryRenderedFeatures(e.point);
    if(!hits.length){ clearLinks?.(); return; }
    const cl=hits.find(ft=>{
      const p=ft&&ft.properties;
      return p && (p.cluster===true || p.cluster_id!=null || p.point_count!=null);
    });
    if(cl){
      onClickAnyCluster({features:[cl]});
      return;
    }
    const pt=hits.find(ft=>ft.layer && ft.layer.id==='unclustered-point');
    if(pt){
      onClickUnclustered({features:[pt]});
      return;
    }
    clearLinks?.();
  });

  map.on('mousemove',(e)=>{
    const layerIds=['clusters','cluster-count','unclustered-point'].filter(id=>map.getLayer(id));
    let hits=[];
    if(layerIds.length){
      try{hits=map.queryRenderedFeatures(e.point,{layers:layerIds});}catch{}
    }
    map.getCanvas().style.cursor=hits.length?'pointer':'';
  });

  (function setupNotePanelClose(){
    const btn=document.getElementById('npClose'); if(!btn) return;
    const closePanel=()=>{
      const panel=document.getElementById('notePanel');
      if(panel) panel.style.display='none';
      try{
        const baseW=parseInt((UI_CONFIG?.panel?.width??400),10);
        panel.style.width=baseW+'px';
      }catch{}
      if(typeof clearLinks==='function') clearLinks();
      try{
        map.easeTo({
          center:WORLD_CENTER,
          zoom:ARRIVAL_ZOOM,
          padding:{top:0,left:0,bottom:0,right:0},
          duration:500
        });
      }catch{}
    };
    btn.addEventListener('click',closePanel);
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closePanel(); });
  })();

  (function setupMapPanelToggle(){
    const panel=document.getElementById('mapPanel'),
          toggle=document.getElementById('mapPanelToggle'),
          close=document.getElementById('mapPanelClose');
    if(!panel||!toggle||!close) return;
    const show=()=>{
      panel.classList.remove('panel-hidden');
      toggle.setAttribute('aria-expanded','true');
    };
    const hide=()=>{
      panel.classList.add('panel-hidden');
      toggle.setAttribute('aria-expanded','false');
    };
    toggle.addEventListener('click',()=>{
      const opened=toggle.getAttribute('aria-expanded')==='true';
      opened?hide():show();
    });
    close.addEventListener('click',hide);
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hide(); });
    hide();
  })();

  // ========= INIT =========
  loadCountries();
  applyUIConfig();

  map.on('load',()=>console.log('[OK] map load'));
  map.on('style.load',()=>console.log('[OK] style load'));
  setTimeout(()=>console.log('[CHK] source notes =', !!map.getSource('notes')),1500);

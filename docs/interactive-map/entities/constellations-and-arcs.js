  // ======================================================
  // MODULE 4 — ENTITÉS, CONSTELLATIONS & ARCS 3D
  // (futur fichier : interactive-map/entities/constellations-and-arcs.js)
  // Contient :
  //   - Mapping noms d’entités -> IDs (ENTITY_NAME_TO_ID)
  //   - Indexation des entités dans les notes : ensureEntityIndexFilled()
  //   - Focus entité : showEntityConstellation(), clearEntityFocus()
  //   - Layer custom Three.js : MissileArcsLayer (arcs 3D)
  // ======================================================


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


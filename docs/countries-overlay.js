// countries-overlay.js — robuste, avec alias URSS→RUS, compat multi-propriétés, bbox via Turf si dispo.
(function(){
  let mapRef=null, ready=false;

  const SRC_ID="country-overlay-src";
  const FILL_ID="country-overlay-fill";
  const OUTLINE_ID="country-overlay-outline";
  const DATA_URL="data/countries.geojson"; // <-- adapte si nécessaire

  // Index mémoire
  let _features=[];
  const iso2ToIso3=new Map();
  const nameToIso3=new Map();

  const slug=(s)=>String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

  function log(){ try{ console.debug.apply(console, ["[CountryOverlay]"].concat([].slice.call(arguments))); }catch{} }

  async function buildIndex(json){
    _features=json?.features||[];
    for(const f of _features){
      const p=f.properties||{};
      const iso3=(p.ADM0_A3||p.ISO_A3||p.SOV_A3||p.GU_A3||p.ISO3||p.ISO_3||p.ISO3_CODE||"").toUpperCase();
      const iso2=(p.ISO_A2||p.ISO2||p.ISO_2||"").toUpperCase();
      if(iso3){
        if(iso2) iso2ToIso3.set(iso2, iso3);
        const names=[p.NAME_FR,p.NAME_EN,p.NAME_LONG,p.NAME,p.ADMIN,p.BRK_NAME,p.SOVEREIGNT,p.FORMAL_EN,p.FORMAL_FR].filter(Boolean);
        for(const n of names){ nameToIso3.set(slug(n), iso3); }
        nameToIso3.set(slug(iso3), iso3);
      }
    }
    // Alias utiles
    nameToIso3.set("etats-unis","USA");
    nameToIso3.set("russie","RUS");
    // — URSS -> Russie (toutes variantes usuelles)
    ["urss","u-r-s-s","u.r.s.s.","union-sovietique","union-soviétique",
     "union-des-republiques-socialistes-sovietiques","union-des-republiques-socialistes-soviets",
     "soviet-union","union-of-soviet-socialist-republics","ussr"]
     .forEach(k=>nameToIso3.set(slug(k),"RUS"));
  }

  async function ensureLoaded(map){
    if(ready && mapRef===map) return true;
    mapRef=map;

    if(!map.getSource(SRC_ID)){
      map.addSource(SRC_ID,{type:"geojson", data: DATA_URL});
    }

    if(_features.length===0){
      try{
        const res=await fetch(DATA_URL, {cache:"no-store"});
        const json=await res.json();
        await buildIndex(json);
        log("Index ready. features=", _features.length);
      }catch(e){
        console.warn("[CountryOverlay] fetch index failed:", e);
      }
    }

    if(!map.getLayer(FILL_ID)){
      map.addLayer({
        id:FILL_ID, type:"fill", source:SRC_ID,
        filter:["==", ["coalesce",
            ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]
          ], "__NONE__"],
        layout:{visibility:"none"},
        paint:{"fill-color":"#60a5fa","fill-opacity":0.25}
      });
    }
    if(!map.getLayer(OUTLINE_ID)){
      map.addLayer({
        id:OUTLINE_ID, type:"line", source:SRC_ID,
        filter:["==", ["coalesce",
            ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]
          ], "__NONE__"],
        layout:{visibility:"none"},
        paint:{"line-color":"#3b82f6","line-width":1.5}
      });
    }
    try{ map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); }catch(_){}
    ready=true;
    return true;
  }

  function resolveIso3(anyId){
    if(!anyId) return null;
    let tok=String(anyId).trim();
    if(/^ent-country-/i.test(tok)) tok=tok.slice("ent-country-".length);
    // cas explicite URSS
    if(/urss|ussr|soviet/i.test(tok)) return "RUS";
    const up=tok.toUpperCase();
    if(/^[A-Z]{3}$/.test(up)) return up;
    if(/^[A-Z]{2}$/.test(up)) return iso2ToIso3.get(up)||null;
    const key=slug(tok);
    return nameToIso3.get(key)||null;
  }

  function computeBboxAndCenter(feat){
    if(!feat||!feat.geometry) return null;
    // Si Turf est dispo (tu l’as dans ton HTML), utilise bbox/centroid pour gérer l’antiméridien (Russie, etc.)
    try{
      if(typeof turf!=="undefined" && turf){
        const bb = turf.bbox(feat);
        const c  = turf.center(feat);
        return { bounds:[[bb[0],bb[1]],[bb[2],bb[3]]], center:c?.geometry?.coordinates||null };
      }
    }catch(_){}
    // Fallback maison
    const g=feat.geometry;
    const flat = g.type==="MultiPolygon" ? g.coordinates.flat(2)
               : g.type==="Polygon" ? g.coordinates.flat()
               : null;
    if(!flat||!flat.length) return null;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for(const [x,y] of flat){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
    return { center:[(minX+maxX)/2,(minY+maxY)/2], bounds:[[minX,minY],[maxX,maxY]] };
  }

  function getFeatureByIso3(iso3){
    return _features.find(f=>{
      const p=f.properties||{};
      const code=(p.ADM0_A3||p.ISO_A3||p.SOV_A3||p.GU_A3||p.ISO3||p.ISO_3||p.ISO3_CODE||"").toUpperCase();
      return code===iso3;
    })||null;
  }

  async function show(map, entLike){
    await ensureLoaded(map);
    const iso3=resolveIso3(entLike);
    if(!iso3){ log("resolve failed for", entLike); return null; }

    try{
      const prop = ["coalesce",
        ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]];
      map.setFilter(FILL_ID, ["==", prop, iso3]);
      map.setFilter(OUTLINE_ID, ["==", prop, iso3]);
      map.setLayoutProperty(FILL_ID, "visibility", "visible");
      map.setLayoutProperty(OUTLINE_ID, "visibility", "visible");
      try{ map.moveLayer(FILL_ID); map.moveLayer(OUTLINE_ID); }catch(_){}
    }catch(e){
      console.warn("[CountryOverlay] setFilter/visibility failed:", e);
    }

    const feat=getFeatureByIso3(iso3);
    const info=computeBboxAndCenter(feat);
    if(!info) log("bbox/center not computed for", iso3);
    return info||{center:null,bounds:null};
  }

  function hide(map){
    try{
      map.setLayoutProperty(FILL_ID,"visibility","none");
      map.setLayoutProperty(OUTLINE_ID,"visibility","none");
      const prop = ["coalesce",
        ["get","ADM0_A3"],["get","ISO_A3"],["get","SOV_A3"],["get","GU_A3"],["get","ISO3"],["get","ISO_3"],["get","ISO3_CODE"]];
      map.setFilter(FILL_ID, ["==", prop, "__NONE__"]);
      map.setFilter(OUTLINE_ID, ["==", prop, "__NONE__"]);
    }catch(_){}
  }

  function bringToFront(){ try{ mapRef?.moveLayer(FILL_ID); mapRef?.moveLayer(OUTLINE_ID); }catch(_){} }

  window.CountryOverlay={
    init: async (map)=>{ await ensureLoaded(map); },
    show: async (map, entLike)=>show(map, entLike),
    hide: (map)=>hide(map),
    bringToFront
  };
})();

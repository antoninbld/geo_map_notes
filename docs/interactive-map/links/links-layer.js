  // ========= COUCHE LIENS =========
  function ensureLinksLayer(){
    if(!map.isStyleLoaded?.() && !map.loaded?.()){
      map.once('load',ensureLinksLayer);
      map.once('style.load',ensureLinksLayer);
      return;
    }
    if(!map.getSource('note-links')){
      map.addSource('note-links',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    }

    const L=UI_CONFIG.links||{};
    if(!map.getLayer('note-links-line')){
      map.addLayer({
        id:'note-links-line',
        type:'line',
        source:'note-links',
        layout:{'line-cap':'round','line-join':'round'},
        paint:{
          'line-color':L.lineColor||'#ff0088',
          'line-width':L.lineWidth||3.5,
          'line-opacity':L.lineOpacity??0.95,
          ...(L.lineDasharray?{'line-dasharray':L.lineDasharray}:{})
        }
      });
    }else{
      map.setPaintProperty('note-links-line','line-color',L.lineColor||'#ff0088');
      map.setPaintProperty('note-links-line','line-width',L.lineWidth||3.5);
      map.setPaintProperty('note-links-line','line-opacity',L.lineOpacity??0.95);
      if(L.lineDasharray){
        map.setPaintProperty('note-links-line','line-dasharray',L.lineDasharray);
      } else {
        try{map.setPaintProperty('note-links-line','line-dasharray',null);}catch{}
      }
    }
    try{ map.moveLayer('note-links-line'); }catch{}
  }
  function bezierCurveCoords(from,to,strength=0.25,steps=64){
    const p0=[from.lon,from.lat], p2=[to.lon,to.lat];
    const mx=(p0[0]+p2[0])/2, my=(p0[1]+p2[1])/2;
    const vx=p2[0]-p0[0], vy=p2[1]-p0[1];
    const nx=-vy, ny=vx;
    const len=Math.sqrt(nx*nx+ny*ny)||1;
    const ux=nx/len, uy=ny/len;
    const amp=strength*Math.hypot(vx,vy);
    const cx=mx+ux*amp, cy=my+uy*amp;
    const coords=[];
    for(let i=0;i<=steps;i++){
      const t=i/steps, it=1-t;
      const x=it*it*p0[0]+2*it*t*cx+t*t*p2[0];
      const y=it*it*p0[1]+2*it*t*cy+t*t*p2[1];
      coords.push([x,y]);
    }
    return coords;
  }
  function geodesicCoords(from,to,steps=64){
    if(!(window.turf&&turf.greatCircle)) return [[from.lon,from.lat],[to.lon,to.lat]];
    const fc=turf.greatCircle([from.lon,from.lat],[to.lon,to.lat],{npoints:Math.max(2,steps),properties:{}});
    return fc.geometry.coordinates;
  }
  function curveBetween(from,to){
    const L=UI_CONFIG.links||{};
    const style=L.curveStyle||'bezier', steps=L.curveSteps||64;
    if(style==='geodesic') return geodesicCoords(from,to,steps);
    const s=L.curveStrength??0.25;
    return bezierCurveCoords(from,to,s,steps);
  }
  function drawLinksFrom(noteId,linkedIds){
    ensureLinksLayer();
    const src=map.getSource('note-links'); if(!src) return;
    const from=idToItem.get(noteId);
    if(!from){
      src.setData({type:'FeatureCollection',features:[]});
      return;
    }
    const features=(linkedIds||[]).map(id=>{
      const to=idToItem.get(id); if(!to) return null;
      return {
        type:'Feature',
        geometry:{type:'LineString',coordinates:curveBetween(from,to)},
        properties:{from:noteId,to:id}
      };
    }).filter(Boolean);
    src.setData({type:'FeatureCollection',features});
    try{ if(map.getLayer('note-links-line')) map.moveLayer('note-links-line'); }catch{}
  }
  function clearLinks(){
    const src=map.getSource('note-links');
    if(src) src.setData({type:'FeatureCollection',features:[]});
  }

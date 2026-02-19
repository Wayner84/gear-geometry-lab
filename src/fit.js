export function bboxFromPolylines(polylines){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for(const poly of (polylines || [])){
    for(const p of (poly || [])){
      if(!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      count++;
    }
  }
  if(count === 0) return null;
  return { minX, minY, maxX, maxY, w: maxX-minX, h: maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
}

export function fitScaleToViewBox(bbox, viewBox, margin=90){
  if(!bbox) return 1;
  const vw = viewBox.w - margin*2;
  const vh = viewBox.h - margin*2;
  if(bbox.w <= 0 || bbox.h <= 0) return 1;
  return Math.max(0.05, Math.min(50, Math.min(vw / bbox.w, vh / bbox.h)));
}

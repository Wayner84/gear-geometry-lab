// Minimal DXF export (R12-ish) using POLYLINE/ VERTEX entities.
// Good enough for importing outlines into most CAD.

function num(n){
  // DXF likes '.' decimals
  return (Math.round(n * 1000) / 1000).toString();
}

function header(){
  return [
    '0','SECTION',
    '2','HEADER',
    '9','$ACADVER',
    '1','AC1009',
    '0','ENDSEC',
    '0','SECTION',
    '2','ENTITIES',
  ].join('\n') + '\n';
}

function footer(){
  return [
    '0','ENDSEC',
    '0','EOF',
  ].join('\n') + '\n';
}

function polyline(points, { layer='0', closed=true } = {}){
  const lines = [];
  lines.push('0','POLYLINE');
  lines.push('8', layer);
  lines.push('66','1');
  lines.push('70', closed ? '1' : '0');

  for(const p of points){
    lines.push('0','VERTEX');
    lines.push('8', layer);
    lines.push('10', num(p.x));
    lines.push('20', num(p.y));
    lines.push('30', '0');
  }

  lines.push('0','SEQEND');
  return lines.join('\n') + '\n';
}

export function dxfFromPolylines(polylines, opts = {}){
  const { layer='GEAR' } = opts;
  let out = header();
  polylines.forEach((pts, i) => {
    if(!pts || pts.length < 2) return;
    out += polyline(pts, { layer: `${layer}_${i+1}`, closed: true });
  });
  out += footer();
  return out;
}

// Gear geometry helpers (involute spur gear + rack) — designed for CAD dimensions first, preview second.

export function fmt(val, unit){
  if(unit === 'deg') return (Math.round(val*10)/10).toFixed(1);
  // keep it readable: adaptive decimals
  const abs = Math.abs(val);
  const d = abs >= 100 ? 2 : abs >= 10 ? 3 : 4;
  return Number.isFinite(val) ? (Math.round(val * Math.pow(10,d)) / Math.pow(10,d)).toFixed(d) : '—';
}

export function computeGear(inp){
  const { type, units, N, D, phi, backlash, addendum, dedendum, rackLength, thickness } = inp;

  // For rack: we still derive module from D/N if given; fallback to 2mm if nonsense.
  const m = (type === 'rack')
    ? (Number.isFinite(D) && Number.isFinite(N) && N > 0 ? D / N : 2)
    : (D / N);

  const p = Math.PI * m; // circular pitch
  const a = (addendum && addendum > 0) ? addendum : (1.0 * m);
  const b = (dedendum && dedendum > 0) ? dedendum : (1.25 * m);

  // Tooth thickness at pitch circle
  const s0 = p/2;
  const s = Math.max(0, s0 - backlash);

  const phiDeg = phi * 180/Math.PI;

  // External/internal share base circle based on pitch circle
  const Db = (type === 'rack') ? 0 : D * Math.cos(phi);

  // Outside/root diameters for external
  const Do_ext = D + 2*a;
  const Dr_ext = Math.max(0.001, D - 2*b);

  // For internal: ring gear (teeth inward). Common convention:
  // outer diameter is *pitch diameter - 2*addendum* ? Actually the tooth tips are toward center,
  // so the tip circle is smaller than pitch circle: Dt = D - 2a; root circle larger: Dr = D + 2b.
  const Do_int_tip = Math.max(0.001, D - 2*a);
  const Dr_int_root = D + 2*b;

  // Simple undercut heuristic (no profile shift): N_min ≈ 2 / sin^2(phi)
  const NminNoUndercut = Math.ceil(2 / (Math.sin(phi) ** 2));
  const undercutRisk = (type !== 'rack') && (N < NminNoUndercut);

  return {
    type,
    units,
    N,
    D,
    m,
    p,
    a,
    b,
    phi,
    phiDeg,
    backlash,
    s0,
    s,
    Db,
    Do: type === 'internal' ? Dr_int_root : Do_ext,   // for internal, exported Do = outer ring OD (root circle)
    Dr: type === 'internal' ? Do_int_tip : Dr_ext,    // for internal, exported Dr = inner tip circle (tooth tips)
    // additional explicit names
    Do_ext,
    Dr_ext,
    Dt_int: Do_int_tip,
    Dro_int: Dr_int_root,
    rackLength,
    thickness: (Number.isFinite(thickness) && thickness>0) ? thickness : 0,
    undercutRisk,
    NminNoUndercut,
  };
}

function involutePoint(rb, t){
  // Involute of a circle parameterization:
  // x = rb (cos t + t sin t)
  // y = rb (sin t - t cos t)
  const ct = Math.cos(t), st = Math.sin(t);
  return { x: rb * (ct + t * st), y: rb * (st - t * ct) };
}

function polar(r, theta){
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

function rotate(pt, a){
  const c = Math.cos(a), s = Math.sin(a);
  return { x: pt.x * c - pt.y * s, y: pt.x * s + pt.y * c };
}

function translate(pt, dx, dy){
  return { x: pt.x + dx, y: pt.y + dy };
}

function pathFromPoints(points, close=true){
  if(points.length < 2) return '';
  const [p0, ...rest] = points;
  let d = `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)}`;
  for(const p of rest) d += ` L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  if(close) d += ' Z';
  return d;
}

function sampleInvolute(rb, rTarget, samples){
  // find t such that r = rb * sqrt(1 + t^2) = rTarget
  const tMax = Math.sqrt(Math.max(0, (rTarget*rTarget)/(rb*rb) - 1));
  const pts = [];
  for(let i=0;i<=samples;i++){
    const t = tMax * (i/samples);
    pts.push(involutePoint(rb, t));
  }
  return { pts, tMax };
}

function angleOfPoint(pt){
  return Math.atan2(pt.y, pt.x);
}

export function buildExternalGearPath(c, inp, { cx, cy }){
  const N = c.N;
  const rp = c.D/2;
  const rb = c.Db/2;
  const ra = c.Do_ext/2;
  const rr = c.Dr_ext/2;

  // Guard: if root circle is above base circle, involute starts at root; else starts at base.
  const rStart = Math.max(rr, rb);
  const invol = sampleInvolute(rb, ra, inp.samples);

  // Determine tooth thickness angle at pitch circle.
  // Standard tooth thickness at pitch circle is s; half-angle at pitch: theta_p = s/(2*rp)
  // Apply backlash already in s.
  const thetaPitchHalf = (c.s / (2*rp));

  // Involute intersects pitch circle at t_p where r = rp
  const tp = Math.sqrt(Math.max(0, (rp*rp)/(rb*rb) - 1));
  const pPitch = involutePoint(rb, tp);
  const alphaPitch = angleOfPoint(pPitch);

  // Rotate involute so that at pitch circle its angular position equals +thetaPitchHalf.
  const rot = thetaPitchHalf - alphaPitch;

  // Build one tooth as polygon-like boundary: left flank (involute) + tip arc + right flank (mirrored) + root arc.
  const leftFlank = invol.pts.map(pt => rotate(pt, rot));

  // If starting radius is above base, clamp initial segment by scaling down along involute parameter.
  // Quick & robust: replace first point with intersection at rStart.
  const tStart = Math.sqrt(Math.max(0, (rStart*rStart)/(rb*rb) - 1));
  const pStart = rotate(involutePoint(rb, tStart), rot);
  leftFlank[0] = pStart;

  // Mirror for right flank about x-axis
  const rightFlank = leftFlank.map(p => ({ x: p.x, y: -p.y })).reverse();

  // Tip arc endpoints
  const tipL = leftFlank[leftFlank.length-1];
  const tipR = rightFlank[0];
  const angL = Math.atan2(tipL.y, tipL.x);
  const angR = Math.atan2(tipR.y, tipR.x);

  // Ensure we go the shorter way across the top (positive direction)
  let ang1 = angL;
  let ang2 = angR;
  if(ang2 < ang1) ang2 += Math.PI*2;

  const tipPts = [];
  const tipSteps = Math.max(10, Math.floor(inp.samples/2));
  for(let i=1;i<tipSteps;i++){
    const a = ang1 + (ang2-ang1)*(i/tipSteps);
    tipPts.push(polar(ra, a));
  }

  // Root arc between flanks at root radius
  const rootL = leftFlank[0];
  const rootR = rightFlank[rightFlank.length-1];
  let ar1 = Math.atan2(rootR.y, rootR.x);
  let ar2 = Math.atan2(rootL.y, rootL.x);
  if(ar2 < ar1) ar2 += Math.PI*2;

  const rootPts = [];
  const rootSteps = Math.max(10, Math.floor(inp.samples/2));
  for(let i=1;i<rootSteps;i++){
    const a = ar1 + (ar2-ar1)*(i/rootSteps);
    rootPts.push(polar(rr, a));
  }

  const toothPts = [
    ...leftFlank,
    ...tipPts,
    ...rightFlank,
    ...rootPts,
  ];

  // Replicate around circle as separate closed tooth outlines
  const els = [];
  const polylines = [];
  for(let k=0;k<N;k++){
    const a = k * (2*Math.PI/N);
    const poly = toothPts.map(p => translate(rotate(p, a), cx, cy));
    polylines.push(poly);
    els.push(svgPath(pathFromPoints(poly, true)));
  }

  return { els, polylines };
}

export function buildInternalGearPath(c, inp, { cx, cy }){
  // Ring gear: we draw the *inner* tooth boundary as a path.
  // Conceptually, it's like an external gear but inverted: tooth tips on a smaller circle.
  const N = c.N;
  const rp = c.D/2;
  const rb = c.Db/2;
  const rTipInner = c.Dt_int/2;   // tooth tips toward center
  const rRootOuter = c.Dro_int/2; // root circle (outer boundary of tooth space)

  // We generate an external gear at pitch and then map radii: treat rTip as "addendum" target.
  const invol = sampleInvolute(rb, Math.max(rb+0.0001, rp), inp.samples);

  const thetaPitchHalf = (c.s / (2*rp));
  const tp = Math.sqrt(Math.max(0, (rp*rp)/(rb*rb) - 1));
  const pPitch = involutePoint(rb, tp);
  const alphaPitch = angleOfPoint(pPitch);
  const rot = thetaPitchHalf - alphaPitch;

  // For internal gear, the tooth space boundary is the *complement*; we approximate by building flanks
  // that go from pitch toward inner tip circle.
  const tTip = Math.sqrt(Math.max(0, (rTipInner*rTipInner)/(rb*rb) - 1));
  const flankPts = [];
  const s = inp.samples;
  for(let i=0;i<=s;i++){
    const t = tTip * (i/s);
    const p = rotate(involutePoint(rb, t), rot);
    flankPts.push(p);
  }

  // Start at pitch (or base if pitch < base)
  // Root arc at rRootOuter closes the space between teeth.
  const left = flankPts;
  const right = left.map(p => ({ x: p.x, y: -p.y })).reverse();

  const tipL = left[left.length-1];
  const tipR = right[0];
  let angL = Math.atan2(tipL.y, tipL.x);
  let angR = Math.atan2(tipR.y, tipR.x);
  if(angR < angL) angR += Math.PI*2;

  // Inner tip arc (at rTipInner) but this is the inner boundary; keep it smooth.
  const tipPts = [];
  const tipSteps = Math.max(10, Math.floor(inp.samples/2));
  for(let i=1;i<tipSteps;i++){
    const a = angL + (angR-angL)*(i/tipSteps);
    tipPts.push(polar(rTipInner, a));
  }

  // Root arc at rRootOuter between right bottom and left bottom
  const rootL = left[0];
  const rootR = right[right.length-1];
  let ar1 = Math.atan2(rootL.y, rootL.x);
  let ar2 = Math.atan2(rootR.y, rootR.x);
  if(ar2 < ar1) ar2 += Math.PI*2;

  const rootPts = [];
  const rootSteps = Math.max(10, Math.floor(inp.samples/2));
  for(let i=1;i<rootSteps;i++){
    const a = ar1 + (ar2-ar1)*(i/rootSteps);
    rootPts.push(polar(rRootOuter, a));
  }

  const toothSpace = [
    ...left,
    ...tipPts,
    ...right,
    ...rootPts,
  ];

  const els = [];
  const polylines = [];
  for(let k=0;k<N;k++){
    const a = k * (2*Math.PI/N);
    const poly = toothSpace.map(p => translate(rotate(p, a), cx, cy));
    polylines.push(poly);
    els.push(svgPath(pathFromPoints(poly, true)));
  }

  return { els, polylines };
}

export function buildRackPath(c, inp, { x, y }){
  // Rack at baseline y, extending in +y for addendum, -y for dedendum.
  const p = c.p;
  const phi = c.phi;

  const L = c.rackLength;
  const teethShown = Math.max(2, Math.floor(inp.N || Math.ceil(L/p)));
  const pitchCount = Math.max(2, Math.ceil(L / p));
  const count = Math.max(teethShown, pitchCount);

  const a = c.a, b = c.b;

  // Tooth thickness at pitch on rack is s (linear). Half thickness.
  const half = c.s / 2;

  // Flank slope determined by pressure angle: tan(phi) = rise/run.
  // For a given vertical rise (a + b), horizontal run = (a+b) / tan(phi)
  const h = a + b;
  const run = h / Math.tan(phi);

  // Build a repeated tooth profile polyline.
  // We draw from left to right, staying within [x, x+L].
  const pts = [];
  const x0 = x;
  const x1 = x + L;

  // Start at left root
  pts.push({ x: x0, y: y + b });
  pts.push({ x: x0, y: y - a });

  for(let i=0;i<=count;i++){
    const xc = x0 + i * p;

    // tip plateau centered on pitch line around xc
    const tipL = xc - half;
    const tipR = xc + half;

    // compute roots with flank run
    const rootL = tipL - run;
    const rootR = tipR + run;

    // Add this tooth if within extents.
    // left flank up
    if(rootL >= x0 - p && rootL <= x1 + p) pts.push({ x: rootL, y: y + b });
    if(tipL >= x0 - p && tipL <= x1 + p) pts.push({ x: tipL, y: y - a });
    if(tipR >= x0 - p && tipR <= x1 + p) pts.push({ x: tipR, y: y - a });
    // right flank down
    if(rootR >= x0 - p && rootR <= x1 + p) pts.push({ x: rootR, y: y + b });
  }

  // Close shape by returning to right top then right bottom then back.
  pts.push({ x: x1, y: y + b });

  const d = pathFromPoints(pts.map(p => p), true);
  return { el: svgPath(d), points: pts };
}

function svgPath(d){
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'gearStroke');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  return path;
}

export function downloadText(filename, text, mime='text/plain'){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

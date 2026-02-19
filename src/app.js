import { computeGear, buildExternalGearPath, buildInternalGearPath, buildRackPath, fmt, downloadText, copyTextToClipboard } from './gear.js';
import { dxfFromPolylines } from './dxf.js';
import { bboxFromPolylines, fitScaleToViewBox } from './fit.js';

const $ = (id) => document.getElementById(id);

const els = {
  type: $('type'),
  units: $('units'),
  teeth: $('teeth'),
  pitchDiameter: $('pitchDiameter'),
  pressureAngle: $('pressureAngle'),
  backlash: $('backlash'),
  addendum: $('addendum'),
  dedendum: $('dedendum'),
  rackLength: $('rackLength'),
  thickness: $('thickness'),
  samples: $('samples'),

  dims: $('dims'),

  svg: $('svg'),
  drawing: $('drawing'),
  dimsLayer: $('dimsLayer'),
  legend1: $('legendLine1'),
  legend2: $('legendLine2'),
  legend3: $('legendLine3'),

  btnCopyDims: $('btnCopyDims'),
  btnDownloadSVG: $('btnDownloadSVG'),
  btnDownloadDXF: $('btnDownloadDXF'),

  zoomIn: $('zoomIn'),
  zoomOut: $('zoomOut'),
  zoomReset: $('zoomReset'),
  viewport: $('viewport'),
};

let camera = { x: 0, y: 0, k: 1 };
let isPanning = false;
let panStart = null;
let autoFit = true;

function readInputs(){
  const type = els.type.value;
  const units = els.units.value;
  const N = Number(els.teeth.value);
  const D = Number(els.pitchDiameter.value);
  const phi = Number(els.pressureAngle.value) * Math.PI/180;
  const backlash = Number(els.backlash.value);
  const addendum = Number(els.addendum.value);
  const dedendum = Number(els.dedendum.value);
  const rackLength = Number(els.rackLength.value);
  const thickness = Number(els.thickness.value);
  const samples = Math.max(12, Math.floor(Number(els.samples.value) || 48));

  return { type, units, N, D, phi, backlash, addendum, dedendum, rackLength, thickness, samples };
}

function setFieldVisibility(){
  const type = els.type.value;
  const isRack = type === 'rack';

  els.teeth.closest('label').querySelector('small').textContent = isRack
    ? 'For rack: this becomes “teeth shown” in preview only.'
    : 'For gears: number of teeth.';

  els.pitchDiameter.closest('label').style.display = isRack ? 'none' : '';
  els.addendum.closest('label').style.display = '';
  els.dedendum.closest('label').style.display = '';
  els.rackLength.closest('label').style.display = isRack ? '' : 'none';
}

function clearNode(node){
  while(node.firstChild) node.removeChild(node.firstChild);
}

function svgEl(tag, attrs = {}){
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function drawDimLine(g, x1,y1,x2,y2, label){
  const line = svgEl('line', { x1, y1, x2, y2, class: 'dimLine' });
  const midx = (x1+x2)/2, midy=(y1+y2)/2;
  const text = svgEl('text', { x: midx, y: midy-8, class: 'dimText', 'text-anchor':'middle' });
  text.textContent = label;

  const cap1 = svgEl('circle', { cx:x1, cy:y1, r:3, class:'dimCap' });
  const cap2 = svgEl('circle', { cx:x2, cy:y2, r:3, class:'dimCap' });

  g.append(line, cap1, cap2, text);
}

function applySvgStyles(){
  // One-time inline style for exported SVG portability.
  if(els.svg.querySelector('style[data-inline]')) return;
  const style = svgEl('style', { 'data-inline':'true' });
  style.textContent = `
    .gearStroke{ fill:none; stroke: rgba(224,251,252,0.92); stroke-width:2.2; filter:url(#softGlow); }
    .pitch{ fill:none; stroke: rgba(255,209,102,0.78); stroke-width:1.1; stroke-dasharray: 6 8; }
    .base{ fill:none; stroke: rgba(69,243,255,0.55); stroke-width:1.1; stroke-dasharray: 3 6; }
    .root{ fill:none; stroke: rgba(255,92,122,0.45); stroke-width:1.1; stroke-dasharray: 8 7; }
    .centerDot{ fill: rgba(255,209,102,0.92); }
    .dimLine{ stroke: rgba(224,251,252,0.55); stroke-width:1.2; }
    .dimText{ fill: rgba(224,251,252,0.78); font-family: ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}; font-size: 12px; }
    .dimCap{ fill: rgba(224,251,252,0.78); }
  `;
  els.svg.insertBefore(style, els.svg.firstChild);
}

function update(){
  setFieldVisibility();
  applySvgStyles();

  const inp = readInputs();

  // Core derived dimensions
  const c = computeGear(inp);

  const unit = inp.units;
  const unitLabel = unit === 'mm' ? 'mm' : 'in';

  // Output block
  const lines = [];
  lines.push(`Type: ${inp.type}`);
  lines.push(`Units: ${unitLabel}`);
  if(inp.type !== 'rack'){
    lines.push(`N (teeth): ${inp.N}`);
    lines.push(`D (pitch dia): ${fmt(c.D, unit)} ${unitLabel}`);
  }
  lines.push(`Pressure angle: ${fmt(c.phiDeg, 'deg')}°`);
  lines.push(`Module m: ${fmt(c.m, unit)} ${unitLabel}`);
  lines.push(`Circular pitch p: ${fmt(c.p, unit)} ${unitLabel}`);
  lines.push(`Tooth thickness at pitch (no backlash): ${fmt(c.s0, unit)} ${unitLabel}`);
  lines.push(`Backlash (entered): ${fmt(c.backlash, unit)} ${unitLabel}`);
  lines.push(`Tooth thickness at pitch (with backlash): ${fmt(c.s, unit)} ${unitLabel}`);
  lines.push('');

  lines.push(`Thickness (face width): ${fmt(c.thickness, unit)} ${unitLabel}`);
  lines.push('');

  if(inp.type === 'rack'){
    lines.push(`Rack length: ${fmt(c.rackLength, unit)} ${unitLabel}`);
    lines.push(`Rack addendum: ${fmt(c.a, unit)} ${unitLabel}`);
    lines.push(`Rack dedendum: ${fmt(c.b, unit)} ${unitLabel}`);
    lines.push(`Total tooth height: ${fmt(c.a + c.b, unit)} ${unitLabel}`);
  } else {
    lines.push(`Addendum a: ${fmt(c.a, unit)} ${unitLabel}`);
    lines.push(`Dedendum b: ${fmt(c.b, unit)} ${unitLabel}`);
    lines.push(`Outside dia Do: ${fmt(c.Do, unit)} ${unitLabel}`);
    lines.push(`Root dia Dr: ${fmt(c.Dr, unit)} ${unitLabel}`);
    lines.push(`Base dia Db: ${fmt(c.Db, unit)} ${unitLabel}`);
    if(c.undercutRisk){
      lines.push('');
      lines.push(`⚠ Undercut risk: HIGH (N < ~${c.NminNoUndercut}) at ${fmt(c.phiDeg,'deg')}° without profile shift`);
    }
  }

  els.dims.textContent = lines.join('\n');

  // Legend
  els.legend1.textContent = inp.type === 'rack' ? `Rack • p=${fmt(c.p, unit)} ${unitLabel}` : `${inp.type === 'internal' ? 'Internal' : 'External'} spur • N=${inp.N} • m=${fmt(c.m, unit)} ${unitLabel}`;
  els.legend2.textContent = `φ=${fmt(c.phiDeg,'deg')}° • backlash=${fmt(c.backlash, unit)} ${unitLabel}`;
  els.legend3.textContent = inp.type === 'rack' ? `Len=${fmt(c.rackLength, unit)} ${unitLabel} • height=${fmt(c.a + c.b, unit)} ${unitLabel}` : `Do=${fmt(c.Do, unit)} ${unitLabel} • Dr=${fmt(c.Dr, unit)} ${unitLabel}`;

  // Drawing
  clearNode(els.drawing);
  clearNode(els.dimsLayer);

  const g = svgEl('g', { transform: cameraTransform() });
  const dimsG = svgEl('g', { transform: cameraTransform() });

  const cx = 600, cy = 380;

  // Keep last generated outline points (for DXF)
  window.__lastPolylines = [];

  if(inp.type === 'rack'){
    const rack = buildRackPath(c, inp, { x: cx - c.rackLength/2, y: cy });
    g.append(rack.el);
    window.__lastPolylines = [rack.points];

    // dim line: rack length
    drawDimLine(dimsG, cx - c.rackLength/2, cy + (c.a + c.b) + 28, cx + c.rackLength/2, cy + (c.a + c.b) + 28, `L ${fmt(c.rackLength, unit)} ${unitLabel}`);
  } else {
    const gear = inp.type === 'internal'
      ? buildInternalGearPath(c, inp, { cx, cy })
      : buildExternalGearPath(c, inp, { cx, cy });

    // reference circles
    const pitch = svgEl('circle', { cx, cy, r: c.D/2, class: 'pitch' });
    const base = svgEl('circle', { cx, cy, r: c.Db/2, class: 'base' });
    const root = svgEl('circle', { cx, cy, r: c.Dr/2, class: 'root' });
    const center = svgEl('circle', { cx, cy, r: 3.2, class: 'centerDot' });

    g.append(pitch, base, root, gear.el, center);
    window.__lastPolylines = [gear.points];

    // dim: outside diameter
    drawDimLine(dimsG, cx - c.Do/2, cy - c.Do/2 - 32, cx + c.Do/2, cy - c.Do/2 - 32, `Do ${fmt(c.Do, unit)} ${unitLabel}`);
    // dim: pitch diameter
    drawDimLine(dimsG, cx - c.D/2, cy + c.D/2 + 32, cx + c.D/2, cy + c.D/2 + 32, `D ${fmt(c.D, unit)} ${unitLabel}`);
  }

  // Auto-fit on first render (or after reset)
  if(autoFit){
    const vb = els.svg.viewBox.baseVal;
    const viewBox = { w: vb.width || 1200, h: vb.height || 800 };
    const bbox = bboxFromPolylines(window.__lastPolylines);
    const kFit = fitScaleToViewBox(bbox, viewBox, 110);
    camera.k = kFit;
    camera.x = 0;
    camera.y = 0;

    // re-apply transforms after fitting
    g.setAttribute('transform', cameraTransform());
    dimsG.setAttribute('transform', cameraTransform());
  }

  els.drawing.appendChild(g);
  els.dimsLayer.appendChild(dimsG);
}

function cameraTransform(){
  const cx = 600, cy = 400;
  // translate to center, apply pan, scale about center
  return `translate(${camera.x} ${camera.y}) translate(${cx} ${cy}) scale(${camera.k}) translate(${-cx} ${-cy})`;
}

function setCamera(k, dx=0, dy=0){
  autoFit = false;
  camera.k = Math.max(0.3, Math.min(20, k));
  camera.x += dx;
  camera.y += dy;
  update();
}

function initPanZoom(){
  els.viewport.addEventListener('pointerdown', (e) => {
    autoFit = false;
    isPanning = true;
    els.viewport.setPointerCapture(e.pointerId);
    panStart = { x: e.clientX, y: e.clientY, ox: camera.x, oy: camera.y };
  });
  els.viewport.addEventListener('pointermove', (e) => {
    if(!isPanning || !panStart) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    camera.x = panStart.ox + dx;
    camera.y = panStart.oy + dy;
    update();
  });
  els.viewport.addEventListener('pointerup', () => { isPanning=false; panStart=null; });
  els.viewport.addEventListener('pointercancel', () => { isPanning=false; panStart=null; });

  els.viewport.addEventListener('wheel', (e) => {
    autoFit = false;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = delta > 0 ? 0.92 : 1.08;
    setCamera(camera.k * factor);
  }, { passive:false });

  els.zoomIn.addEventListener('click', () => setCamera(camera.k * 1.12));
  els.zoomOut.addEventListener('click', () => setCamera(camera.k * 0.90));
  els.zoomReset.addEventListener('click', () => { camera = { x:0, y:0, k:1 }; autoFit = true; update(); });
}

function bind(){
  const ids = ['type','units','teeth','pitchDiameter','pressureAngle','backlash','addendum','dedendum','rackLength','thickness','samples'];
  for(const id of ids){
    $(id).addEventListener('input', update);
    $(id).addEventListener('change', update);
  }

  els.btnCopyDims.addEventListener('click', async () => {
    await copyTextToClipboard(els.dims.textContent);
    els.btnCopyDims.textContent = 'Copied';
    setTimeout(() => (els.btnCopyDims.textContent = 'Copy dimensions'), 900);
  });

  els.btnDownloadSVG.addEventListener('click', () => {
    // Export current SVG view, with inline styles
    const clone = els.svg.cloneNode(true);
    // ensure inline style exists
    if(!clone.querySelector('style[data-inline]')){
      const style = document.querySelector('style[data-inline]')?.cloneNode(true);
      if(style) clone.insertBefore(style, clone.firstChild);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + clone.outerHTML;
    downloadText('gear-geometry.svg', xml, 'image/svg+xml');
  });

  els.btnDownloadDXF.addEventListener('click', () => {
    const polys = window.__lastPolylines || [];
    const dxf = dxfFromPolylines(polys, { layer: 'GEAR' });
    downloadText('gear-geometry.dxf', dxf, 'application/dxf');
  });
}

initPanZoom();
bind();
update();

'use strict';

// ── GRID / GEOMETRY HELPERS ──────────────────────────────────────────────────
const GRID = 32;
function snap(v) { return Math.round(v / GRID) * GRID; }

function polylinePoint(pts, t) {
  if (pts.length < 2) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, angle: 0 };
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y;
    const len = Math.sqrt(dx*dx + dy*dy);
    segs.push({ len, dx, dy, x0: pts[i].x, y0: pts[i].y });
    total += len;
  }
  let target = Math.max(0, Math.min(1, t)) * total, acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (acc + s.len >= target || i === segs.length - 1) {
      const f = s.len > 0 ? Math.min(1, (target - acc) / s.len) : 0;
      return { x: s.x0 + s.dx * f, y: s.y0 + s.dy * f, angle: Math.atan2(s.dy, s.dx) * 180 / Math.PI };
    }
    acc += s.len;
  }
  const s = segs[segs.length - 1];
  return { x: s.x0 + s.dx, y: s.y0 + s.dy, angle: Math.atan2(s.dy, s.dx) * 180 / Math.PI };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, lenSq = dx*dx + dy*dy;
  if (!lenSq) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
  return Math.hypot(px - ax - t*dx, py - ay - t*dy);
}

// ── CABLE TYPE DEFINITIONS ──────────────────────────────────────────────────
const CABLE_TYPES = {
  'USB-A':         { color: '#2563eb', label: 'USB-A' },
  'USB-C':         { color: '#7c3aed', label: 'USB-C' },
  'USB-B':         { color: '#0891b2', label: 'USB-B' },
  'HDMI':          { color: '#d97706', label: 'HDMI' },
  'DisplayPort':   { color: '#dc2626', label: 'DP' },
  'Ethernet':      { color: '#16a34a', label: 'ETH' },
  'Power':         { color: '#6b7280', label: 'PWR' },
  'Audio':         { color: '#db2777', label: 'AUD' },
  'Other':         { color: '#94a3b8', label: '...' },
};

// ── DEVICE TYPE DEFINITIONS ─────────────────────────────────────────────────
const DEVICE_TYPES = {
  pc:         { icon: '🖥️',  label: 'PC / Laptop',   defaultName: 'PC',          defaultColor: '#6366f1' },
  kvm:        { icon: '🔀',  label: 'KVM Switch',     defaultName: 'KVM Switch',  defaultColor: '#f59e0b' },
  monitor:    { icon: '🖵',  label: 'Monitor',        defaultName: 'Monitor',     defaultColor: '#0ea5e9' },
  usb_hub:    { icon: '🔌',  label: 'USB Hub',        defaultName: 'USB Hub',     defaultColor: '#10b981' },
  usb_device: { icon: '💾',  label: 'USB Device',     defaultName: 'USB Device',  defaultColor: '#8b5cf6' },
  audio:      { icon: '🔊',  label: 'Audio Device',   defaultName: 'Speakers',    defaultColor: '#ec4899' },
  network:    { icon: '🌐',  label: 'Network Switch', defaultName: 'Switch',      defaultColor: '#14b8a6' },
  other:      { icon: '⬜',  label: 'Other Device',   defaultName: 'Device',      defaultColor: '#64748b' },
};

// ── DEFAULT LAYOUT ──────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  nextId: 12,
  devices: [
    { id: 1,  type: 'pc',         name: 'PC 1',         x: 80,  y: 180, color: '#6366f1' },
    { id: 2,  type: 'pc',         name: 'PC 2',         x: 80,  y: 360, color: '#6366f1' },
    { id: 3,  type: 'kvm',        name: 'KVM Switch',   x: 340, y: 270, color: '#f59e0b' },
    { id: 4,  type: 'monitor',    name: 'Monitor 1',    x: 600, y: 120, color: '#0ea5e9' },
    { id: 5,  type: 'monitor',    name: 'Monitor 2',    x: 600, y: 300, color: '#0ea5e9' },
    { id: 6,  type: 'usb_device', name: 'Keyboard',     x: 600, y: 490, color: '#8b5cf6' },
    { id: 7,  type: 'usb_device', name: 'Mouse',        x: 760, y: 490, color: '#8b5cf6' },
    { id: 8,  type: 'usb_device', name: 'Webcam',       x: 600, y: 580, color: '#8b5cf6' },
    { id: 9,  type: 'usb_device', name: 'Headset',      x: 760, y: 580, color: '#ec4899' },
    { id: 10, type: 'usb_device', name: 'USB Drive',    x: 600, y: 670, color: '#8b5cf6' },
    { id: 11, type: 'usb_device', name: 'USB Device 6', x: 760, y: 670, color: '#8b5cf6' },
  ],
  cables: [],
};

// ── STATE ───────────────────────────────────────────────────────────────────
let state = {
  nextId: 1,
  devices: [],
  cables: [],
  selected: null,   // { kind: 'device'|'cable', id }
  mode: 'select',   // 'select' | 'cable'
  cableSource: null,
  pan: { x: 0, y: 0 },
  zoom: 1,
  dragging: null,
  draggingWaypoint: null,
  panning: false,
  panStart: null,
};

// ── DOM REFS ────────────────────────────────────────────────────────────────
const canvasWrap  = document.getElementById('canvas-wrap');
const canvasInner = document.getElementById('canvas-inner');
const svgLayer    = document.getElementById('cables');
const propsContent = document.getElementById('props-content');
const propsEmpty  = document.getElementById('props-empty');
const modalOverlay = document.getElementById('modal-overlay');
const toast       = document.getElementById('toast');

let toastTimer = null;

// ── SVG DEFS ─────────────────────────────────────────────────────────────────
function initSvgDefs() {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arr-end" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 0 2 L 9 5 L 0 8 Z" fill="context-stroke"/>
    </marker>
    <marker id="arr-start" viewBox="0 0 10 10" refX="1" refY="5"
      markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 10 2 L 1 5 L 10 8 Z" fill="context-stroke"/>
    </marker>`;
  svgLayer.appendChild(defs);
}

// ── INIT ────────────────────────────────────────────────────────────────────
function init() {
  initSvgDefs();
  loadState();
  renderAll();
  bindToolbar();
  bindPalette();
  bindCanvas();
  bindKeyboard();
  bindModal();
  updatePropsPanel();
}

// ── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderDevices();
  renderCables();
}

function renderDevices() {
  // Remove cards for deleted devices
  const existing = new Set(Array.from(canvasInner.querySelectorAll('.device-card')).map(el => +el.dataset.id));
  const current  = new Set(state.devices.map(d => d.id));
  existing.forEach(id => { if (!current.has(id)) canvasInner.querySelector(`.device-card[data-id="${id}"]`)?.remove(); });

  state.devices.forEach(d => {
    let el = canvasInner.querySelector(`.device-card[data-id="${d.id}"]`);
    const isNew = !el;
    if (isNew) {
      el = document.createElement('div');
      el.className = 'device-card';
      el.dataset.id = d.id;
      el.innerHTML = `
        <div class="dc-color-bar"></div>
        <div class="dc-icon"></div>
        <div class="dc-name"></div>
        <div class="dc-type"></div>`;
      canvasInner.appendChild(el);
      bindDeviceCard(el, d.id);
    }

    const def = DEVICE_TYPES[d.type] || DEVICE_TYPES.other;
    el.querySelector('.dc-color-bar').style.background = d.color;
    el.querySelector('.dc-icon').textContent = def.icon;
    el.querySelector('.dc-name').textContent = d.name;
    el.querySelector('.dc-type').textContent = def.label;
    el.style.left = d.x + 'px';
    el.style.top  = d.y + 'px';
    el.classList.toggle('selected',      state.selected?.kind === 'device' && state.selected?.id === d.id);
    el.classList.toggle('cable-source',  state.cableSource === d.id);
  });
}

function renderCables() {
  Array.from(svgLayer.children).forEach(el => { if (el.tagName !== 'defs') el.remove(); });

  // Fan group: cables without waypoints sharing the same pair get spread apart
  const pairGroups = {};
  state.cables.forEach(c => {
    if (!(c.waypoints?.length)) {
      const key = `${Math.min(c.fromId, c.toId)}-${Math.max(c.fromId, c.toId)}`;
      (pairGroups[key] ??= []).push(c.id);
    }
  });

  state.cables.forEach(c => {
    const from = state.devices.find(d => d.id === c.fromId);
    const to   = state.devices.find(d => d.id === c.toId);
    if (!from || !to) return;

    const ct    = CABLE_TYPES[c.cableType] || CABLE_TYPES['Other'];
    const isSel = state.selected?.kind === 'cable' && state.selected?.id === c.id;
    const dir   = c.direction ?? 'to';
    const wp    = c.waypoints || [];
    const x1    = from.x + 64, y1 = from.y + 44;
    const x2    = to.x   + 64, y2 = to.y   + 44;

    // Build path + sample points for label/arrow placement
    let pathD, pts;
    if (wp.length > 0) {
      pts   = [{x:x1,y:y1}, ...wp, {x:x2,y:y2}];
      pathD = 'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
    } else {
      const pairKey  = `${Math.min(c.fromId, c.toId)}-${Math.max(c.fromId, c.toId)}`;
      const group    = pairGroups[pairKey] || [c.id];
      const count    = group.length;
      const idx      = group.indexOf(c.id);
      const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy) || 1;
      const px = -dy/len, py = dx/len;
      const off = (idx - (count-1)/2) * 42 + (count === 1 ? 22 : 0);
      const cxq = (x1+x2)/2 + px*off, cyq = (y1+y2)/2 + py*off;
      pathD = `M${x1},${y1} Q${cxq},${cyq} ${x2},${y2}`;
      // Sample bezier into polyline for unified label/arrow math
      pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i/20;
        pts.push({ x: (1-t)*(1-t)*x1 + 2*(1-t)*t*cxq + t*t*x2,
                   y: (1-t)*(1-t)*y1 + 2*(1-t)*t*cyq + t*t*y2 });
      }
    }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = c.id;
    if (isSel) g.classList.add('cable-selected');

    // Hit area — double-click adds a waypoint
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', pathD);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '16');
    hit.setAttribute('fill', 'none');
    hit.classList.add('cable-hit');
    hit.style.pointerEvents = 'stroke';
    hit.addEventListener('click',    e => { e.stopPropagation(); selectItem('cable', c.id); });
    hit.addEventListener('dblclick', e => {
      e.stopPropagation();
      const wr = canvasWrap.getBoundingClientRect();
      addWaypoint(c.id,
        snap((e.clientX - wr.left - state.pan.x) / state.zoom),
        snap((e.clientY - wr.top  - state.pan.y) / state.zoom));
    });

    // Visible line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', pathD);
    line.setAttribute('stroke', ct.color);
    line.setAttribute('stroke-dasharray', isSel ? '6,3' : 'none');
    line.setAttribute('opacity', isSel ? '1' : '0.85');
    line.classList.add('cable-line');

    // Direction arrows at 28% and 72% of path length
    const mkArrow = (t, flip) => {
      const { x, y, angle } = polylinePoint(pts, t);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', 'M -6,-4 L 6,0 L -6,4 Z');
      el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(angle+(flip?180:0)).toFixed(1)})`);
      el.setAttribute('fill', ct.color);
      el.setAttribute('opacity', isSel ? '1' : '0.9');
      el.style.pointerEvents = 'none';
      return el;
    };

    g.appendChild(hit);
    g.appendChild(line);
    if (dir === 'to')   g.appendChild(mkArrow(0.72, false));
    if (dir === 'from') g.appendChild(mkArrow(0.28, true));
    if (dir === 'both') { g.appendChild(mkArrow(0.28, true)); g.appendChild(mkArrow(0.72, false)); }

    svgLayer.appendChild(g);

    // Label — added before waypoint handles so handles render on top and stay interactive
    const { x: lx, y: ly } = polylinePoint(pts, 0.5);
    const labelText = c.label || ct.label;
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', lx);
    txt.setAttribute('y', ly);
    txt.classList.add('cable-label-text');
    txt.setAttribute('fill', ct.color);
    txt.textContent = labelText;
    g.appendChild(txt);

    const pad = 8, rw = Math.max(28, txt.getComputedTextLength() + pad * 2);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', lx - rw / 2);
    rect.setAttribute('y', ly - 9);
    rect.setAttribute('width', rw);
    rect.setAttribute('height', 18);
    rect.setAttribute('rx', 4);
    rect.setAttribute('fill', '#1a1d27');
    rect.setAttribute('stroke', ct.color);
    rect.setAttribute('stroke-width', '1');
    g.insertBefore(rect, txt);

    // Waypoint handles appended last — always on top of the label
    if (isSel) {
      wp.forEach((w, i) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', w.x);
        circle.setAttribute('cy', w.y);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', ct.color);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1.5');
        circle.style.cursor = 'grab';
        circle.style.pointerEvents = 'all';
        circle.addEventListener('mousedown', e => startWaypointDrag(e, c.id, i));
        circle.addEventListener('dblclick',  e => { e.stopPropagation(); removeWaypoint(c.id, i); });
        g.appendChild(circle);
      });
    } else if (wp.length > 0) {
      wp.forEach(w => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', w.x);
        dot.setAttribute('cy', w.y);
        dot.setAttribute('r', 3);
        dot.setAttribute('fill', ct.color);
        dot.setAttribute('opacity', '0.4');
        dot.style.pointerEvents = 'none';
        g.appendChild(dot);
      });
    }
  });
}

// ── SELECTION ───────────────────────────────────────────────────────────────
function selectItem(kind, id) {
  if (state.mode === 'cable' && kind === 'device') {
    handleCableClick(id);
    return;
  }
  state.selected = id != null ? { kind, id } : null;
  state.cableSource = null;
  renderAll();
  updatePropsPanel();
}

function clearSelection() {
  state.selected = null;
  state.cableSource = null;
  renderAll();
  updatePropsPanel();
}

// ── CABLE MODE ──────────────────────────────────────────────────────────────
function setMode(m) {
  state.mode = m;
  state.cableSource = null;
  canvasWrap.className = m === 'cable' ? 'mode-cable' : '';
  document.getElementById('btn-select').classList.toggle('active', m === 'select');
  document.getElementById('btn-cable').classList.toggle('active',  m === 'cable');
  renderDevices();
}

function handleCableClick(deviceId) {
  if (!state.cableSource) {
    state.cableSource = deviceId;
    renderDevices();
    showToast('Now click the destination device');
  } else if (state.cableSource === deviceId) {
    state.cableSource = null;
    renderDevices();
  } else {
    openCableModal(state.cableSource, deviceId);
    state.cableSource = null;
    setMode('select');
  }
}

// ── DEVICE CRUD ─────────────────────────────────────────────────────────────
function addDevice(type, x, y) {
  const def = DEVICE_TYPES[type] || DEVICE_TYPES.other;
  const count = state.devices.filter(d => d.type === type).length + 1;
  const device = {
    id:    state.nextId++,
    type,
    name:  count > 1 ? `${def.defaultName} ${count}` : def.defaultName,
    x:     x ?? 200,
    y:     y ?? 200,
    color: def.defaultColor,
  };
  state.devices.push(device);
  saveState();
  renderAll();
  selectItem('device', device.id);
  return device;
}

function removeDevice(id) {
  state.devices = state.devices.filter(d => d.id !== id);
  state.cables  = state.cables.filter(c => c.fromId !== id && c.toId !== id);
  if (state.selected?.id === id) state.selected = null;
  saveState();
  renderAll();
  updatePropsPanel();
}

function updateDevice(id, patch) {
  const d = state.devices.find(d => d.id === id);
  if (!d) return;
  Object.assign(d, patch);
  saveState();
  renderAll();
}

// ── CABLE CRUD ───────────────────────────────────────────────────────────────
function addWaypoint(cableId, x, y) {
  const c = state.cables.find(c => c.id === cableId);
  const from = state.devices.find(d => d.id === c?.fromId);
  const to   = state.devices.find(d => d.id === c?.toId);
  if (!c || !from || !to) return;
  c.waypoints = c.waypoints || [];
  const pts = [{x: from.x+64, y: from.y+44}, ...c.waypoints, {x: to.x+64, y: to.y+44}];
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(x, y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  c.waypoints.splice(bestIdx, 0, { x, y });
  selectItem('cable', cableId);
  saveState();
  renderCables();
}

function removeWaypoint(cableId, index) {
  const c = state.cables.find(c => c.id === cableId);
  if (!c) return;
  c.waypoints.splice(index, 1);
  saveState();
  renderCables();
}

function startWaypointDrag(e, cableId, index) {
  e.stopPropagation();
  e.preventDefault();
  const c = state.cables.find(c => c.id === cableId);
  if (!c) return;
  state.draggingWaypoint = {
    cableId, index,
    origX: c.waypoints[index].x,
    origY: c.waypoints[index].y,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
  };
}

function addCable(fromId, toId, cableType, label) {
  const cable = { id: state.nextId++, fromId, toId, cableType, label: label || '', direction: 'to', waypoints: [] };
  state.cables.push(cable);
  saveState();
  renderCables();
  selectItem('cable', cable.id);
}

function removeCable(id) {
  state.cables = state.cables.filter(c => c.id !== id);
  if (state.selected?.id === id) state.selected = null;
  saveState();
  renderCables();
  updatePropsPanel();
}

function updateCable(id, patch) {
  const c = state.cables.find(c => c.id === id);
  if (!c) return;
  Object.assign(c, patch);
  saveState();
  renderCables();
}

// ── PROPERTIES PANEL ────────────────────────────────────────────────────────
function updatePropsPanel() {
  propsContent.innerHTML = '';

  if (!state.selected) {
    propsEmpty.style.display = 'flex';
    return;
  }
  propsEmpty.style.display = 'none';

  if (state.selected.kind === 'device') {
    buildDeviceProps(state.selected.id);
  } else {
    buildCableProps(state.selected.id);
  }
}

function buildDeviceProps(id) {
  const d = state.devices.find(d => d.id === id);
  if (!d) return;
  const def = DEVICE_TYPES[d.type];

  propsContent.innerHTML = `
    <div class="prop-group">
      <label class="prop-label">Name</label>
      <input class="prop-input" id="prop-name" type="text" value="${esc(d.name)}">
    </div>
    <div class="prop-group">
      <label class="prop-label">Type</label>
      <select class="prop-input" id="prop-type">
        ${Object.entries(DEVICE_TYPES).map(([k,v]) => `<option value="${k}" ${k===d.type?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
    </div>
    <div class="prop-group">
      <label class="prop-label">Color</label>
      <div class="color-row">
        <div class="color-swatch"><input type="color" id="prop-color" value="${d.color}"></div>
        <span style="font-size:11px;color:var(--text-dim)">${d.color}</span>
      </div>
    </div>
    <button class="prop-delete-btn" id="prop-delete">Delete Device</button>`;

  document.getElementById('prop-name').addEventListener('input', e => updateDevice(id, { name: e.target.value }));
  document.getElementById('prop-type').addEventListener('change', e => updateDevice(id, { type: e.target.value }));
  document.getElementById('prop-color').addEventListener('input', e => {
    updateDevice(id, { color: e.target.value });
    e.target.parentElement.nextElementSibling.textContent = e.target.value;
  });
  document.getElementById('prop-delete').addEventListener('click', () => removeDevice(id));
}

function buildCableProps(id) {
  const c = state.cables.find(c => c.id === id);
  if (!c) return;
  const fromName = state.devices.find(d => d.id === c.fromId)?.name ?? '?';
  const toName   = state.devices.find(d => d.id === c.toId)?.name ?? '?';

  propsContent.innerHTML = `
    <div class="prop-group">
      <label class="prop-label">Connection</label>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.5">${esc(fromName)} → ${esc(toName)}</div>
    </div>
    <div class="prop-group">
      <label class="prop-label">Cable Type</label>
      <select class="prop-input" id="prop-ctype">
        ${Object.keys(CABLE_TYPES).map(k => `<option value="${k}" ${k===c.cableType?'selected':''}>${k}</option>`).join('')}
      </select>
    </div>
    <div class="prop-group">
      <label class="prop-label">Direction</label>
      <select class="prop-input" id="prop-dir">
        <option value="to"   ${(c.direction??'to')==='to'  ?'selected':''}>→ To destination</option>
        <option value="from" ${c.direction==='from'         ?'selected':''}>← From destination</option>
        <option value="both" ${c.direction==='both'         ?'selected':''}>↔ Both directions</option>
        <option value="none" ${c.direction==='none'         ?'selected':''}>— No arrow</option>
      </select>
    </div>
    <div class="prop-group">
      <label class="prop-label">Custom Label</label>
      <input class="prop-input" id="prop-clabel" type="text" placeholder="e.g. Ch1, 4K@60" value="${esc(c.label)}">
    </div>
    <button class="prop-delete-btn" id="prop-delete">Delete Cable</button>`;

  document.getElementById('prop-ctype').addEventListener('change', e => updateCable(id, { cableType: e.target.value }));
  document.getElementById('prop-dir').addEventListener('change',   e => updateCable(id, { direction: e.target.value }));
  document.getElementById('prop-clabel').addEventListener('input', e => updateCable(id, { label: e.target.value }));
  document.getElementById('prop-delete').addEventListener('click', () => removeCable(id));
}

// ── DEVICE DRAG ──────────────────────────────────────────────────────────────
function bindDeviceCard(el, id) {
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (state.mode === 'cable') {
      e.stopPropagation();
      handleCableClick(id);
      return;
    }
    e.stopPropagation();
    const d = state.devices.find(d => d.id === id);
    if (!d) return;
    selectItem('device', id);
    const rect = canvasWrap.getBoundingClientRect();
    state.dragging = {
      id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: d.x,
      origY: d.y,
    };
  });
}

// ── TRANSFORM ────────────────────────────────────────────────────────────────
function renderTransform() {
  canvasInner.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

// ── CANVAS BINDINGS ──────────────────────────────────────────────────────────
function bindCanvas() {
  // Mousedown on empty canvas → start pan
  canvasWrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const onEmpty = e.target === canvasWrap || e.target === canvasInner || e.target === svgLayer;
    if (!onEmpty || state.mode === 'cable') return;
    state.panning = true;
    state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    canvasWrap.style.cursor = 'grabbing';
    e.preventDefault();
  });

  // Click on empty canvas → deselect (only if not a pan drag)
  canvasWrap.addEventListener('click', e => {
    if (state.panning) return;
    if (e.target === canvasWrap || e.target === canvasInner || e.target === svgLayer) {
      if (state.mode !== 'cable') clearSelection();
    }
  });

  document.addEventListener('mousemove', e => {
    if (state.panning) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      renderTransform();
    }
    if (state.draggingWaypoint) {
      const { cableId, index } = state.draggingWaypoint;
      const c = state.cables.find(c => c.id === cableId);
      if (c) {
        const rawX = state.draggingWaypoint.origX + (e.clientX - state.draggingWaypoint.startMouseX) / state.zoom;
        const rawY = state.draggingWaypoint.origY + (e.clientY - state.draggingWaypoint.startMouseY) / state.zoom;
        c.waypoints[index] = { x: snap(rawX), y: snap(rawY) };
        renderCables();
      }
    }
    if (state.dragging) {
      const d = state.devices.find(d => d.id === state.dragging.id);
      if (!d) return;
      d.x = state.dragging.origX + (e.clientX - state.dragging.startMouseX) / state.zoom;
      d.y = state.dragging.origY + (e.clientY - state.dragging.startMouseY) / state.zoom;
      renderAll();
    }
  });

  document.addEventListener('mouseup', () => {
    if (state.panning) {
      state.panning = false;
      canvasWrap.style.cursor = '';
    }
    if (state.draggingWaypoint) { saveState(); state.draggingWaypoint = null; }
    if (state.dragging) { saveState(); state.dragging = null; }
  });

  // Scroll to zoom toward cursor
  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(4, Math.max(0.15, state.zoom * factor));
    const worldX = (mouseX - state.pan.x) / state.zoom;
    const worldY = (mouseY - state.pan.y) / state.zoom;
    state.pan.x = mouseX - worldX * newZoom;
    state.pan.y = mouseY - worldY * newZoom;
    state.zoom = newZoom;
    renderTransform();
  }, { passive: false });

  // Palette drag-to-canvas
  canvasWrap.addEventListener('dragover', e => e.preventDefault());
  canvasWrap.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('deviceType');
    if (!type) return;
    const rect = canvasWrap.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
    const y = (e.clientY - rect.top  - state.pan.y) / state.zoom;
    addDevice(type, Math.round(x - 55), Math.round(y - 40));
  });
}

// ── PALETTE ──────────────────────────────────────────────────────────────────
function bindPalette() {
  document.querySelectorAll('.palette-item[data-type]').forEach(el => {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', e => e.dataTransfer.setData('deviceType', el.dataset.type));
    el.addEventListener('click', () => {
      const cx = (canvasWrap.clientWidth  / 2 - state.pan.x) / state.zoom - 55;
      const cy = (canvasWrap.clientHeight / 2 - state.pan.y) / state.zoom - 40;
      addDevice(el.dataset.type, Math.round(cx), Math.round(cy));
    });
  });
}

// ── TOOLBAR ───────────────────────────────────────────────────────────────────
function bindToolbar() {
  document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
  document.getElementById('btn-cable').addEventListener('click',  () => setMode('cable'));

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (!state.selected) return;
    if (state.selected.kind === 'device') removeDevice(state.selected.id);
    else removeCable(state.selected.id);
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset to default layout? This will remove all your cables and custom positions.')) return;
    state = { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), mode: 'select', selected: null, cableSource: null, pan: {x:0,y:0}, zoom: 1, dragging: null };
    saveState();
    renderAll();
    updatePropsPanel();
    state.pan = { x: 0, y: 0 };
    renderTransform();
    showToast('Reset to default layout');
  });

  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-input').click());
  document.getElementById('import-input').addEventListener('change', importJSON);
  document.getElementById('btn-zoom-in').addEventListener('click',  () => adjustZoom(1.2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => adjustZoom(0.8));
  document.getElementById('btn-zoom-fit').addEventListener('click', fitView);
}

function adjustZoom(factor) {
  const cx = canvasWrap.clientWidth  / 2;
  const cy = canvasWrap.clientHeight / 2;
  const newZoom = Math.min(4, Math.max(0.15, state.zoom * factor));
  const worldX = (cx - state.pan.x) / state.zoom;
  const worldY = (cy - state.pan.y) / state.zoom;
  state.pan.x = cx - worldX * newZoom;
  state.pan.y = cy - worldY * newZoom;
  state.zoom = newZoom;
  renderTransform();
}

function fitView() {
  if (!state.devices.length) return;
  const xs = state.devices.map(d => d.x);
  const ys = state.devices.map(d => d.y);
  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 180;
  const maxY = Math.max(...ys) + 120;
  const w = maxX - minX;
  const h = maxY - minY;
  const zx = canvasWrap.clientWidth  / w;
  const zy = canvasWrap.clientHeight / h;
  state.zoom = Math.min(4, Math.max(0.15, Math.min(zx, zy) * 0.9));
  state.pan.x = (canvasWrap.clientWidth  - w * state.zoom) / 2 - minX * state.zoom;
  state.pan.y = (canvasWrap.clientHeight - h * state.zoom) / 2 - minY * state.zoom;
  renderTransform();
}

// ── KEYBOARD ─────────────────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      if (state.selected.kind === 'device') removeDevice(state.selected.id);
      else removeCable(state.selected.id);
    }
    if (e.key === 'Escape') {
      if (state.mode === 'cable') { state.cableSource = null; setMode('select'); }
      else clearSelection();
    }
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey) setMode('cable');
    if (e.key === 's' && !e.metaKey && !e.ctrlKey) setMode('select');
  });
}

// ── CABLE MODAL ───────────────────────────────────────────────────────────────
let pendingCable = null;

function openCableModal(fromId, toId) {
  pendingCable = { fromId, toId };
  const fromName = state.devices.find(d => d.id === fromId)?.name ?? '?';
  const toName   = state.devices.find(d => d.id === toId)?.name ?? '?';
  document.getElementById('modal-conn-label').textContent = `${fromName} → ${toName}`;
  modalOverlay.classList.add('open');
  document.getElementById('modal-cable-type').focus();
}

function bindModal() {
  document.getElementById('modal-confirm').addEventListener('click', () => {
    if (!pendingCable) return;
    const cableType = document.getElementById('modal-cable-type').value;
    const label     = document.getElementById('modal-cable-label').value.trim();
    addCable(pendingCable.fromId, pendingCable.toId, cableType, label);
    modalOverlay.classList.remove('open');
    document.getElementById('modal-cable-label').value = '';
    pendingCable = null;
  });
  document.getElementById('modal-cancel').addEventListener('click', () => {
    modalOverlay.classList.remove('open');
    pendingCable = null;
  });
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) { modalOverlay.classList.remove('open'); pendingCable = null; } });
}

// ── PERSIST ───────────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('kvm-vis-state', JSON.stringify({ nextId: state.nextId, devices: state.devices, cables: state.cables }));
  } catch(_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('kvm-vis-state');
    if (raw) {
      const saved = JSON.parse(raw);
      state.nextId  = saved.nextId  ?? 1;
      state.devices = saved.devices ?? [];
      state.cables  = saved.cables  ?? [];
      return;
    }
  } catch(_) {}
  // First run: load default
  state.nextId  = DEFAULT_STATE.nextId;
  state.devices = JSON.parse(JSON.stringify(DEFAULT_STATE.devices));
  state.cables  = JSON.parse(JSON.stringify(DEFAULT_STATE.cables));
}

// ── EXPORT / IMPORT ───────────────────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify({ nextId: state.nextId, devices: state.devices, cables: state.cables }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kvm-setup-${String(Date.now()).slice(-4)}.json`;
  a.click();
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      state.nextId  = data.nextId  ?? 1;
      state.devices = data.devices ?? [];
      state.cables  = data.cables  ?? [];
      saveState();
      renderAll();
      updatePropsPanel();
      showToast('Layout imported');
    } catch(_) { showToast('Failed to import — invalid JSON'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

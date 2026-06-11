'use strict';

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const DEVICE_DEFAULTS = {
  pc:         { w: 20, d: 45, h: 45, label: 'PC / Laptop',    color: '#6366f1' },
  kvm:        { w: 20, d: 12, h: 4,  label: 'KVM Switch',     color: '#7c3aed' },
  monitor:    { w: 60, d: 20, h: 40, label: 'Monitor',        color: '#0891b2' },
  usb_hub:    { w: 12, d: 6,  h: 3,  label: 'USB Hub',        color: '#d97706' },
  usb_device: { w: 10, d: 5,  h: 2,  label: 'USB Device',     color: '#16a34a' },
  audio:      { w: 20, d: 15, h: 25, label: 'Audio Device',   color: '#db2777' },
  network:    { w: 30, d: 10, h: 4,  label: 'Network Switch', color: '#2563eb' },
  other:      { w: 15, d: 10, h: 5,  label: 'Other Device',   color: '#6b7280' },
};

const DESK_Y  = 3;   // desk surface world-y
const SNAP_CM = 2;

// ── STATE ────────────────────────────────────────────────────────────────────

const state = {
  mode: 'setup',
  desk: { main_w: 140, main_d: 60, ext_w: 80, ext_d: 120, ext_side: 'right' },
  devices: [],   // { id,type,name,color,x,z,w,d,h, mesh,labelObj,edgesMesh }
  cables: [],    // { id,fromId,toId,cableType,label,direction }
  selected: null,
  selectedWP: null,
  rawData: null,
};

// ── THREE GLOBALS ────────────────────────────────────────────────────────────

let renderer, labelRenderer, scene;
let orthoCamera, perspCamera, currentCamera;
let orbitControls;
let deviceGroup, cableGroup, deskGroup, floorGroup;
let raycaster, mouse, deskPlane;
let dragDev = null, dragOff = { x: 0, z: 0 };
let dragWP  = null; // { cableId, wpIndex, y }

// ── DESK HELPERS ─────────────────────────────────────────────────────────────

function bounds() {
  const { main_w, main_d, ext_w, ext_d, ext_side } = state.desk;
  const mX0 = ext_side === 'right' ? 0 : ext_w;
  const eX0 = ext_side === 'right' ? main_w : 0;
  return {
    mX0, mX1: mX0 + main_w, mZ1: main_d,
    eX0, eX1: eX0 + ext_w,  eZ1: ext_d,
    totalW: main_w + ext_w,
    totalD: Math.max(main_d, ext_d),
    cx: (main_w + ext_w) / 2,
    cz: Math.max(main_d, ext_d) / 2,
  };
}

function isOnDesk(x, z, w, d) {
  w = w || 0; d = d || 0;
  const b = bounds();
  const inMain = x + w > b.mX0 && x < b.mX1 && z + d > 0 && z < b.mZ1;
  const inExt  = x + w > b.eX0 && x < b.eX1 && z + d > 0 && z < b.eZ1;
  return inMain || inExt;
}

function snap(v) { return Math.round(v / SNAP_CM) * SNAP_CM; }

function computeFloorY() {
  let minBase = 0; // desk bottom is at Y=0
  state.devices.forEach(dev => {
    const base = DESK_Y + (dev.elevation || 0);
    if (base < minBase) minBase = base;
  });
  return minBase - 1;
}

function clampPos(dev, nx, nz) {
  const b = bounds();
  nx = Math.max(0, Math.min(b.totalW - dev.w, snap(nx)));
  nz = Math.max(0, Math.min(b.totalD - dev.d, snap(nz)));
  if (isOnDesk(nx, nz, dev.w, dev.d)) return { x: nx, z: nz };
  const mx = Math.max(b.mX0, Math.min(b.mX1 - dev.w, nx));
  const mz = Math.max(0, Math.min(b.mZ1 - dev.d, nz));
  if (isOnDesk(mx, mz, dev.w, dev.d)) return { x: mx, z: mz };
  const ex = Math.max(b.eX0, Math.min(b.eX1 - dev.w, nx));
  const ez = Math.max(0, Math.min(b.eZ1 - dev.d, nz));
  if (isOnDesk(ex, ez, dev.w, dev.d)) return { x: ex, z: ez };
  return { x: dev.x, z: dev.z };
}

function devSection(dev) {
  const { main_w, ext_w, ext_side } = state.desk;
  const cx = dev.x + dev.w / 2;
  return (ext_side === 'right') ? (cx < main_w ? 'main' : 'ext') : (cx < ext_w ? 'ext' : 'main');
}

// ── GRID HELPER (rectangular) ────────────────────────────────────────────────

function makeRectGrid(w, d, cell, col) {
  const pts = [];
  for (let x = 0; x <= w + 0.01; x += cell) { pts.push(x,0,0, x,0,d); }
  for (let z = 0; z <= d + 0.01; z += cell) { pts.push(0,0,z, w,0,z); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col }));
}

// ── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  // Restore saved desk config
  let hasSavedDesk = false;
  try {
    const s = JSON.parse(localStorage.getItem('kvm-3d-state') || '{}');
    if (s.desk) {
      Object.assign(state.desk, s.desk);
      document.getElementById('setup-main-w').value   = state.desk.main_w;
      document.getElementById('setup-main-d').value   = state.desk.main_d;
      document.getElementById('setup-ext-w').value    = state.desk.ext_w;
      document.getElementById('setup-ext-d').value    = state.desk.ext_d;
      document.getElementById('setup-ext-side').value = state.desk.ext_side;
      hasSavedDesk = true;
    }
  } catch(_) {}

  const raw = localStorage.getItem('kvm-vis-state');
  if (raw) {
    try {
      state.rawData = JSON.parse(raw);
      const n = (state.rawData.devices || []).length;
      document.getElementById('setup-data-info').textContent =
        `✓ Loaded ${n} device${n !== 1 ? 's' : ''} from 2D tool`;
    } catch(e) {
      showImportFallback();
    }
  } else {
    showImportFallback();
  }

  document.getElementById('btn-back').onclick = () => { window.location.href = 'index.html'; };
  document.getElementById('btn-desk').onclick = openSetupModal;
  document.getElementById('btn-to3d').onclick = switchTo3D;
  document.getElementById('btn-tolayout').onclick = switchToLayout;
  document.getElementById('btn-route').onclick = routeCables;
  document.getElementById('btn-clearcables').onclick = clearCables;
  document.getElementById('btn-labels').onclick = toggleLabels;
  document.getElementById('btn-start').onclick = onStart;
  document.getElementById('btn-import-json').onclick = () => document.getElementById('import-input').click();
  document.getElementById('import-input').onchange = onImport;

  // Live desk preview
  ['setup-main-w','setup-main-d','setup-ext-w','setup-ext-d','setup-ext-side'].forEach(id => {
    document.getElementById(id).addEventListener('input', drawDeskPreview);
  });
  drawDeskPreview();

  if (hasSavedDesk) {
    document.getElementById('modal-overlay').classList.remove('open');
    initThree();
    rebuildDesk();
    if (state.rawData) loadDevices(state.rawData);
    switchToLayout();
  }
}

function showImportFallback() {
  document.getElementById('setup-data-info').textContent = 'No 2D tool data found.';
  document.getElementById('btn-import-json').style.display = 'block';
}

function openSetupModal() {
  const d = state.desk;
  document.getElementById('setup-main-w').value = d.main_w;
  document.getElementById('setup-main-d').value = d.main_d;
  document.getElementById('setup-ext-w').value  = d.ext_w;
  document.getElementById('setup-ext-d').value  = d.ext_d;
  document.getElementById('setup-ext-side').value = d.ext_side;
  document.getElementById('modal-overlay').classList.add('open');
}

function onStart() {
  state.desk.main_w   = Math.max(20, parseInt(document.getElementById('setup-main-w').value) || 140);
  state.desk.main_d   = Math.max(20, parseInt(document.getElementById('setup-main-d').value) || 60);
  state.desk.ext_w    = Math.max(0,  parseInt(document.getElementById('setup-ext-w').value)  || 80);
  state.desk.ext_d    = Math.max(0,  parseInt(document.getElementById('setup-ext-d').value)  || 120);
  state.desk.ext_side = document.getElementById('setup-ext-side').value;
  document.getElementById('modal-overlay').classList.remove('open');

  if (!renderer) initThree();

  rebuildDesk();
  if (state.rawData) loadDevices(state.rawData);
  switchToLayout();
}

function onImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      state.rawData = JSON.parse(ev.target.result);
      const n = (state.rawData.devices || []).length;
      document.getElementById('setup-data-info').textContent =
        `✓ Loaded ${n} device${n !== 1 ? 's' : ''} from file`;
    } catch(_) { toast('Invalid JSON'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── THREE.JS SETUP ────────────────────────────────────────────────────────────

function initThree() {
  const wrap = document.getElementById('canvas3d');
  const W = wrap.clientWidth, H = wrap.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(W, H);
  renderer.setClearColor(0x0f1117);
  wrap.appendChild(renderer.domElement);

  labelRenderer = new THREE.CSS2DRenderer();
  labelRenderer.setSize(W, H);
  Object.assign(labelRenderer.domElement.style,
    { position:'absolute', top:'0', left:'0', pointerEvents:'none' });
  wrap.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1117);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(60, 120, 60);
  scene.add(dir);

  deskGroup   = new THREE.Group(); scene.add(deskGroup);
  deviceGroup = new THREE.Group(); scene.add(deviceGroup);
  cableGroup  = new THREE.Group(); scene.add(cableGroup);
  floorGroup  = new THREE.Group(); scene.add(floorGroup);

  raycaster = new THREE.Raycaster();
  mouse     = new THREE.Vector2();
  deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);

  buildCameras(W, H);

  renderer.domElement.addEventListener('pointerdown', onMD);
  renderer.domElement.addEventListener('pointermove', onMM);
  renderer.domElement.addEventListener('pointerup',   onMU);
  renderer.domElement.addEventListener('dblclick',    onDblClick);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedWP) {
      const { cableId, wpIndex } = state.selectedWP;
      const cable = state.cables.find(c => c.id === cableId);
      if (cable && cable.userWaypoints) {
        cable.userWaypoints.splice(wpIndex, 1);
        rerouteSingleCable(cable);
        save3d();
      }
      state.selectedWP = null;
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && state.selected !== null) {
      const dev = state.devices.find(d => d.id === state.selected);
      if (!dev) return;
      dev.rotation = ((dev.rotation || 0) + 90) % 360;
      makeMesh(dev);
      highlightDev(dev.id);
      showProps(dev);
      save3d();
    }
  });

  (function loop() {
    requestAnimationFrame(loop);
    if (orbitControls && state.mode === '3d') orbitControls.update();
    renderer.render(scene, currentCamera);
    labelRenderer.render(scene, currentCamera);
  })();
}

function buildCameras(W, H) {
  const b = bounds();
  const asp = W / H;

  let hW = b.totalW / 2 * 1.25, hH = b.totalD / 2 * 1.25;
  if (hW / hH > asp) hH = hW / asp; else hW = hH * asp;
  orthoCamera = new THREE.OrthographicCamera(-hW, hW, hH, -hH, 0.1, 2000);
  orthoCamera.position.set(b.cx, 500, b.cz);
  orthoCamera.up.set(0, 0, -1);
  orthoCamera.lookAt(new THREE.Vector3(b.cx, 0, b.cz));

  perspCamera = new THREE.PerspectiveCamera(50, asp, 0.1, 5000);
  perspCamera.position.set(b.cx, b.totalD * 1.3, b.totalD * 2.0);
  perspCamera.lookAt(new THREE.Vector3(b.cx, DESK_Y, b.cz));

  currentCamera = orthoCamera;
}

// ── DESK ─────────────────────────────────────────────────────────────────────

function rebuildDesk() {
  while (deskGroup.children.length) {
    const c = deskGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    deskGroup.remove(c);
  }

  const { main_w, main_d, ext_w, ext_d } = state.desk;
  const b = bounds();
  function addSlab(w, d, cx, cz) {
    const geo = new THREE.BoxGeometry(w, DESK_Y, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
    mesh.position.set(cx, DESK_Y / 2, cz);
    deskGroup.add(mesh);
    const eg = new THREE.EdgesGeometry(geo);
    const el = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x5a3a1a }));
    el.position.copy(mesh.position);
    deskGroup.add(el);

    const grid = makeRectGrid(w, d, 5, 0x2e3350);
    grid.position.set(cx - w / 2, DESK_Y + 0.05, cz - d / 2);
    deskGroup.add(grid);
  }

  addSlab(main_w, main_d, b.mX0 + main_w / 2, main_d / 2);
  if (ext_w > 0 && ext_d > 0) {
    addSlab(ext_w, ext_d, b.eX0 + ext_w / 2, ext_d / 2);
  }

  addDimLabels();
  buildCameras(
    document.getElementById('canvas3d').clientWidth,
    document.getElementById('canvas3d').clientHeight
  );
}

function addDimLabels() {
  const { main_w, main_d, ext_w, ext_d, ext_side } = state.desk;
  const b = bounds();
  const Y = DESK_Y + 0.5;

  function label(text, wx, wz) {
    const div = document.createElement('div');
    div.className = 'dim-label';
    div.textContent = text;
    const o = new THREE.CSS2DObject(div);
    o.position.set(wx, Y, wz);
    deskGroup.add(o);
  }

  // Main: width arrow below front edge, depth arrow on outer side
  label(`↔ ${main_w} cm`, b.mX0 + main_w / 2, main_d + 7);
  label(`↕ ${main_d} cm`, b.mX0 - 7, main_d / 2);

  if (ext_w > 0 && ext_d > 0) {
    // Extension: width below its front edge
    label(`↔ ${ext_w} cm`, b.eX0 + ext_w / 2, ext_d + 7);
    // Depth on the outer side (away from main)
    const depthX = ext_side === 'right' ? b.eX1 + 7 : b.eX0 - 7;
    label(`↕ ${ext_d} cm`, depthX, ext_d / 2);
  }
}

function rebuildFloor() {
  if (!floorGroup) return;
  while (floorGroup.children.length) {
    const c = floorGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    floorGroup.remove(c);
  }
  if (!state.devices.length) return;

  const b   = bounds();
  const fy  = computeFloorY();
  const PAD = 80;
  const fw  = b.totalW + PAD * 2;
  const fd  = b.totalD + PAD * 2;

  const geo  = new THREE.BoxGeometry(fw, 0.5, fd);
  const mat  = new THREE.MeshLambertMaterial({ color: 0x141720 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(b.totalW / 2, fy - 0.25, b.totalD / 2);
  floorGroup.add(mesh);

  const el = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x1e2235 })
  );
  el.position.copy(mesh.position);
  floorGroup.add(el);

  const grid = makeRectGrid(fw, fd, 20, 0x181c2a);
  grid.position.set(-PAD, fy + 0.3, -PAD);
  floorGroup.add(grid);
}

// ── LOAD DEVICES ─────────────────────────────────────────────────────────────

function loadDevices(data) {
  while (deviceGroup.children.length) {
    const c = deviceGroup.children[0];
    c.traverse(obj => {
      if (obj.isCSS2DObject && obj.element.parentNode) obj.element.parentNode.removeChild(obj.element);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    deviceGroup.remove(c);
  }
  state.devices = [];
  state.cables = (data.cables || []).map(c => ({ ...c }));

  // Restore saved port offsets
  try {
    const s = JSON.parse(localStorage.getItem('kvm-3d-state') || '{}');
    const savedPorts = {};
    (s.cables3d || []).forEach(c => { savedPorts[c.id] = c; });
    state.cables.forEach(c => {
      const sv = savedPorts[c.id];
      c.portOffA      = sv ? (sv.portOffA      || 0)   : 0;
      c.portHtA       = sv ? (sv.portHtA       ?? null) : null;
      c.portFaceA     = sv ? (sv.portFaceA     || null) : null;
      c.portOffB      = sv ? (sv.portOffB      || 0)   : 0;
      c.portHtB       = sv ? (sv.portHtB       ?? null) : null;
      c.portFaceB     = sv ? (sv.portFaceB     || null) : null;
      c.userWaypoints = sv ? (sv.userWaypoints || [])   : [];
    });
  } catch(_) {}

  const devs2d = data.devices || [];
  if (!devs2d.length) return;

  // Saved 3D positions
  let saved = {};
  try {
    const s = JSON.parse(localStorage.getItem('kvm-3d-state') || '{}');
    (s.devices3d || []).forEach(d => { saved[d.id] = d; });
  } catch(_) {}

  const b = bounds();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  devs2d.forEach(d => {
    minX = Math.min(minX, d.x || 0); minY = Math.min(minY, d.y || 0);
    maxX = Math.max(maxX, d.x || 0); maxY = Math.max(maxY, d.y || 0);
  });
  const rX = Math.max(maxX - minX, 1), rY = Math.max(maxY - minY, 1);
  const PAD = 8;

  devs2d.forEach(d => {
    const def = DEVICE_DEFAULTS[d.type] || DEVICE_DEFAULTS.other;
    const sv = saved[d.id];
    const normX = ((d.x || 0) - minX) / rX;
    const normY = ((d.y || 0) - minY) / rY;
    const nx = sv ? sv.x : snap(b.mX0 + PAD + normX * Math.max(0, b.mX1 - b.mX0 - PAD * 2 - def.w));
    const nz = sv ? sv.z : snap(PAD + normY * Math.max(0, b.mZ1 - PAD * 2 - def.d));
    const dev = {
      id: d.id,
      type: d.type || 'other',
      name: sv ? sv.name : (d.name || def.label),
      color: d.color || def.color,
      x: sv ? sv.x : Math.max(0, nx),
      z: sv ? sv.z : Math.max(0, nz),
      w:         sv ? sv.w         : def.w,
      d:         sv ? sv.d         : def.d,
      h:         sv ? sv.h         : def.h,
      elevation: sv ? (sv.elevation || 0) : 0,
      rotation:  sv ? (sv.rotation  || 0) : 0,
    };
    state.devices.push(dev);
    makeMesh(dev);
  });
  rebuildFloor();
}

// ── DEVICE MESH ──────────────────────────────────────────────────────────────

function makeMesh(dev) {
  if (dev.mesh) {
    dev.mesh.traverse(obj => {
      if (obj.isCSS2DObject && obj.element.parentNode) obj.element.parentNode.removeChild(obj.element);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    deviceGroup.remove(dev.mesh);
    dev.mesh = null;
  }

  const isLayout = state.mode !== '3d';
  const mh = isLayout ? 1 : dev.h;
  const posY = isLayout ? DESK_Y + 0.5 : DESK_Y + (dev.elevation || 0) + mh / 2;

  const geo = new THREE.BoxGeometry(dev.w, mh, dev.d);
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(dev.color) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(dev.x + dev.w / 2, posY, dev.z + dev.d / 2);

  const eg = new THREE.EdgesGeometry(geo);
  const el = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
  mesh.add(el);
  dev.edgesMesh = el;

  const div = document.createElement('div');
  div.className = 'device-label';
  div.textContent = dev.name;
  const lobj = new THREE.CSS2DObject(div);
  lobj.position.set(0, mh / 2 + 4, 0);
  mesh.add(lobj);
  dev.labelObj = lobj;

  mesh.rotation.y = -(dev.rotation || 0) * Math.PI / 180;

  deviceGroup.add(mesh);
  dev.mesh = mesh;
}

function rebuildMeshes() {
  state.devices.forEach(dev => makeMesh(dev));
}

function highlightDev(id) {
  state.devices.forEach(dev => {
    if (!dev.edgesMesh) return;
    const sel = dev.id === id;
    dev.edgesMesh.material.color.set(sel ? 0x6366f1 : 0xffffff);
    dev.edgesMesh.material.opacity = sel ? 0.9 : 0.25;
  });
}

// ── MOUSE EVENTS ─────────────────────────────────────────────────────────────

function ndcFromEvent(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
  mouse.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
}

function rayPlane(e) {
  ndcFromEvent(e);
  raycaster.setFromCamera(mouse, currentCamera);
  const pt = new THREE.Vector3();
  return raycaster.ray.intersectPlane(deskPlane, pt) ? pt : null;
}

function pickDev(e) {
  ndcFromEvent(e);
  raycaster.setFromCamera(mouse, currentCamera);
  const meshes = state.devices.filter(d => d.mesh).map(d => d.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let m = hits[0].object;
  while (m.parent && m.parent !== deviceGroup) m = m.parent;
  return state.devices.find(d => d.mesh === m) || null;
}

function onMD(e) {
  if (e.button !== 0) return;

  // Port markers take priority in 3D mode (they sit on device faces — check before device pick)
  if (state.mode === '3d' && cableGroup.children.length) {
    const portMesh = pickPort(e);
    if (portMesh) {
      const ud = portMesh.userData;
      const dev = state.devices.find(d => d.id === ud.devId);
      if (dev) {
        dragPort = {
          cableId:     ud.cableId,
          isFromPort:  ud.isFromPort,
          devId:       ud.devId,
          faceNX:      ud.nx,
          faceNZ:      ud.nz,
          facePortX:   ud.faceX,
          facePortZ:   ud.faceZ,
          worldAlongX: ud.worldAlongX,
          worldAlongZ: ud.worldAlongZ,
          halfExt:     ud.halfExt,
        };
        if (orbitControls) orbitControls.enabled = false;
        e.stopImmediatePropagation();
      }
      return;
    }

    // Waypoint markers
    const wpMesh = pickWaypoint(e);
    if (wpMesh) {
      const ud = wpMesh.userData;
      state.selectedWP = { cableId: ud.cableId, wpIndex: ud.wpIndex };
      dragWP = { cableId: ud.cableId, wpIndex: ud.wpIndex, y: wpMesh.position.y };
      if (orbitControls) orbitControls.enabled = false;
      e.stopImmediatePropagation();
      return;
    }
  }

  const dev = pickDev(e);
  if (dev) {
    state.selected = dev.id;
    highlightDev(dev.id);
    showProps(dev);
    if (state.mode === 'layout') {
      const pt = rayPlane(e);
      if (pt) {
        dragDev = dev;
        dragOff.x = pt.x - (dev.x + dev.w / 2);
        dragOff.z = pt.z - (dev.z + dev.d / 2);
      }
    }
  } else if (state.mode === 'layout') {
    state.selected = null;
    highlightDev(null);
    clearProps();
  }
}

function onMM(e) {
  if (dragWP) {
    ndcFromEvent(e);
    raycaster.setFromCamera(mouse, currentCamera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -dragWP.y);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) {
      const cable = state.cables.find(c => c.id === dragWP.cableId);
      if (cable && cable.userWaypoints) {
        cable.userWaypoints[dragWP.wpIndex] = { x: pt.x, y: dragWP.y, z: pt.z };
        rerouteSingleCable(cable);
      }
    }
    return;
  }

  if (dragPort) {
    ndcFromEvent(e);
    raycaster.setFromCamera(mouse, currentCamera);
    // Face plane defined by the world-space face normal (works for any rotation)
    const planeNorm = new THREE.Vector3(dragPort.faceNX, 0, dragPort.faceNZ).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNorm,
      new THREE.Vector3(dragPort.facePortX, 0, dragPort.facePortZ)
    );
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) {
      const dev   = state.devices.find(d => d.id === dragPort.devId);
      const cable = state.cables.find(c => c.id === dragPort.cableId);
      if (dev && cable) {
        // Project world-space delta onto the face tangent to get local faceOff
        const cx = dev.x + dev.w / 2, cz = dev.z + dev.d / 2;
        const rawAlong = (pt.x - cx) * dragPort.worldAlongX + (pt.z - cz) * dragPort.worldAlongZ;
        const along = Math.max(-dragPort.halfExt, Math.min(dragPort.halfExt, rawAlong));
        // Vertical: height above device base
        const baseY = DESK_Y + (dev.elevation || 0);
        const ht = Math.max(0.5, Math.min(dev.h - 0.5, pt.y - baseY));
        if (dragPort.isFromPort) { cable.portOffA = along; cable.portHtA = ht; }
        else                      { cable.portOffB = along; cable.portHtB = ht; }
        rerouteSingleCable(cable);
      }
    }
    return;
  }

  if (!dragDev) return;
  const pt = rayPlane(e);
  if (!pt) return;
  dragDev.x = snap(pt.x - dragOff.x - dragDev.w / 2);
  dragDev.z = snap(pt.z - dragOff.z - dragDev.d / 2);
  if (dragDev.mesh) dragDev.mesh.position.set(dragDev.x + dragDev.w / 2, dragDev.mesh.position.y, dragDev.z + dragDev.d / 2);
}

function onMU() {
  if (dragWP) {
    save3d();
    dragWP = null;
    if (orbitControls) orbitControls.enabled = true;
    return;
  }
  if (dragPort) {
    save3d();
    dragPort = null;
    if (orbitControls) orbitControls.enabled = true;
    return;
  }
  if (dragDev) { save3d(); dragDev = null; }
}

// ── MODES ────────────────────────────────────────────────────────────────────

function switchToLayout() {
  state.mode = 'layout';
  currentCamera = orthoCamera;
  if (orbitControls) orbitControls.enabled = false;
  clearCables();
  state.selected = null;
  state.selectedWP = null;
  dragWP = null;
  clearProps();
  rebuildMeshes();

  document.getElementById('btn-to3d').style.display = '';
  document.getElementById('btn-tolayout').style.display = 'none';
  document.getElementById('btn-route').style.display = 'none';
  document.getElementById('btn-clearcables').style.display = 'none';
  document.getElementById('btn-labels').style.display = 'none';
  document.getElementById('btn-desk').style.display = '';
}

function switchTo3D() {
  state.mode = '3d';
  currentCamera = perspCamera;

  if (!orbitControls) {
    orbitControls = new THREE.OrbitControls(perspCamera, renderer.domElement);
    const b = bounds();
    orbitControls.target.set(b.cx, DESK_Y, b.cz);
  }
  orbitControls.enabled = true;

  state.selected = null;
  clearProps();
  rebuildMeshes();

  document.getElementById('btn-to3d').style.display = 'none';
  document.getElementById('btn-tolayout').style.display = '';
  document.getElementById('btn-route').style.display = '';
  document.getElementById('btn-clearcables').style.display = '';
  document.getElementById('btn-labels').style.display = '';
  document.getElementById('btn-desk').style.display = 'none';
}

// ── PROPERTIES PANEL ─────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clearProps() {
  document.getElementById('props-empty').style.display = '';
  document.getElementById('props-content').innerHTML = '';
}

function showProps(dev) {
  document.getElementById('props-empty').style.display = 'none';
  const c = document.getElementById('props-content');
  const def = DEVICE_DEFAULTS[dev.type] || DEVICE_DEFAULTS.other;
  const elev = dev.elevation || 0;
  c.innerHTML = `
    <div class="prop-group">
      <label class="prop-label">Name</label>
      <input class="prop-input" id="pp-name" type="text" value="${esc(dev.name)}">
    </div>
    <div class="prop-type-badge">${esc(def.label)}</div>
    <div class="prop-divider"></div>
    <div class="prop-group">
      <label class="prop-label">Width (cm)</label>
      <input class="prop-input" id="pp-w" type="number" value="${dev.w}" min="2" max="300">
    </div>
    <div class="prop-group">
      <label class="prop-label">Depth (cm)</label>
      <input class="prop-input" id="pp-d" type="number" value="${dev.d}" min="2" max="300">
    </div>
    <div class="prop-group">
      <label class="prop-label">Height (cm)</label>
      <input class="prop-input" id="pp-h" type="number" value="${dev.h}" min="1" max="300">
    </div>
    <div class="prop-divider"></div>
    <div class="prop-group">
      <label class="prop-label">Elevation (cm above desk)</label>
      <input class="prop-input" id="pp-elev" type="number" value="${elev}" min="-200" max="200" step="1">
    </div>
    <div class="prop-group">
      <label class="prop-label">Rotation (°) &nbsp;<span style="color:var(--text-dim);font-size:9px">R = +90°</span></label>
      <div style="display:flex;gap:5px;align-items:center">
        <button class="btn" id="pp-rot-ccw" style="padding:4px 10px;flex-shrink:0">↺</button>
        <input class="prop-input" id="pp-rot" type="number" value="${dev.rotation||0}" min="-360" max="360" step="5">
        <button class="btn" id="pp-rot-cw" style="padding:4px 10px;flex-shrink:0">↻</button>
      </div>
    </div>
  `;

  document.getElementById('pp-name').addEventListener('change', e => {
    dev.name = e.target.value;
    if (dev.labelObj) dev.labelObj.element.textContent = dev.name;
    save3d();
  });
  ['w','d','h'].forEach(field => {
    document.getElementById('pp-'+field).addEventListener('change', e => {
      const v = Math.max(1, parseInt(e.target.value) || 1);
      dev[field] = v;
      e.target.value = v;
      makeMesh(dev);
      highlightDev(dev.id);
      save3d();
    });
  });
  document.getElementById('pp-elev').addEventListener('change', e => {
    dev.elevation = parseInt(e.target.value) || 0;
    makeMesh(dev);
    highlightDev(dev.id);
    rebuildFloor();
    save3d();
  });

  function applyRotation(deg) {
    dev.rotation = ((dev.rotation || 0) + deg + 3600) % 360;
    document.getElementById('pp-rot').value = dev.rotation;
    makeMesh(dev);
    highlightDev(dev.id);
    save3d();
  }
  document.getElementById('pp-rot').addEventListener('change', e => {
    dev.rotation = ((parseInt(e.target.value) || 0) + 3600) % 360;
    e.target.value = dev.rotation;
    makeMesh(dev);
    highlightDev(dev.id);
    save3d();
  });
  document.getElementById('pp-rot-ccw').addEventListener('click', () => applyRotation(-90));
  document.getElementById('pp-rot-cw').addEventListener('click',  () => applyRotation(+90));

  // Port-face selectors — only relevant in 3D when cables are routed
  if (state.mode === '3d' && cableGroup.children.length) {
    const conn = state.cables.filter(cc => cc.fromId === dev.id || cc.toId === dev.id);
    if (conn.length) {
      const pd = document.createElement('div');
      pd.innerHTML = `
        <div class="prop-divider"></div>
        <div class="prop-label" style="padding-bottom:4px">Port faces &nbsp;<span style="color:var(--text-dim);font-size:9px">drag tab to reposition</span></div>
        ${conn.map(cable => {
          const isFrom = cable.fromId === dev.id;
          const fv = (isFrom ? cable.portFaceA : cable.portFaceB) || '';
          const other = state.devices.find(d => d.id === (isFrom ? cable.toId : cable.fromId));
          return `<div class="prop-group">
            <label class="prop-label" style="font-size:9px">${esc(cable.cableType)} → ${esc(other ? other.name : '?')}</label>
            <select class="prop-input" data-pfcid="${cable.id}" data-pffrom="${isFrom}">
              <option value="">Auto</option>
              <option value="r"${fv==='r'?' selected':''}>Right</option>
              <option value="l"${fv==='l'?' selected':''}>Left</option>
              <option value="f"${fv==='f'?' selected':''}>Front</option>
              <option value="b"${fv==='b'?' selected':''}>Back</option>
            </select>
          </div>`;
        }).join('')}
      `;
      c.appendChild(pd);
      pd.querySelectorAll('[data-pfcid]').forEach(sel => {
        sel.addEventListener('change', ev => {
          const cid = parseInt(ev.target.dataset.pfcid);
          const isFrom = ev.target.dataset.pffrom === 'true';
          const cable = state.cables.find(cc => cc.id === cid);
          if (!cable) return;
          const fv = ev.target.value || null;
          if (isFrom) { cable.portFaceA = fv; cable.portOffA = 0; cable.portHtA = null; }
          else         { cable.portFaceB = fv; cable.portOffB = 0; cable.portHtB = null; }
          rerouteSingleCable(cable);
          save3d();
        });
      });

      // Under-desk waypoint controls
      const wpBlock = document.createElement('div');
      wpBlock.innerHTML = `<div class="prop-divider"></div><div class="prop-label" style="padding-bottom:4px">Under-desk waypoints <span style="color:var(--text-dim);font-size:9px">dbl-click cable to add</span></div>`;
      conn.forEach(cable => {
        const count = (cable.userWaypoints || []).length;
        const other = state.devices.find(d => d.id === (cable.fromId === dev.id ? cable.toId : cable.fromId));
        const row = document.createElement('div');
        row.className = 'prop-group';
        row.innerHTML = `<label class="prop-label" style="font-size:9px">${esc(cable.cableType)} → ${esc(other ? other.name : '?')}: ${count} wp(s)</label>
          <button class="btn" style="padding:3px 8px;font-size:9px" data-wpclear="${cable.id}">Clear</button>`;
        row.querySelector('button').addEventListener('click', () => {
          cable.userWaypoints = [];
          rerouteSingleCable(cable);
          showProps(dev);
          save3d();
        });
        wpBlock.appendChild(row);
      });
      c.appendChild(wpBlock);
    }
  }
}

// ── PERSISTENCE ──────────────────────────────────────────────────────────────

function save3d() {
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk:      { ...state.desk },
    devices3d: state.devices.map(d => ({ id:d.id, x:d.x, z:d.z, w:d.w, d:d.d, h:d.h, name:d.name, elevation:d.elevation||0, rotation:d.rotation||0 })),
    cables3d:  state.cables.map(c => ({ id:c.id, portOffA:c.portOffA||0, portHtA:c.portHtA??null, portFaceA:c.portFaceA||null, portOffB:c.portOffB||0, portHtB:c.portHtB??null, portFaceB:c.portFaceB||null, userWaypoints:c.userWaypoints||[] })),
  }));
}

// ── RESIZE ────────────────────────────────────────────────────────────────────

function onResize() {
  if (!renderer) return;
  const wrap = document.getElementById('canvas3d');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  renderer.setSize(W, H);
  labelRenderer.setSize(W, H);
  perspCamera.aspect = W / H;
  perspCamera.updateProjectionMatrix();
  const b = bounds();
  const asp = W / H;
  let hW = b.totalW/2*1.25, hH = b.totalD/2*1.25;
  if (hW/hH > asp) hH = hW/asp; else hW = hH*asp;
  orthoCamera.left = -hW; orthoCamera.right  =  hW;
  orthoCamera.top  =  hH; orthoCamera.bottom = -hH;
  orthoCamera.updateProjectionMatrix();
}

// ── TOAST ────────────────────────────────────────────────────────────────────

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── LABEL TOGGLE ─────────────────────────────────────────────────────────────

let labelsVisible = true;
function toggleLabels() {
  labelsVisible = !labelsVisible;
  state.devices.forEach(dev => {
    if (dev.labelObj) dev.labelObj.visible = labelsVisible;
  });
  deskGroup.traverse(obj => {
    if (obj.isCSS2DObject) obj.visible = labelsVisible;
  });
  document.getElementById('btn-labels').classList.toggle('active', labelsVisible);
}

// ── DESK PREVIEW (setup modal) ────────────────────────────────────────────────

function drawDeskPreview() {
  const cv = document.getElementById('desk-preview');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const CW = cv.width, CH = cv.height;
  ctx.clearRect(0, 0, CW, CH);

  const mw = Math.max(1, parseInt(document.getElementById('setup-main-w').value) || 140);
  const md = Math.max(1, parseInt(document.getElementById('setup-main-d').value) || 60);
  const ew = Math.max(0, parseInt(document.getElementById('setup-ext-w').value)  || 80);
  const ed = Math.max(0, parseInt(document.getElementById('setup-ext-d').value)  || 120);
  const side = document.getElementById('setup-ext-side').value;

  const totalW = mw + ew, totalD = Math.max(md, ed);
  const PAD = 30; // room for dimension labels
  const scale = Math.min((CW - PAD * 2) / totalW, (CH - PAD * 2) / totalD);

  const ox = PAD + ((CW - PAD * 2) - totalW * scale) / 2;
  const oy = PAD + ((CH - PAD * 2) - totalD * scale) / 2;

  const mainX = side === 'right' ? 0 : ew;
  const extX  = side === 'right' ? mw : 0;

  // Fill sections
  function drawRect(dx, dz, dw, dd, fill, stroke) {
    const rx = ox + dx * scale, ry = oy + dz * scale;
    const rw = dw * scale, rh = dd * scale;
    ctx.fillStyle = fill;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
  }

  drawRect(mainX, 0, mw, md, 'rgba(99,102,241,0.18)', 'rgba(99,102,241,0.7)');
  if (ew > 0 && ed > 0) {
    drawRect(extX, 0, ew, ed, 'rgba(8,145,178,0.15)', 'rgba(8,145,178,0.6)');
  }

  // Section labels
  ctx.font = 'bold 9px -apple-system,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(99,102,241,0.9)';
  ctx.fillText('MAIN', ox + (mainX + mw/2)*scale, oy + md/2*scale);
  if (ew > 0 && ed > 0) {
    ctx.fillStyle = 'rgba(8,145,178,0.9)';
    ctx.fillText('EXT', ox + (extX + ew/2)*scale, oy + ed/2*scale);
  }

  // Dimension lines
  ctx.strokeStyle = '#4a5380'; ctx.fillStyle = '#4a5380'; ctx.lineWidth = 1;
  ctx.font = '9px -apple-system,sans-serif';

  function hDim(x1, x2, y, txt) {
    const A = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.moveTo(x1, y); ctx.lineTo(x1+A, y-A*0.5); ctx.moveTo(x1, y); ctx.lineTo(x1+A, y+A*0.5);
    ctx.moveTo(x2, y); ctx.lineTo(x2-A, y-A*0.5); ctx.moveTo(x2, y); ctx.lineTo(x2-A, y+A*0.5);
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, (x1+x2)/2, y - 2);
  }

  function vDim(y1, y2, x, txt) {
    const A = 4;
    ctx.beginPath();
    ctx.moveTo(x, y1); ctx.lineTo(x, y2);
    ctx.moveTo(x, y1); ctx.lineTo(x-A*0.5, y1+A); ctx.moveTo(x, y1); ctx.lineTo(x+A*0.5, y1+A);
    ctx.moveTo(x, y2); ctx.lineTo(x-A*0.5, y2-A); ctx.moveTo(x, y2); ctx.lineTo(x+A*0.5, y2-A);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, (y1+y2)/2);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, 0, -3);
    ctx.restore();
  }

  // Main width (below front edge)
  hDim(ox + mainX*scale, ox + (mainX+mw)*scale, oy + md*scale + 10, `${mw} cm`);
  // Main depth (outer vertical)
  vDim(oy, oy + md*scale, ox + mainX*scale - 10, `${md} cm`);

  if (ew > 0 && ed > 0) {
    // Ext width
    const extBotY = oy + Math.max(md, ed)*scale + (ed > md ? 10 : 20);
    hDim(ox + extX*scale, ox + (extX+ew)*scale, extBotY, `${ew} cm`);
    // Ext depth (far side from main)
    const extSideX = side === 'right' ? ox + (extX+ew)*scale + 10 : ox + extX*scale - 22;
    vDim(oy, oy + ed*scale, extSideX, `${ed} cm`);
  }
}

// ── BOOT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', init);

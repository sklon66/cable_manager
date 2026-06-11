'use strict';

// ── CABLE CONSTANTS ───────────────────────────────────────────────────────────

const CABLE_COLORS = {
  'USB-A': '#2563eb', 'USB-C': '#7c3aed', 'USB-B': '#0891b2',
  'HDMI': '#d97706', 'DisplayPort': '#dc2626', 'Ethernet': '#16a34a',
  'Power': '#6b7280', 'Audio': '#db2777', 'Other': '#94a3b8',
};

const UNDER_Y = -3;  // routing plane below desk bottom (Y=0)

// ── CABLE STATE ───────────────────────────────────────────────────────────────

let dragPort = null; // { cableId, isFromPort, devId, nx, nz, facePlaneAxis, facePlaneCoord }

// ── PORT PLACEMENT ────────────────────────────────────────────────────────────

// Returns world-space port position on a face of `dev`, fully rotation-aware.
// All computation happens in local (device) space then rotated into world space.
// faceOff — cm slide along the face tangent from its center.
// ht      — cm above device base; null = default (~35% height, max 8 cm).
// face    — explicit face: 'r'|'l'|'f'|'b'; null = auto-pick toward otherDev.
function getPort(dev, otherDev, faceOff = 0, ht = null, face = null) {
  const cx = dev.x + dev.w / 2;
  const cz = dev.z + dev.d / 2;
  const hw = dev.w / 2, hd = dev.d / 2;

  // Rotation applied to the mesh
  const r = -(dev.rotation || 0) * Math.PI / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  const toWorldX = (lx, lz) =>  lx * cosR + lz * sinR;
  const toWorldZ = (lx, lz) => -lx * sinR + lz * cosR;
  const toLocalX = (wx, wz) =>  wx * cosR - wz * sinR;
  const toLocalZ = (wx, wz) =>  wx * sinR + wz * cosR;

  // Local-space face descriptors
  let localNX, localNZ, localFX, localFZ, localAlongX, localAlongZ, halfExt;

  if (face) {
    const defs = {
      r: [ 1,  0,  hw,   0,  0, 1, Math.max(0.5, hd - 1)],
      l: [-1,  0, -hw,   0,  0, 1, Math.max(0.5, hd - 1)],
      f: [ 0,  1,   0,  hd,  1, 0, Math.max(0.5, hw - 1)],
      b: [ 0, -1,   0, -hd,  1, 0, Math.max(0.5, hw - 1)],
    };
    [localNX, localNZ, localFX, localFZ, localAlongX, localAlongZ, halfExt] = defs[face];
  } else {
    // Convert direction-to-other into local space to pick the closest face
    const wdx = (otherDev.x + otherDev.w / 2) - cx;
    const wdz = (otherDev.z + otherDev.d / 2) - cz;
    const ldx = toLocalX(wdx, wdz), ldz = toLocalZ(wdx, wdz);
    if (Math.abs(ldx) >= Math.abs(ldz)) {
      if (ldx >= 0) [localNX,localNZ,localFX,localFZ,localAlongX,localAlongZ,halfExt] = [ 1,0, hw,  0, 0,1,Math.max(0.5,hd-1)];
      else           [localNX,localNZ,localFX,localFZ,localAlongX,localAlongZ,halfExt] = [-1,0,-hw,  0, 0,1,Math.max(0.5,hd-1)];
    } else {
      if (ldz >= 0)  [localNX,localNZ,localFX,localFZ,localAlongX,localAlongZ,halfExt] = [0, 1,  0, hd, 1,0,Math.max(0.5,hw-1)];
      else            [localNX,localNZ,localFX,localFZ,localAlongX,localAlongZ,halfExt] = [0,-1,  0,-hd, 1,0,Math.max(0.5,hw-1)];
    }
  }

  // Apply faceOff (clamped) along local tangent, then rotate to world
  const clampedOff = Math.max(-halfExt, Math.min(halfExt, faceOff));
  const lPortX = localFX + clampedOff * localAlongX;
  const lPortZ = localFZ + clampedOff * localAlongZ;
  const px = cx + toWorldX(lPortX, lPortZ);
  const pz = cz + toWorldZ(lPortX, lPortZ);

  // World-space face normal and tangent (used for drag plane + offset projection)
  const nx = toWorldX(localNX, localNZ);
  const nz = toWorldZ(localNX, localNZ);
  const worldAlongX = toWorldX(localAlongX, localAlongZ);
  const worldAlongZ = toWorldZ(localAlongX, localAlongZ);

  const baseY = DESK_Y + (dev.elevation || 0);
  const py = ht !== null
    ? Math.max(baseY + 0.5, Math.min(baseY + dev.h - 0.5, baseY + ht))
    : baseY + Math.min(dev.h * 0.35, 8);

  return { x: px, y: py, z: pz, nx, nz, worldAlongX, worldAlongZ, halfExt };
}

// Colored port socket tab on the device face. Stores metadata for drag picking.
// Uses a thin box rotated to sit flush with the (possibly non-axis-aligned) face.
function addPortMarker(px, py, pz, nx, nz, col, cableId, isFromPort, devId, worldAlongX, worldAlongZ, halfExt) {
  const geo = new THREE.BoxGeometry(2.5, 2.5, 0.5); // 2.5×2.5 face, 0.5 deep
  const mat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(col),
    emissive: new THREE.Color(col),
    emissiveIntensity: 0.4,
  });
  const dot = new THREE.Mesh(geo, mat);
  // atan2(nx, nz) rotates the box so its depth axis aligns with the face normal
  dot.rotation.y = Math.atan2(nx, nz);
  dot.position.set(px + nx * 0.25, py, pz + nz * 0.25);
  dot.userData = { isPort: true, cableId, isFromPort, devId, nx, nz, worldAlongX, worldAlongZ, halfExt, faceX: px, faceZ: pz };
  cableGroup.add(dot);
}

// ── DESK-EDGE FINDERS ─────────────────────────────────────────────────────────

function nearestDeskEdge(px, pz, b) {
  const { mX0, mX1, mZ1, eX0, eX1, eZ1 } = b;
  const totalD = Math.max(mZ1, eZ1);
  const segs = [
    [mX0, 0, mX1, 0], [eX0, 0, eX1, 0],
    [mX0, mZ1, mX1, mZ1], [eX0, eZ1, eX1, eZ1],
    [Math.min(mX0,eX0), 0, Math.min(mX0,eX0), totalD],
    [Math.max(mX1,eX1), 0, Math.max(mX1,eX1), totalD],
    [eX1, eZ1, eX1, mZ1], [eX0, eZ1, eX0, mZ1],
  ];
  function nearestOnSeg(ax, az, bx, bz) {
    const dx = bx-ax, dz = bz-az, len2 = dx*dx+dz*dz;
    if (len2 < 0.0001) return { x: ax, z: az };
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / len2));
    return { x: ax + t*dx, z: az + t*dz };
  }
  let best = null, bestD = Infinity;
  for (const [ax, az, bx, bz] of segs) {
    if (ax === bx && az === bz) continue;
    const pt = nearestOnSeg(ax, az, bx, bz);
    const d  = Math.hypot(pt.x-px, pt.z-pz);
    if (d < bestD) { bestD = d; best = pt; }
  }
  return best || { x: px, z: 0 };
}

// Traces from (px,pz) along the face normal (nx,nz) to find where it exits
// the desk footprint, returning the axis-aligned edge point.
function exitEdgeAlongNormal(px, pz, nx, nz, b) {
  const { mX0, mX1, mZ1, eX0, eX1, eZ1 } = b;
  if (Math.abs(nx) >= Math.abs(nz)) {
    if (nx > 0) {
      let edgeX = -Infinity;
      if (pz >= 0 && pz <= mZ1) edgeX = Math.max(edgeX, mX1);
      if (pz >= 0 && pz <= eZ1) edgeX = Math.max(edgeX, eX1);
      return { x: isFinite(edgeX) ? edgeX : px + 20, z: pz };
    } else {
      let edgeX = Infinity;
      if (pz >= 0 && pz <= mZ1) edgeX = Math.min(edgeX, mX0);
      if (pz >= 0 && pz <= eZ1) edgeX = Math.min(edgeX, eX0);
      return { x: isFinite(edgeX) ? edgeX : px - 20, z: pz };
    }
  } else {
    if (nz > 0) {
      let edgeZ = -Infinity;
      if (px >= mX0 && px <= mX1) edgeZ = Math.max(edgeZ, mZ1);
      if (px >= eX0 && px <= eX1) edgeZ = Math.max(edgeZ, eZ1);
      return { x: px, z: isFinite(edgeZ) ? edgeZ : pz + 20 };
    } else {
      return { x: px, z: 0 };
    }
  }
}

// ── CABLE GEOMETRY ────────────────────────────────────────────────────────────

function buildCableGeometry(cable, devMap, routeIdx) {
  const A = devMap[cable.fromId], B = devMap[cable.toId];
  if (!A || !B) return;

  const col      = CABLE_COLORS[cable.cableType] || CABLE_COLORS['Other'];
  const R        = 0.3; // cable radius (cm)
  const routingY = UNDER_Y - routeIdx * 2 * R; // stack cables touching: one diameter apart
  const b        = bounds();

  const pA = getPort(A, B, cable.portOffA || 0, cable.portHtA ?? null, cable.portFaceA || null);
  const pB = getPort(B, A, cable.portOffB || 0, cable.portHtB ?? null, cable.portFaceB || null);

  const CLEARANCE = 6;
  const exitAX = pA.x + pA.nx * CLEARANCE, exitAZ = pA.z + pA.nz * CLEARANCE;
  const exitBX = pB.x + pB.nx * CLEARANCE, exitBZ = pB.z + pB.nz * CLEARANCE;

  // Returns the path segments to bring one cable end from its exit point down
  // to the routing plane, routing along the desk surface then over the edge
  // if the exit is over the desk, or dropping straight if it's already off.
  function dropSeq(exitX, exitZ, nx, nz) {
    if (isOnDesk(exitX, exitZ, 0, 0)) {
      const edge = exitEdgeAlongNormal(exitX, exitZ, nx, nz, b);
      return {
        pts: [
          new THREE.Vector3(exitX,  DESK_Y,   exitZ),
          new THREE.Vector3(edge.x, DESK_Y,   edge.z),
          new THREE.Vector3(edge.x, routingY, edge.z),
        ],
        rx: edge.x, rz: edge.z,
      };
    }
    return {
      pts: [new THREE.Vector3(exitX, routingY, exitZ)],
      rx: exitX, rz: exitZ,
    };
  }

  const dA = dropSeq(exitAX, exitAZ, pA.nx, pA.nz);
  const dB = dropSeq(exitBX, exitBZ, pB.nx, pB.nz);

  const wps = cable.userWaypoints || [];
  const pts = [
    new THREE.Vector3(pA.x,   pA.y, pA.z),
    new THREE.Vector3(exitAX, pA.y, exitAZ),
    ...dA.pts,
  ];

  if (wps.length === 0) {
    const dx = Math.abs(dB.rx - dA.rx), dz = Math.abs(dB.rz - dA.rz);
    if (dx >= dz) {
      pts.push(new THREE.Vector3(dB.rx, routingY, dA.rz)); // X-first elbow
    } else {
      pts.push(new THREE.Vector3(dA.rx, routingY, dB.rz)); // Z-first elbow
    }
  } else {
    wps.forEach(wp => pts.push(new THREE.Vector3(wp.x, wp.y ?? routingY, wp.z)));
  }

  // Side B ascent: mirror of dropSeq in reverse
  for (let i = dB.pts.length - 1; i >= 0; i--) pts.push(dB.pts[i]);
  pts.push(
    new THREE.Vector3(exitBX, pB.y, exitBZ),
    new THREE.Vector3(pB.x,  pB.y, pB.z),
  );

  const up = new THREE.Vector3(0, 1, 0);
  const cableColor = new THREE.Color(col);

  // One cylinder per straight segment — no Frenet-frame stretching at corners
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) continue;
    dir.normalize();
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, len, 8),
      new THREE.MeshPhongMaterial({ color: cableColor }),
    );
    seg.userData.cableId = cable.id;
    if (Math.abs(dir.dot(up)) > 0.9999) {
      if (dir.y < 0) seg.rotation.x = Math.PI; // pointing down
    } else {
      seg.quaternion.setFromUnitVectors(up, dir);
    }
    seg.position.copy(a).addScaledVector(dir, len / 2);
    cableGroup.add(seg);
  }

  // Sphere joint at every interior corner to fill the gap between cylinders
  for (let i = 1; i < pts.length - 1; i++) {
    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(R, 8, 8),
      new THREE.MeshPhongMaterial({ color: cableColor }),
    );
    joint.userData.cableId = cable.id;
    joint.position.copy(pts[i]);
    cableGroup.add(joint);
  }

  addPortMarker(pA.x, pA.y, pA.z, pA.nx, pA.nz, col, cable.id, true,  A.id, pA.worldAlongX, pA.worldAlongZ, pA.halfExt);
  addPortMarker(pB.x, pB.y, pB.z, pB.nx, pB.nz, col, cable.id, false, B.id, pB.worldAlongX, pB.worldAlongZ, pB.halfExt);

  buildWaypointMarkers(cable, wps, col, routingY);
}

function buildWaypointMarkers(cable, waypoints, col, defaultY) {
  waypoints.forEach((wp, i) => {
    const geo = new THREE.SphereGeometry(2.5, 10, 10);
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(col), emissive: new THREE.Color(col), emissiveIntensity: 0.35,
      transparent: true, opacity: 0.85,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(wp.x, wp.y !== undefined ? wp.y : defaultY, wp.z);
    sphere.userData = { isWaypoint: true, cableId: cable.id, wpIndex: i };
    cableGroup.add(sphere);
  });
}

function pickWaypoint(e) {
  ndcFromEvent(e);
  raycaster.setFromCamera(mouse, currentCamera);
  const meshes = cableGroup.children.filter(c => c.userData && c.userData.isWaypoint);
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length ? hits[0].object : null;
}

function onDblClick(e) {
  if (state.mode !== '3d' || !cableGroup.children.length) return;
  ndcFromEvent(e);
  raycaster.setFromCamera(mouse, currentCamera);
  const tubes = cableGroup.children.filter(c => c.userData && c.userData.cableId !== undefined && !c.userData.isPort && !c.userData.isWaypoint);
  const hits = raycaster.intersectObjects(tubes, false);
  if (!hits.length) return;
  const cable = state.cables.find(c => c.id === hits[0].object.userData.cableId);
  if (!cable) return;
  if (!cable.userWaypoints) cable.userWaypoints = [];
  cable.userWaypoints.push({ x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z });
  rerouteSingleCable(cable);
  save3d();
}

// Removes and rebuilds just one cable's geometry (used during port drag).
function rerouteSingleCable(cable) {
  [...cableGroup.children].forEach(c => {
    if (c.userData && c.userData.cableId === cable.id) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      cableGroup.remove(c);
    }
  });
  const devMap = {};
  state.devices.forEach(d => { devMap[d.id] = d; });
  buildCableGeometry(cable, devMap, cable._routeIdx || 0);
}

// Returns the port marker mesh under the cursor, or null.
function pickPort(e) {
  ndcFromEvent(e);
  raycaster.setFromCamera(mouse, currentCamera);
  const portMeshes = cableGroup.children.filter(c => c.userData && c.userData.isPort);
  const hits = raycaster.intersectObjects(portMeshes, false);
  return hits.length ? hits[0].object : null;
}

function routeCables() {
  clearCables();
  dragPort = null;
  dragWP = null;
  state.selectedWP = null;
  rebuildFloor();

  const devMap = {};
  state.devices.forEach(d => { devMap[d.id] = d; });

  const valid = state.cables.filter(c => devMap[c.fromId] && devMap[c.toId]);
  if (!valid.length) { toast('No cables to route'); return; }

  valid.forEach((cable, i) => {
    cable._routeIdx = i;
    buildCableGeometry(cable, devMap, i);
  });

  toast(`Routed ${valid.length} cable${valid.length !== 1 ? 's' : ''}`);
}

function clearCables() {
  while (cableGroup.children.length) {
    const c = cableGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    cableGroup.remove(c);
  }
}

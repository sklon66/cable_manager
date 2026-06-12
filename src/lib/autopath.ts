import * as THREE from 'three';
import type { PortInfo } from './ports3d';

export const CABLE_RADIUS = 0.3; // cm
const CLEARANCE = 6;             // cm straight out of the port before the first turn

/**
 * Fresh autopath: orthogonal (Manhattan) route between two ports using only
 * 90° turns. Leaves each port along its face normal, runs the dominant
 * horizontal axis first at the source height, then the cross axis, then a
 * single vertical to the destination height, and enters port B along its normal.
 */
export function computeAutoPath(pA: PortInfo, pB: PortInfo): THREE.Vector3[] {
  const a = new THREE.Vector3(pA.x, pA.y, pA.z);
  const b = new THREE.Vector3(pB.x, pB.y, pB.z);
  const e1 = new THREE.Vector3(pA.x + pA.nx * CLEARANCE, pA.y, pA.z + pA.nz * CLEARANCE);
  const e2 = new THREE.Vector3(pB.x + pB.nx * CLEARANCE, pB.y, pB.z + pB.nz * CLEARANCE);

  const pts = [a, e1];
  const dx = e2.x - e1.x, dz = e2.z - e1.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    pts.push(new THREE.Vector3(e2.x, e1.y, e1.z));
    pts.push(new THREE.Vector3(e2.x, e1.y, e2.z));
  } else {
    pts.push(new THREE.Vector3(e1.x, e1.y, e2.z));
    pts.push(new THREE.Vector3(e2.x, e1.y, e2.z));
  }
  pts.push(e2);
  pts.push(b);

  // Drop zero-length segments (aligned ports collapse some corners)
  const out: THREE.Vector3[] = [];
  for (const p of pts) {
    if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-6) out.push(p);
  }
  return out;
}

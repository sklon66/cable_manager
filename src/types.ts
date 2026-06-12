// Serialized shapes — must stay compatible with the legacy app's
// localStorage keys ('kvm-vis-state', 'kvm-3d-state') and export JSON.

export type DeviceType =
  | 'pc' | 'kvm' | 'monitor' | 'usb_hub'
  | 'usb_device' | 'audio' | 'network' | 'other';

export type CableTypeName =
  | 'USB-A' | 'USB-C' | 'USB-B' | 'HDMI' | 'DisplayPort'
  | 'Ethernet' | 'Power' | 'Audio' | 'Other';

export type Direction = 'to' | 'from' | 'both' | 'none';

export interface Device {
  id: number;
  type: DeviceType;
  name: string;
  x: number;
  y: number;
  color: string;
}

export interface Waypoint { x: number; y: number }

export interface Cable {
  id: number;
  fromId: number;
  toId: number;
  cableType: CableTypeName;
  label: string;
  direction?: Direction;
  waypoints?: Waypoint[];
}

/** = kvm-vis-state = export file format */
export interface LayoutDoc {
  nextId: number;
  devices: Device[];
  cables: Cable[];
}

// ── 3D ──────────────────────────────────────────────────────────────────────

export interface DeskConfig {
  main_w: number;
  main_d: number;
  ext_w: number;
  ext_d: number;
  ext_side: 'right' | 'left';
}

export interface Device3D {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  name: string;
  elevation: number;
  rotation: number;
}

export type PortFace = 'r' | 'l' | 'f' | 'b';

export interface Waypoint3D { x: number; y: number; z: number }

export interface Cable3D {
  id: number;
  portOffA: number;
  portHtA: number | null;
  portFaceA: PortFace | null;
  portOffB: number;
  portHtB: number | null;
  portFaceB: PortFace | null;
  userWaypoints: Waypoint3D[];
}

/** = kvm-3d-state */
export interface Scene3DDoc {
  desk: DeskConfig;
  devices3d: Device3D[];
  cables3d: Cable3D[];
}

export interface Selection { kind: 'device' | 'cable'; id: number }
export type Mode2D = 'select' | 'cable';

import type { CableTypeName, DeviceType, LayoutDoc } from '../types';

export const CABLE_TYPES: Record<CableTypeName, { color: string; label: string }> = {
  'USB-A':       { color: '#2563eb', label: 'USB-A' },
  'USB-C':       { color: '#7c3aed', label: 'USB-C' },
  'USB-B':       { color: '#0891b2', label: 'USB-B' },
  'HDMI':        { color: '#d97706', label: 'HDMI' },
  'DisplayPort': { color: '#dc2626', label: 'DP' },
  'Ethernet':    { color: '#16a34a', label: 'ETH' },
  'Power':       { color: '#6b7280', label: 'PWR' },
  'Audio':       { color: '#db2777', label: 'AUD' },
  'Other':       { color: '#94a3b8', label: '...' },
};

export const DEVICE_TYPES: Record<DeviceType, { icon: string; label: string; defaultName: string; defaultColor: string }> = {
  pc:         { icon: '🖥️', label: 'PC / Laptop',    defaultName: 'PC',         defaultColor: '#6366f1' },
  kvm:        { icon: '🔀', label: 'KVM Switch',     defaultName: 'KVM Switch', defaultColor: '#f59e0b' },
  monitor:    { icon: '🖵', label: 'Monitor',        defaultName: 'Monitor',    defaultColor: '#0ea5e9' },
  usb_hub:    { icon: '🔌', label: 'USB Hub',        defaultName: 'USB Hub',    defaultColor: '#10b981' },
  usb_device: { icon: '💾', label: 'USB Device',     defaultName: 'USB Device', defaultColor: '#8b5cf6' },
  audio:      { icon: '🔊', label: 'Audio Device',   defaultName: 'Speakers',   defaultColor: '#ec4899' },
  network:    { icon: '🌐', label: 'Network Switch', defaultName: 'Switch',     defaultColor: '#14b8a6' },
  other:      { icon: '⬜', label: 'Other Device',   defaultName: 'Device',     defaultColor: '#64748b' },
};

export const DEFAULT_STATE: LayoutDoc = {
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

// 3D default dimensions per device type (cm)
export const DEVICE_DEFAULTS: Record<DeviceType, { w: number; d: number; h: number; label: string; color: string }> = {
  pc:         { w: 20, d: 45, h: 45, label: 'PC / Laptop',    color: '#6366f1' },
  kvm:        { w: 20, d: 12, h: 4,  label: 'KVM Switch',     color: '#7c3aed' },
  monitor:    { w: 60, d: 20, h: 40, label: 'Monitor',        color: '#0891b2' },
  usb_hub:    { w: 12, d: 6,  h: 3,  label: 'USB Hub',        color: '#d97706' },
  usb_device: { w: 10, d: 5,  h: 2,  label: 'USB Device',     color: '#16a34a' },
  audio:      { w: 20, d: 15, h: 25, label: 'Audio Device',   color: '#db2777' },
  network:    { w: 30, d: 10, h: 4,  label: 'Network Switch', color: '#2563eb' },
  other:      { w: 15, d: 10, h: 5,  label: 'Other Device',   color: '#6b7280' },
};

// Device card anchor point for cables (card is ~128px wide, ~88px tall)
export const CARD_ANCHOR = { x: 64, y: 44 };

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 4;

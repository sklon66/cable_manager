import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:5199';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ── 1. Profile A: seed 2D + 3D state (customized sizes/ports), export ────────
const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
await pageA.addInitScript(() => {
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 13,
    devices: [
      { id: 1, type: 'pc', name: 'My PC', x: 80, y: 180, color: '#6366f1' },
      { id: 3, type: 'kvm', name: 'KVM', x: 340, y: 270, color: '#f59e0b' },
    ],
    cables: [{ id: 12, fromId: 1, toId: 3, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] }],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 180, main_d: 70, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 40, z: 10, w: 22, d: 50, h: 48, name: 'My PC', elevation: -50, rotation: 90 },
      { id: 3, x: 100, z: 20, w: 25, d: 14, h: 5, name: 'KVM', elevation: 0, rotation: 0 },
    ],
    cables3d: [{ id: 12, portOffA: 3, portHtA: 12, portFaceA: 'b', portOffB: 0, portHtB: null, portFaceB: null, userWaypoints: [{ x: 50, y: -3, z: 30 }] }],
  }));
});
await pageA.goto(BASE + '/');
await pageA.waitForSelector('.device-card');
const [download] = await Promise.all([
  pageA.waitForEvent('download'),
  pageA.click('button[title="Export JSON"]'),
]);
const file = '/tmp/kvm-verify/export-bundle.json';
await download.saveAs(file);
const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
log('1: export keys:', Object.keys(exported).join(','));
log('1: scene3d.desk:', JSON.stringify(exported.scene3d?.desk));
log('1: scene3d device 1:', JSON.stringify(exported.scene3d?.devices3d?.find(d => d.id === 1)));
log('1: scene3d cable ports:', JSON.stringify(exported.scene3d?.cables3d?.[0]));
await ctxA.close();

// ── 2. Profile B (clean machine): import the file in the 2D view ─────────────
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();
await pageB.goto(BASE + '/');
await pageB.waitForSelector('.device-card');
await pageB.click('button[title="Import JSON"]');
await pageB.setInputFiles('#toolbar input[type=file]', file);
await pageB.waitForTimeout(400);
const restored = await pageB.evaluate(() => ({
  vis: JSON.parse(localStorage.getItem('kvm-vis-state')),
  d3: JSON.parse(localStorage.getItem('kvm-3d-state') || 'null'),
}));
log('2: devices after import:', restored.vis.devices.map(d => d.name).join(','));
log('2: kvm-3d-state restored:', restored.d3 ? 'YES' : 'NO',
  '| desk:', JSON.stringify(restored.d3?.desk),
  '| dev1 elev/rot:', restored.d3?.devices3d?.[0]?.elevation, restored.d3?.devices3d?.[0]?.rotation,
  '| port faceA:', restored.d3?.cables3d?.[0]?.portFaceA,
  '| user wps:', restored.d3?.cables3d?.[0]?.userWaypoints?.length);

// 3D view picks it up without re-setup
await pageB.click('a[title="Open 3D desk view"]');
await pageB.waitForTimeout(1500);
const modalOpen = await pageB.locator('#modal-overlay.open').count();
const labels = await pageB.locator('.device-label').count();
log('2: /3d after import — setup modal (expect 0):', modalOpen, '| device labels:', labels);
await pageB.screenshot({ path: '/tmp/kvm-verify/11-imported-3d.png' });
await ctxB.close();

// ── 3. Probe: legacy-format file (no scene3d) still imports cleanly ──────────
const ctxC = await browser.newContext();
const pageC = await ctxC.newPage();
const legacyFile = '/tmp/kvm-verify/legacy-format.json';
fs.writeFileSync(legacyFile, JSON.stringify({ nextId: 5, devices: [
  { id: 1, type: 'pc', name: 'Old PC', x: 100, y: 100, color: '#6366f1' },
], cables: [] }));
await pageC.goto(BASE + '/');
await pageC.waitForSelector('.device-card');
await pageC.click('button[title="Import JSON"]');
await pageC.setInputFiles('#toolbar input[type=file]', legacyFile);
await pageC.waitForTimeout(400);
const c = await pageC.evaluate(() => ({
  names: JSON.parse(localStorage.getItem('kvm-vis-state')).devices.map(d => d.name),
  d3: localStorage.getItem('kvm-3d-state'),
}));
log('3: legacy import devices:', c.names.join(','), '| kvm-3d-state untouched (expect null):', c.d3);
await ctxC.close();

await browser.close();
log('DONE');

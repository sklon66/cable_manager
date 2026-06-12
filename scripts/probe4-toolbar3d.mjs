import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:5199';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));

// Seed both stores so /3d starts directly in layout mode
await page.addInitScript(() => {
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 13,
    devices: [
      { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
      { id: 3, type: 'kvm', name: 'KVM', x: 340, y: 270, color: '#f59e0b' },
    ],
    cables: [{ id: 12, fromId: 1, toId: 3, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] }],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 140, main_d: 60, ext_w: 80, ext_d: 120, ext_side: 'right' },
    devices3d: [], cables3d: [],
  }));
});

// ── 1. Layout mode: Import/Export buttons present, Export downloads bundle ───
await page.goto(BASE + '/3d');
await page.waitForSelector('#canvas3d canvas');
const btnsLayout = await page.locator('#toolbar button, #toolbar a').allTextContents();
log('1: layout-mode toolbar:', JSON.stringify(btnsLayout));
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#toolbar button[title="Export JSON"]'),
]);
const f = '/tmp/kvm-verify/export-from-3d.json';
await dl.saveAs(f);
const exp = JSON.parse(fs.readFileSync(f, 'utf8'));
log('1: exported from 3D, keys:', Object.keys(exp).join(','), '| devices:', exp.devices.length);

// ── 2. 3D mode: buttons still there ──────────────────────────────────────────
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);
const btns3d = await page.locator('#toolbar button, #toolbar a').allTextContents();
log('2: 3d-mode toolbar:', JSON.stringify(btns3d));

// ── 3. Import a bundled file on /3d → scene rebuilds with its desk ───────────
const bundled = '/tmp/kvm-verify/bundle-import-3d.json';
fs.writeFileSync(bundled, JSON.stringify({
  nextId: 3,
  devices: [{ id: 1, type: 'monitor', name: 'Imported Monitor', x: 50, y: 50, color: '#0ea5e9' }],
  cables: [],
  scene3d: {
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [{ id: 1, x: 60, z: 20, w: 70, d: 22, h: 45, name: 'Imported Monitor', elevation: 10, rotation: 0 }],
    cables3d: [],
  },
}));
await page.click('#toolbar button[title="Import JSON"]');
await page.setInputFiles('#toolbar input[type=file]', bundled);
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({
  vis: JSON.parse(localStorage.getItem('kvm-vis-state')).devices.map(d => d.name),
  desk: JSON.parse(localStorage.getItem('kvm-3d-state')).desk,
}));
log('3: after import on /3d — devices:', after.vis.join(','), '| desk:', JSON.stringify(after.desk));
log('3: labels:', await page.locator('.device-label').allTextContents(),
  '| setup modal (expect 0):', await page.locator('#modal-overlay.open').count());
await page.screenshot({ path: '/tmp/kvm-verify/12-3d-import-button.png' });

// ── 4. Probe: import garbage file on /3d → toast, state untouched ────────────
const bad = '/tmp/kvm-verify/bad.json';
fs.writeFileSync(bad, 'not json{{{');
await page.click('#toolbar button[title="Import JSON"]');
await page.setInputFiles('#toolbar input[type=file]', bad);
await page.waitForTimeout(400);
log('4: probe garbage import — toast:', JSON.stringify(await page.locator('#toast').textContent()),
  '| devices kept:', (await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-vis-state')).devices.length)));

// ── 5. Back on 2D: imported layout visible there too ─────────────────────────
await page.click('a[title="Back to 2D tool"]');
await page.waitForSelector('.device-card');
log('5: 2D cards after 3D-side import:', await page.locator('.dc-name').allTextContents());

await browser.close();
log('DONE');

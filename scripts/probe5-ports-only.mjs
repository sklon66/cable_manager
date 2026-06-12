import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5199';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));

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
    desk: { main_w: 140, main_d: 60, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [],
    // legacy save with waypoints — must load without errors and be preserved
    cables3d: [{ id: 12, portOffA: 2, portHtA: 10, portFaceA: 'f', portOffB: 0, portHtB: null, portFaceB: null, userWaypoints: [{ x: 1, y: -3, z: 2 }] }],
  }));
});

await page.goto(BASE + '/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);

// Route → toast, ports visible, no cable cylinders (count scene meshes via screenshot + state)
await page.click('button[title="Route cables"]');
await page.waitForTimeout(500);
log('1: toast:', JSON.stringify(await page.locator('#toast').textContent()));
await page.screenshot({ path: '/tmp/kvm-verify/13-ports-only.png' });

// Select PC 1 → port face select present, waypoint UI gone
const lb = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2 + 25);
await page.waitForTimeout(300);
const panelText = await page.locator('#props-content').textContent();
log('2: props has "Port faces":', panelText.includes('Port faces'),
  '| has waypoint UI (expect false):', panelText.toLowerCase().includes('waypoint'));

// Port face change still persists; saved userWaypoints preserved untouched
await page.selectOption('#props-content select >> nth=0', 'b');
await page.waitForTimeout(300);
const c3d = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0]);
log('3: cable3d after face change:', JSON.stringify(c3d));

// Clear Cables hides ports again
await page.click('button[title="Clear cables"]');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/kvm-verify/14-ports-cleared.png' });
log('4: cleared (screenshot)');

await browser.close();
log('DONE');

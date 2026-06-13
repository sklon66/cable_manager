import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('kvm-vis-state')) return;
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 30,
    devices: [
      { id: 1, type: 'pc', name: 'PC', x: 80, y: 200, color: '#6366f1' },
      { id: 3, type: 'monitor', name: 'Monitor', x: 600, y: 200, color: '#0ea5e9' },
    ],
    // TWO cables on the same pair → full-length overlap → whole run thicker
    cables: [
      { id: 11, fromId: 1, toId: 3, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] },
      { id: 12, fromId: 1, toId: 3, cableType: 'USB-C', label: '', direction: 'to', waypoints: [] },
    ],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 35, w: 20, d: 20, h: 12, name: 'PC', elevation: 0, rotation: 0 },
      { id: 3, x: 170, z: 35, w: 20, d: 20, h: 12, name: 'Monitor', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(700);
log('1: routed:', JSON.stringify(await page.locator('#toast').textContent()));
await page.screenshot({ path: '/tmp/kvm-verify/27-samepair-bundle.png' });

// The two same-pair cables run straight across the desk middle. Sweep y to hit the line.
const cb = await page.locator('#canvas3d canvas').boundingBox();
const wpsOf = async () => page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d.map(c => (c.userWaypoints||[]).length));
let hit = null;
for (const fy of [0.46, 0.48, 0.50, 0.52, 0.54]) {
  await page.mouse.dblclick(cb.x + cb.width * 0.45, cb.y + cb.height * fy);
  await page.waitForTimeout(250);
  const w = await wpsOf();
  if (w.some(n => n > 0)) { hit = { fy, w }; break; }
}
log('2: dblclick add result:', JSON.stringify(hit));
await page.screenshot({ path: '/tmp/kvm-verify/28-waypoint-added.png' });

if (hit) {
  // persists across reload
  await page.reload();
  await page.waitForTimeout(1000);
  await page.click('button[title="Switch to 3D view"]');
  await page.waitForTimeout(300);
  await page.click('button[title="Route cables"]');
  await page.waitForTimeout(400);
  const after = await wpsOf();
  log('3: waypoints after reload:', JSON.stringify(after));
}
await browser.close();
log('DONE');

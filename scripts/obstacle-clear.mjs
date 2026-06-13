import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('kvm-vis-state')) return;
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 20,
    devices: [
      { id: 1, type: 'pc', name: 'PC', x: 80, y: 200, color: '#6366f1' },
      { id: 2, type: 'monitor', name: 'Monitor', x: 600, y: 200, color: '#0ea5e9' },
    ],
    cables: [{ id: 12, fromId: 1, toId: 2, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] }],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 30, w: 20, d: 20, h: 10, name: 'PC', elevation: 0, rotation: 0 },
      { id: 2, x: 170, z: 30, w: 20, d: 20, h: 10, name: 'Monitor', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/kvm-verify/24-clear.png' });
log('DONE');

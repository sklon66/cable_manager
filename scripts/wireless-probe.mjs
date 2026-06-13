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
      { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
      { id: 4, type: 'monitor', name: 'Monitor 1', x: 600, y: 120, color: '#0ea5e9' },
    ],
    cables: [
      { id: 14, fromId: 1, toId: 4, cableType: 'USB-C', label: '', direction: 'to', waypoints: [] },
    ],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 10, w: 20, d: 45, h: 45, name: 'PC 1', elevation: 0, rotation: 0 },
      { id: 4, x: 140, z: 10, w: 60, d: 20, h: 40, name: 'Monitor 1', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/kvm-verify/19-wired.png' });

// Select PC, toggle wireless
const pcLbl = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
await page.mouse.click(pcLbl.x + pcLbl.width / 2, pcLbl.y + pcLbl.height / 2 + 30);
await page.waitForTimeout(300);
const hasCheckbox = await page.locator('#props-content input[type=checkbox]').count();
log('1: wireless checkbox present:', hasCheckbox);
await page.check('#props-content input[type=checkbox]');
await page.waitForTimeout(400);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0]);
log('2: persisted wireless flag:', saved.wireless);
await page.screenshot({ path: '/tmp/kvm-verify/20-wireless.png' });

// Reload — wireless should still be on and render dotted
await page.reload();
await page.waitForTimeout(1200);
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/kvm-verify/21-wireless-reload.png' });
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0].wireless);
log('3: wireless after reload:', after);

// Toggle back off
const pc2 = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
await page.mouse.click(pc2.x + pc2.width / 2, pc2.y + pc2.height / 2 + 30);
await page.waitForTimeout(300);
await page.uncheck('#props-content input[type=checkbox]');
await page.waitForTimeout(400);
log('4: wireless after untoggle:', await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0].wireless));
await browser.close();
log('DONE');

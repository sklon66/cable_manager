import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let printed = 0;
page.on('pageerror', e => { if (printed++ < 1) console.log('PAGEERROR:', e.stack || e.message); });
await page.addInitScript(() => {
  localStorage.setItem('kvm-vis-state', JSON.stringify({ nextId: 2, devices: [{ id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' }], cables: [] }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({ desk: { main_w: 140, main_d: 60, ext_w: 0, ext_d: 0, ext_side: 'right' }, devices3d: [], cables3d: [] }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.waitForTimeout(500);
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(1500);
await browser.close();
console.log('DONE');

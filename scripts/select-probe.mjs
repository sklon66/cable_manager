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
      { id: 4, type: 'monitor', name: 'Big Monitor', x: 600, y: 120, color: '#0ea5e9' },
      { id: 6, type: 'usb_device', name: 'Tiny USB', x: 620, y: 140, color: '#8b5cf6' },
    ],
    cables: [],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      // large monitor footprint 80x40; tiny usb 10x5 centered inside it
      { id: 4, x: 40, z: 20, w: 80, d: 40, h: 40, name: 'Big Monitor', elevation: 0, rotation: 0 },
      { id: 6, x: 75, z: 38, w: 10, d: 5, h: 2, name: 'Tiny USB', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.waitForTimeout(700);

const propName = async () => (await page.locator('#props-content input').first().inputValue().catch(() => null));

// Click the overlap (Tiny USB label sits at the shared center)
const small = await page.locator('.device-label', { hasText: 'Tiny USB' }).boundingBox();
const cx = small.x + small.width / 2, cy = small.y + small.height / 2;
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
log('1: click overlap center → selected:', JSON.stringify(await propName()), '(expect Tiny USB)');

// Deselect, then click left part of the monitor (away from the small device)
await page.keyboard.press('Escape');
await page.mouse.click(100, 100); // empty
await page.waitForTimeout(200);
await page.mouse.click(cx - 180, cy); // far left, inside monitor only
await page.waitForTimeout(300);
log('2: click monitor-only area → selected:', JSON.stringify(await propName()), '(expect Big Monitor)');

await page.screenshot({ path: '/tmp/kvm-verify/22-select-small.png' });
await browser.close();
log('DONE');

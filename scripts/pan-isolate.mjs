import { chromium } from 'playwright-core';
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
    ], cables: [],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({ desk: { main_w: 140, main_d: 60, ext_w: 80, ext_d: 120, ext_side: 'right' }, devices3d: [], cables3d: [] }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.waitForTimeout(800);
const pos = () => page.locator('.device-label', { hasText: 'PC 1' }).boundingBox().then(b => [Math.round(b.x), Math.round(b.y)]);

log('start:', await pos());
// a) idle 800ms
await page.waitForTimeout(800);
log('a idle:', await pos());
// b) pan the view once (like probe step 1)
await page.mouse.move(900, 700);
await page.mouse.down();
await page.mouse.move(1100, 600, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
log('b after pan:', await pos());
// c) idle 800ms after pan
await page.waitForTimeout(800);
log('c idle after pan:', await pos());
// d) click KVM (no move)
const kvm = await page.locator('.device-label', { hasText: 'KVM' }).boundingBox();
await page.mouse.click(kvm.x + kvm.width / 2, kvm.y + kvm.height / 2);
await page.waitForTimeout(300);
log('d after click KVM:', await pos());
// e) drag KVM
const k2 = await page.locator('.device-label', { hasText: 'KVM' }).boundingBox();
await page.mouse.move(k2.x + k2.width / 2, k2.y + k2.height / 2);
await page.mouse.down();
await page.mouse.move(k2.x + k2.width / 2 + 80, k2.y + k2.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
log('e after drag KVM:', await pos());
await browser.close();
log('DONE');

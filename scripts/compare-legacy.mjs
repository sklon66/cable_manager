import { chromium } from 'playwright-core';

const SEED = JSON.stringify({
  nextId: 13,
  devices: [
    { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
    { id: 3, type: 'kvm', name: 'KVM Switch', x: 340, y: 270, color: '#f59e0b' },
    { id: 4, type: 'monitor', name: 'Monitor 1', x: 600, y: 120, color: '#0ea5e9' },
  ],
  cables: [{ id: 12, fromId: 1, toId: 3, cableType: 'HDMI', label: 'Ch1', direction: 'to', waypoints: [] }],
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shoot(url, out, isLegacy) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(s => {
    localStorage.clear();
    localStorage.setItem('kvm-vis-state', s);
  }, SEED);
  await page.goto(url);
  await page.waitForTimeout(1500);
  if (await page.locator('#modal-overlay.open').count()) {
    await page.click(isLegacy ? '#btn-start' : '#modal .btn.primary');
  }
  await page.waitForTimeout(1000);
  // Switch to 3D + route
  await page.click(isLegacy ? '#btn-to3d' : 'button[title="Switch to 3D view"]');
  await page.waitForTimeout(600);
  await page.click(isLegacy ? '#btn-route' : 'button[title="Route cables"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  await page.close();
}

await shoot('file:///Users/mykyta/Desktop/kvm-visualizer/legacy/3d.html', '/tmp/kvm-verify/cmp-legacy-3d.png', true);
await shoot('http://localhost:5199/3d', '/tmp/kvm-verify/cmp-react-3d.png', false);
await browser.close();
console.log('DONE');

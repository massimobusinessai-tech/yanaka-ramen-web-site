const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto('file:///C:/Vs%20studio%20code/7%20day%20challenge/day%205%20web%20design/index.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'mobile-hero.png', fullPage: false });
  await browser.close();
})();

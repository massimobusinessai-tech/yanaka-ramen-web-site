import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto('file:///C:/Vs studio code/7 day challenge/day 5 web design/index.html', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'mobile-hero.png', fullPage: false });
await browser.close();

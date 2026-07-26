import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function takeScreenshot(url, label = '') {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2' });

    const screenshotsDir = path.join(__dirname, 'temporary screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const existing = fs.readdirSync(screenshotsDir).filter(f => f.startsWith('screenshot-')).length;
    const filename = label ? `screenshot-${existing + 1}-${label}.png` : `screenshot-${existing + 1}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await page.screenshot({ path: filepath, fullPage: true });
    await browser.close();

    console.log(`Screenshot saved: ${filepath}`);
    return filepath;
}

// Get URL from command line argument
const url = process.argv[2];
const label = process.argv[3] || '';

if (!url) {
    console.error('Usage: node screenshot.mjs <URL> [label]');
    process.exit(1);
}

takeScreenshot(url, label).catch(console.error);
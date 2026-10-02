import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/lnh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const { chromium } = require('playwright');

const base = process.env.LNH_BASE_URL || 'http://127.0.0.1:4175';
const captureSet = process.env.LNH_CAPTURE_SET || 'captures';
const output = new URL(`../comparison/${captureSet}/`, import.meta.url);
const routes = [
  { name: 'home', path: '/' },
  { name: 'brief', path: '/brief.html' },
  { name: 'direction', path: '/direction.html' },
  { name: 'build', path: '/build.html' },
  { name: 'curation', path: '/curation.html' },
  { name: 'care', path: '/care.html' },
  { name: 'stories', path: '/stories.html' },
  { name: 'edit', path: '/edit.html' },
  { name: 'partnership', path: '/partnership.html' },
  { name: 'about', path: '/about.html' },
  { name: 'apply', path: '/apply.html?service=brief' },
  { name: 'privacy', path: '/privacy.html' }
];
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'mobile-393', width: 393, height: 852 }
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      await page.route('**/api/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}'
      }));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const response = await page.goto(`${base}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: fileURLToPath(new URL(`${route.name}-${viewport.name}.png`, output)),
        fullPage: false
      });

      const metrics = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        };
        const controls = [...document.querySelectorAll('a[href],button,input,select,textarea,summary')].filter(visible);
        const smallTargets = controls.filter(element => {
          const style = getComputedStyle(element);
          const isInlineTextLink = element.tagName === 'A'
            && style.display === 'inline'
            && Boolean(element.closest('p,li,td,th,dd'));
          if (isInlineTextLink) return false;
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).length;
        return {
          title: document.title,
          h1: document.querySelectorAll('h1').length,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          smallTargets,
          runningAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
          resourceCount: performance.getEntriesByType('resource').length,
          transferSize: performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
          imageTransferSize: performance.getEntriesByType('resource')
            .filter(entry => entry.initiatorType === 'img')
            .reduce((sum, entry) => sum + (entry.transferSize || 0), 0)
        };
      });

      results.push({
        route: route.path,
        viewport,
        status: response?.status() ?? null,
        errors,
        ...metrics
      });
      await page.close();
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(fileURLToPath(new URL('metrics.json', output)), JSON.stringify({
  capturedAt: new Date().toISOString(),
  base,
  results
}, null, 2));

console.log(JSON.stringify({
  renders: results.length,
  badStatus: results.filter(result => result.status !== 200).length,
  consoleErrors: results.reduce((sum, result) => sum + result.errors.length, 0),
  overflow: results.filter(result => result.overflow).length
}, null, 2));

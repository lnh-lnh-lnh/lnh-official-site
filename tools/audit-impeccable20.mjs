import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const require = createRequire('/Users/lnh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const { chromium } = require('playwright');

const base = process.env.LNH_BASE_URL || 'http://127.0.0.1:4175';
const routes = [
  'index', 'brief', 'direction', 'build', 'curation', 'care', 'edit',
  'partnership', 'about', 'stories', 'privacy', 'apply', 'brief-survey'
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 393, height: 852 }
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.route('**/api/**', request => request.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      const response = await page.goto(`${base}/${route}.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      const audit = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        };
        const color = value => {
          const match = value.match(/[\d.]+/g)?.map(Number) || [];
          return match.length >= 3 ? match.slice(0, 3) : null;
        };
        const channel = value => {
          const normalized = value / 255;
          return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
        };
        const luminance = rgb => .2126 * channel(rgb[0]) + .7152 * channel(rgb[1]) + .0722 * channel(rgb[2]);
        const ratio = (front, back) => {
          const a = luminance(front);
          const b = luminance(back);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        const background = element => {
          let current = element;
          while (current) {
            const parsed = color(getComputedStyle(current).backgroundColor);
            const alpha = Number(getComputedStyle(current).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1);
            if (parsed && alpha > .95) return parsed;
            current = current.parentElement;
          }
          return [255, 255, 255];
        };
        const label = element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 3).map(name => `.${name}`).join('')}`;
        const textElements = [...document.querySelectorAll('p,li,a,button,label,small,span,figcaption,summary,dt,dd,td,th')]
          .filter(element => visible(element) && element.textContent.trim());
        const tiny = textElements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 11)
          .slice(0, 30).map(element => ({ selector: label(element), size: getComputedStyle(element).fontSize, text: element.textContent.trim().slice(0, 50) }));
        const contrast = textElements.map(element => {
          const style = getComputedStyle(element);
          const layeredHero = element.closest('.edit-commerce-hero');
          const hasVisualOverlay = layeredHero
            && getComputedStyle(layeredHero, '::after').backgroundImage !== 'none';
          if (hasVisualOverlay) return null;
          const front = color(style.color);
          const back = background(element);
          const fontSize = parseFloat(style.fontSize);
          const fontWeight = Number(style.fontWeight) || 400;
          const required = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
          return {
            selector: label(element),
            value: front && ratio(front, back),
            required,
            foreground: style.color,
            background: `rgb(${back.join(' ')})`,
            context: label(element.parentElement || element),
            text: element.textContent.trim().slice(0, 50)
          };
        }).filter(item => item?.value && item.value + .02 < item.required).slice(0, 40);
        const controls = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[role="button"]')].filter(visible);
        const smallTargets = controls.filter(element => {
          const style = getComputedStyle(element);
          const isInlineTextLink = element.tagName === 'A'
            && style.display === 'inline'
            && Boolean(element.closest('p,li,td,th,dd'));
          if (isInlineTextLink) return false;
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).slice(0, 40).map(element => {
          const rect = element.getBoundingClientRect();
          return { selector: label(element), width: Math.round(rect.width), height: Math.round(rect.height), text: element.textContent.trim().slice(0, 40) };
        });
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          h1: document.querySelectorAll('main h1').length,
          tiny,
          contrast,
          smallTargets,
          animations: document.getAnimations().filter(animation => animation.playState === 'running').length,
          resources: performance.getEntriesByType('resource').length,
          transferSize: performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
          imageTransferSize: performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'img').reduce((sum, entry) => sum + (entry.transferSize || 0), 0)
        };
      });

      results.push({ route, viewport: viewport.name, status: response?.status() ?? null, ...audit });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile('comparison/impeccable20/audit.json', JSON.stringify({ capturedAt: new Date().toISOString(), base, results }, null, 2));
console.log(JSON.stringify({
  renders: results.length,
  badStatus: results.filter(item => item.status !== 200).length,
  overflow: results.filter(item => item.overflow).length,
  missingH1: results.filter(item => item.h1 !== 1).length,
  tiny: results.reduce((sum, item) => sum + item.tiny.length, 0),
  contrast: results.reduce((sum, item) => sum + item.contrast.length, 0),
  smallTargets: results.reduce((sum, item) => sum + item.smallTargets.length, 0),
  animations: results.reduce((sum, item) => sum + item.animations, 0)
}, null, 2));
